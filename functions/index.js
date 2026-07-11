// ─────────────────────────────────────────────────────────────────────────────
// functions/index.js  —  Server-side order validation
//
// validateOrderOnCreate fires whenever a new orders/{orderId} document is
// created (by a customer tablet OR by staff via createOrderForTable — both
// write to the same collection). It re-derives what each line item's
// unitPrice SHOULD be from the actual current menuItems documents, and
// compares that against what the client submitted.
//
// DESIGN DECISION: flag, don't block or auto-correct. On a mismatch it:
//   1. Writes priceValidation: { status: "mismatch", mismatches: [...] }
//      onto the order itself (clients cannot spoof a lasting result —
//      this function runs on every create and overwrites the field,
//      using the Admin SDK which bypasses Firestore rules)
//   2. Logs an activityLog entry with action "price_validation_failed"
// Orders that pass validation get priceValidation: { status: "ok" }.
//
// CHANGES from the previous version:
//   • All menuItems reads for an order now happen in ONE batched
//     db.getAll() call instead of N sequential awaits — faster and
//     cheaper on multi-item orders.
//   • Mismatch summary formatting no longer assumes USD cents:
//     amounts are printed as locale-grouped integers, e.g. "12,500 MMK".
//   • snap.ref.update is wrapped so a transient failure is logged
//     rather than crashing the invocation silently.
//
// KNOWN GAPS (accepted for now, revisit later):
//   • Combo items (no itemId) are skipped — combo pricing unvalidated.
//   • Only fires on CREATE; staff edits to an existing order's items
//     are not re-validated.
//   • Validates unitPrice per line, not order-level totals/tax/service.
// ─────────────────────────────────────────────────────────────────────────────

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const PRICE_EPSILON = 0.01;

function formatAmount(n) {
  if (typeof n !== "number" || !isFinite(n)) return String(n);
  return `${Math.round(n).toLocaleString("en-US")} MMK`;
}

/**
 * computeExpectedUnitPrice(menuItemData, selectedModifiers)
 * Mirrors the same math as the client's unitPrice derivation — base price
 * plus the sum of each selected modifier's priceDelta, looked up fresh
 * from the menu item's CURRENT modifierGroups (never trusting the
 * priceDelta the client attached to selectedModifiers entries).
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

exports.validateOrderOnCreate = onDocumentCreated("orders/{orderId}", async (event) => {
  const snap = event.data;
  if (!snap) return;

  const order = snap.data();
  const orderId = event.params.orderId;

  const items = order.items ?? [];
  const mismatches = [];

  // Batch-read every referenced menu item in one round trip.
  // Combos and any item without an itemId are skipped (can't be looked up).
  const lookups = items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => !!item.itemId);

  let menuSnaps = [];
  if (lookups.length > 0) {
    const refs = lookups.map(({ item }) => db.collection("menuItems").doc(item.itemId));
    try {
      menuSnaps = await db.getAll(...refs);
    } catch (err) {
      console.error(`[validateOrderOnCreate] getAll failed for order ${orderId}:`, err);
      return; // can't validate anything this run; leave order untouched
    }
  }

  for (let k = 0; k < lookups.length; k++) {
    const { item, i } = lookups[k];
    const menuItemSnap = menuSnaps[k];

    if (!menuItemSnap.exists) {
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

    const menuItemData = menuItemSnap.data();

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

  const priceValidation =
    mismatches.length === 0
      ? { status: "ok", checkedAt: FieldValue.serverTimestamp() }
      : { status: "mismatch", mismatches, checkedAt: FieldValue.serverTimestamp() };

  try {
    await snap.ref.update({ priceValidation });
  } catch (err) {
    console.error(`[validateOrderOnCreate] Failed to write priceValidation on ${orderId}:`, err);
  }

  if (mismatches.length > 0) {
    console.warn(`[validateOrderOnCreate] Price mismatch on order ${orderId}:`, mismatches);

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
      details: `Order #${order.orderNumber ?? orderId}: ${summary}`,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
});
