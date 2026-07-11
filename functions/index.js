// ─────────────────────────────────────────────────────────────────────────────
// functions/index.js  —  Server-side order price validation (scheduled sweep)
//
// WHY A SWEEP, NOT A TRIGGER: this project's Firestore databases (staging
// AND production) live in asia-southeast3, which does not support
// Firestore event triggers in either Cloud Functions generation — both
// onDocumentCreated (v2/Eventarc) and document().onCreate (v1) fail at
// deploy with "region not supported". Scheduled functions have no such
// dependency: they just run on a timer and use the Admin SDK, which works
// against any Firestore region. If/when Google adds trigger support for
// asia-southeast3, this can be converted back with no logic change.
//
// WHAT IT DOES: every 5 minutes, sweepOrderPriceValidation
//   1. Loads its cursor (last sweep time) from _system/priceValidationSweep
//   2. Queries orders created since (cursor − 5 min overlap buffer, so
//      serverTimestamp lag can never make an order slip between sweeps)
//   3. Skips orders that already carry priceValidation (from a previous
//      sweep inside the overlap window)
//   4. For each remaining order, re-derives every line item's unitPrice
//      from the CURRENT menuItems docs and compares to what was submitted
//   5. Stamps priceValidation: {status: "ok"} or {status: "mismatch",
//      mismatches: [...]} on each order, and writes an activityLog entry
//      with action "price_validation_failed" for any mismatch — visible
//      on the Floor View Activity Log tab
//   6. Advances the cursor
//
// DESIGN DECISION (unchanged): flag, don't block or auto-correct. Clients
// cannot spoof a lasting "ok" — Firestore rules block clients from ever
// writing priceValidation; only this function (Admin SDK bypasses rules)
// can author it. A sweep lag of ≤5 minutes changes nothing about that
// guarantee, since the field is a detection/audit signal, not a gate.
//
// Menu items are read once per sweep and cached across all orders in the
// batch, so a busy 5-minute window costs one read per distinct item, not
// one per order line.
// ─────────────────────────────────────────────────────────────────────────────

const functions = require("firebase-functions/v1");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const PRICE_EPSILON = 0.01;
const OVERLAP_MS = 5 * 60 * 1000;        // re-scan buffer behind the cursor
const FIRST_RUN_LOOKBACK_MS = 60 * 60 * 1000; // first ever run: last hour
const CURSOR_DOC = "_system/priceValidationSweep";
const BATCH_LIMIT = 500;

function formatAmount(n) {
  if (typeof n !== "number" || !isFinite(n)) return String(n);
  return `${Math.round(n).toLocaleString("en-US")} MMK`;
}

/**
 * computeExpectedUnitPrice(menuItemData, selectedModifiers)
 * Base price plus the sum of each selected modifier's priceDelta, looked
 * up fresh from the menu item's CURRENT modifierGroups (never trusting
 * the priceDelta the client attached to selectedModifiers entries).
 */
function computeExpectedUnitPrice(menuItemData, selectedModifiers) {
  const basePrice = menuItemData.price ?? 0;
  const modifiers = selectedModifiers ?? [];

  let modifiersTotal = 0;
  for (const submitted of modifiers) {
    const group = (menuItemData.modifierGroups ?? []).find((g) => g.id === submitted.groupId);
    if (!group) continue; // group no longer exists on this item — ignore, don't crash
    const option = group.options.find((o) => o.id === submitted.optionId);
    if (!option) continue;
    modifiersTotal += option.priceDelta ?? 0;
  }

  return basePrice + modifiersTotal;
}

/**
 * validateOrder(order, menuCache)
 * Returns the mismatches array for one order. menuCache maps
 * itemId -> menu item data | null (null = looked up, doesn't exist).
 * Missing cache entries are fetched in one batched getAll and cached.
 */
