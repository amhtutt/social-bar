// ─────────────────────────────────────────────────────────────────────────────
// functions/index.js  —  Server-side order validation
//
// validateOrderOnCreate fires whenever a new orders/{orderId} document is
// created (by a customer tablet OR by staff via createOrderForTable — both
// write to the same collection). It re-derives what each line item's
// unitPrice SHOULD be from the actual current menuItems documents, and
// compares that against what the client submitted.
//
// Why this matters: every price calculation in this app today happens
// CLIENT-SIDE (lib/CartContext.jsx, lib/venueConfig.js) and is trusted at
// face value when written to Firestore. A modified client — someone
// editing the JS in DevTools, or hitting the Firestore REST API directly
// — could submit unitPrice: 0.01 regardless of what the menu actually
// says, and nothing before this function would catch it.
//
// DESIGN DECISION: flag, don't block or auto-correct.
// This function does NOT delete the order, reject the write, or silently
// fix the price. A false positive (e.g. a legitimate price change that
// landed in a race with an in-flight order) blocking or silently altering
// a real order mid-service would be worse than letting a rare bad actor
// through undetected for a few minutes. Instead, on a mismatch it:
//   1. Writes priceValidation: { status: "mismatch", mismatches: [...] }
//      onto the order itself, so it's visible in any future admin view
//   2. Logs an activityLog entry with action "price_validation_failed",
//      visible immediately on the existing Floor View Activity Log tab
// Orders that pass validation get priceValidation: { status: "ok" }.
//
// Tolerance: prices are compared with a small epsilon (0.01) to avoid
// flagging harmless floating-point rounding differences between client
// and server arithmetic.
// ─────────────────────────────────────────────────────────────────────────────

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const PRICE_EPSILON = 0.01;

/**
 * computeExpectedUnitPrice(menuItemData, selectedModifiers)
 * Mirrors the EXACT same math as lib/menuService.js's
 * calculateModifiersPriceDelta() + the client's unitPrice derivation in
 * lib/CartContext.jsx — base price plus the sum of each selected
 * modifier's priceDelta, looked up fresh from the menu item's CURRENT
 * modifierGroups (not trusting the priceDelta the client already
 * attached to each selectedModifiers entry).
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

  const mismatches = [];
  const items = order.items ?? [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Combos and any item without an itemId shouldn't crash validation
    // for the whole order — skip anything we can't look up.
    if (!item.itemId) continue;

    let menuItemSnap;
    try {
      menuItemSnap = await db.collection("menuItems").doc(item.itemId).get();
    } catch (err) {
      console.error(`[validateOrderOnCreate] Failed to read menuItems/${item.itemId}:`, err);
      continue;
    }

    if (!menuItemSnap.exists) {
      // Item was deleted (soft-delete still keeps the doc, so this means
      // a genuinely missing/bad itemId) — flag it, since price can't be
      // verified against nothing.
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

  await snap.ref.update({ priceValidation });

  if (mismatches.length > 0) {
    console.warn(`[validateOrderOnCreate] Price mismatch on order ${orderId}:`, mismatches);

    const summary = mismatches
      .map((m) =>
        m.issue === "price_mismatch"
          ? `${m.name_en}: submitted $${m.submittedUnitPrice?.toFixed(2)}, expected $${m.expectedUnitPrice?.toFixed(2)}`
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