async function validateOrder(order, menuCache) {
  const items = order.items ?? [];
  const mismatches = [];

  const lookups = items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => !!item.itemId);

  // Fetch any items not yet in this sweep's cache, in one round trip.
  const uncachedIds = [...new Set(lookups.map(({ item }) => item.itemId))].filter(
    (id) => !(id in menuCache)
  );
  if (uncachedIds.length > 0) {
    const refs = uncachedIds.map((id) => db.collection("menuItems").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, idx) => {
      menuCache[uncachedIds[idx]] = snap.exists ? snap.data() : null;
    });
  }

  for (const { item, i } of lookups) {
    const menuItemData = menuCache[item.itemId];

    if (menuItemData === null) {
      // Soft-delete keeps docs, so a missing doc means a genuinely
      // bad/deleted itemId — flag it, price can't be verified.
      mismatches.push({
        itemIndex: i,
        itemId: item.itemId,
        name_en: item.name_en,
        issue: "menu_item_not_found",
        submittedUnitPrice: item.unitPrice,
      });
      continue;
    }

    // Venue mismatch is a more serious signal than a price typo — flag
    // distinctly in case this ever indicates a cross-venue data bug.
    if (menuItemData.venueId !== order.venueId) {
      mismatches.push({
        itemIndex: i,
        itemId: item.itemId,
        name_en: item.name_en,
        issue: "venue_mismatch",
        submittedUnitPrice: item.unitPrice,
      });
      continue;
    }

    const expectedUnitPrice = computeExpectedUnitPrice(menuItemData, item.selectedModifiers);
    const submittedUnitPrice = item.unitPrice ?? 0;

    if (Math.abs(expectedUnitPrice - submittedUnitPrice) > PRICE_EPSILON) {
      mismatches.push({
        itemIndex: i,
        itemId: item.itemId,
        name_en: item.name_en,
        issue: "price_mismatch",
        submittedUnitPrice,
        expectedUnitPrice,
      });
    }
  }

  return mismatches;
}

exports.sweepOrderPriceValidation = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const sweepStartedAt = Timestamp.now();

    // 1. Cursor
    const cursorRef = db.doc(CURSOR_DOC);
    const cursorSnap = await cursorRef.get();
    const lastRunAt = cursorSnap.exists
      ? cursorSnap.data().lastRunAt
      : Timestamp.fromMillis(Date.now() - FIRST_RUN_LOOKBACK_MS);

    const windowStart = Timestamp.fromMillis(lastRunAt.toMillis() - OVERLAP_MS);

    // 2. Orders created since the window start
    const ordersSnap = await db
      .collection("orders")
      .where("createdAt", ">=", windowStart)
      .orderBy("createdAt", "asc")
      .limit(BATCH_LIMIT)
      .get();

    const menuCache = {};
    let checked = 0;
    let flagged = 0;
    let lastSeenCreatedAt = null;

    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data();
      lastSeenCreatedAt = order.createdAt ?? lastSeenCreatedAt;

      // 3. Already validated in a previous sweep's overlap — skip.
      if (order.priceValidation) continue;

      // 4. Validate
      let mismatches;
      try {
        mismatches = await validateOrder(order, menuCache);
      } catch (err) {
        console.error(`[sweep] Validation failed for order ${orderDoc.id}:`, err);
        continue; // leave unstamped; next sweep's overlap retries it
      }

      // 5. Stamp + log
      const priceValidation =
        mismatches.length === 0
          ? { status: "ok", checkedAt: FieldValue.serverTimestamp() }
          : { status: "mismatch", mismatches, checkedAt: FieldValue.serverTimestamp() };

      try {
        await orderDoc.ref.update({ priceValidation });
      } catch (err) {
        console.error(`[sweep] Failed to write priceValidation on ${orderDoc.id}:`, err);
        continue;
      }

      checked++;

      if (mismatches.length > 0) {
        flagged++;
        console.warn(`[sweep] Price mismatch on order ${orderDoc.id}:`, mismatches);

        const summary = mismatches
          .map((m) =>
            m.issue === "price_mismatch"
              ? `${m.name_en}: submitted ${formatAmount(m.submittedUnitPrice)}, expected ${formatAmount(m.expectedUnitPrice)}`
              : `${m.name_en}: ${m.issue}`
          )
          .join("; ");

        await db.collection("activityLog").add({
          venueId: order.venueId,
          actorEmail: order.source === "staff" ? order.createdByEmail ?? "unknown" : "customer-tablet",
          actorRole: order.source === "staff" ? "staff" : "customer",
          action: "price_validation_failed",
          tableNumber: order.tableNumber,
          details: `Order #${order.orderNumber ?? orderDoc.id}: ${summary}`,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // 6. Advance cursor. If this batch hit BATCH_LIMIT, the window might
    // hold more orders than we fetched — advancing to "now" would let
    // whatever's past the cutoff slip past every future sweep (the query
    // is createdAt >= cursor, so orders never get a second chance once
    // the cursor passes them). Instead advance only to the last order we
    // actually saw; the next sweep's overlap re-covers the rest of the
    // window and the "already validated" skip keeps it cheap.
    const hitLimit = ordersSnap.size === BATCH_LIMIT;
    const nextCursor = hitLimit && lastSeenCreatedAt ? lastSeenCreatedAt : sweepStartedAt;

    await cursorRef.set({ lastRunAt: nextCursor, updatedAt: FieldValue.serverTimestamp() });

    console.log(
      `[sweep] Done. Scanned ${ordersSnap.size}, validated ${checked}, flagged ${flagged}${hitLimit ? " (hit batch limit, cursor held back)" : ""}.`
    );
    return null;
  });
