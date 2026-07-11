// ─────────────────────────────────────────────────────────────────────────────
// lib/orderService.js  —  Ordering Module: data layer (venue-scoped)
//
// Collections:
//   orders/{orderId}
//     venueId, tableNumber, tabletSlot, orderNumber, createdByUid,
//     items: [{
//       itemId, name_en, name_mm, basePrice, unitPrice, quantity,
//       selectedModifiers: [{groupId, groupName_en, optionId, optionName_en, priceDelta}],
//       specialInstructions
//     }],
//     subtotal, taxAmount, serviceChargeAmount, totalPrice,
//     status, source, createdAt
//     priceValidation  — written ONLY by the price-validation Cloud
//                        Function (clients are blocked by rules)
//
//   billRequests/{id}
//     venueId, tableNumber, tabletSlot, totalDue, createdByUid, status, createdAt
//
// ORDER STATUS lifecycle:
//   pending    → just placed, on the bill, shows on Kitchen
//   completed  → kitchen marked it made + delivered; STAYS on the bill
//   cancelled  → kitchen dismissed it (out of stock / mistake); DROPS off
//                the bill and all live views, but the record survives for
//                shift reports
//
// SECURITY (pairs with the hardened firestore.rules + lib/customerAuth.js):
//   • Customer paths sign in anonymously (ensureCustomerAuth) before any
//     read or write.
//   • Every created order/billRequest carries createdByUid.
//   • The idempotent re-submit path handles customers being able to
//     create-but-never-update orders (a rejected retry is verified with a
//     read-back).
//   • Restore/undo functions preserve createdByUid and priceValidation.
//
// Tax/service charge is snapshotted per order at submit time — a
// deliberate snapshot, not a live recalculation. No tipping fields exist.
// `source` is "customer" (tablet) or "staff" (created via /staff).
// Every mutating staff action writes one best-effort activityLog entry.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { ensureCustomerAuth } from "./customerAuth";
import { logActivity } from "./activityLogService";
import { calculateOrderTotals } from "./venueConfig";

async function safeLog(entry) {
  try {
    await logActivity(entry);
  } catch (err) {
    console.error("[orderService] Failed to write activity log entry:", err);
  }
}

function generateOrderNumber() {
  const timePart = Date.now().toString().slice(-4);
  const randomPart = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");
  return `${timePart}${randomPart}`;
}

function recomputeItemsSubtotal(items) {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

/**
 * isActiveOrder(order)
 * The single source of truth for "should this order show in live views
 * and count toward the bill." An order drops out of every active view —
 * customer Bill tab, Floor View, Kitchen — the moment it's either:
 *   • settled  (tab closed / paid), or
 *   • cancelled (kitchen dismissed it: can't/won't make it)
 * Both are kept in Firestore for shift reports; they're just filtered out
 * of anything live. Centralizing this here means Kitchen "Dismiss"
 * removes the order from the bill automatically, with no change needed in
 * the customer or Floor View code.
 */
export function isActiveOrder(order) {
  return !order.settledAt && order.status !== "cancelled";
}

// Settled/cancelled orders and acknowledged bill requests are never
// deleted (kept for shift reports), so a venue-wide query with no bound
// would re-download the venue's ENTIRE history on every snapshot forever.
// Live staff views (Floor View, Kitchen) only ever need "what's active
// right now," and in practice a table's tab closes same-day — so venue-
// wide subscriptions are time-boxed to a trailing window as a growth
// cap, not a correctness filter. A tab still open past this window stays
// findable via the Firestore console until Reports (roadmap ④) exists;
// per-table customer subscriptions are unaffected (naturally bounded by
// one table's history, not the whole venue's).
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;

function recentWindowStart() {
  return Timestamp.fromMillis(Date.now() - RECENT_WINDOW_MS);
}

// ─── Orders ───────────────────────────────────────────────────────────────────

/**
 * submitOrder({ venueId, tableNumber, tabletSlot, items, pricing, idempotencyKey })
 * `items` come from the cart, each already carrying unitPrice. `pricing`
 * is the venue's current tax/service config — snapshotted permanently.
 *
 * idempotencyKey (optional but strongly recommended): a client-generated
 * unique string, one per "checkout attempt" — NOT regenerated on retry.
 * When provided, it becomes the Firestore document ID directly.
 *
 * RULES-AWARE RETRY: customers can create orders but never update them,
 * so a second setDoc of the same key gets rejected with permission-denied
 * WHEN THE FIRST WRITE ALREADY LANDED. That rejection is therefore proof
 * of success: we confirm by reading the doc back and return normally.
 * Genuine failures (offline, misconfig) still throw.
 */
export async function submitOrder({ venueId, tableNumber, tabletSlot, items, pricing, idempotencyKey }) {
  const user = await ensureCustomerAuth();

  const subtotal = recomputeItemsSubtotal(items);
  const totals = calculateOrderTotals(subtotal, pricing);
  const orderNumber = generateOrderNumber();

  const orderData = {
    venueId,
    tableNumber,
    tabletSlot,
    orderNumber,
    createdByUid: user.uid,
    items,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    serviceChargeAmount: totals.serviceChargeAmount,
    totalPrice: totals.totalPrice,
    status: "pending",
    source: "customer",
    createdAt: serverTimestamp(),
  };

  if (!idempotencyKey) {
    const ref = await addDoc(collection(db, "orders"), orderData);
    return { ref, orderNumber };
  }

  const ref = doc(db, "orders", idempotencyKey);
  try {
    await setDoc(ref, orderData, { merge: false });
    return { ref, orderNumber };
  } catch (err) {
    if (err?.code === "permission-denied") {
      const existing = await getDoc(ref);
      if (existing.exists()) {
        return { ref, orderNumber: existing.data().orderNumber ?? orderNumber };
      }
    }
    throw err;
  }
}

/**
 * subscribeToTableOrders(venueId, tableNumber, callback)
 * Composite index required: venueId (==) + tableNumber (==) + createdAt (asc).
 *
 * Customer-facing (Bill tab): ensures anonymous auth is established
 * BEFORE attaching the listener. Filters to active orders only (settled
 * and cancelled drop off).
 */
export function subscribeToTableOrders(venueId, tableNumber, callback) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  let unsubscribe = null;
  let cancelled = false;

  ensureCustomerAuth()
    .then(() => {
      if (cancelled) return;
      const q = query(
        collection(db, "orders"),
        where("venueId", "==", venueId),
        where("tableNumber", "==", tableNumber),
        orderBy("createdAt", "asc")
      );
      unsubscribe = onSnapshot(
        q,
        (snap) => callback({ data: snap.docs.map(orderDocToEntry).filter(isActiveOrder), error: null }),
        (err) => callback({ data: [], error: err })
      );
    })
    .catch((err) => callback({ data: [], error: err }));

  return () => {
    cancelled = true;
    if (unsubscribe) unsubscribe();
  };
}

/**
 * subscribeToVenueOrders(venueId, callback)
 * Composite index required: venueId (==) + createdAt (desc).
 * Staff-only (Floor View / Kitchen). Same active-order filtering, plus
 * the RECENT_WINDOW_MS growth cap (see comment above isActiveOrder).
 */
export function subscribeToVenueOrders(venueId, callback) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  const q = query(
    collection(db, "orders"),
    where("venueId", "==", venueId),
    where("createdAt", ">=", recentWindowStart()),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => callback({ data: snap.docs.map(orderDocToEntry).filter(isActiveOrder), error: null }),
    (err) => callback({ data: [], error: err })
  );
}

function orderDocToEntry(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    venueId: d.venueId,
    tableNumber: d.tableNumber,
    tabletSlot: d.tabletSlot,
    orderNumber: d.orderNumber ?? null,
    createdByUid: d.createdByUid ?? null,
    items: d.items ?? [],
    subtotal: d.subtotal ?? d.totalPrice ?? 0,
    taxAmount: d.taxAmount ?? 0,
    serviceChargeAmount: d.serviceChargeAmount ?? 0,
    totalPrice: d.totalPrice ?? 0,
    status: d.status ?? "pending",
    source: d.source ?? "customer",
    priceValidation: d.priceValidation ?? null,
    createdAt: d.createdAt?.toDate?.() ?? null,
    settledAt: d.settledAt?.toDate?.() ?? null,
  };
}

export async function updateOrderStatus(orderId, status) {
  const ref = doc(db, "orders", orderId);
  return updateDoc(ref, { status, updatedAt: serverTimestamp() });
}

// ─── Kitchen actions (Finished / Dismiss) ─────────────────────────────────────
//
// Both are STATUS changes, never deletes — which is exactly what the
// kitchen role is allowed to do under the hardened rules (kitchen may
// update only `status` + `updatedAt`). `actor` shape: { email, role }.

/**
 * markOrderCompleted(orderId, { venueId, tableNumber, orderNumber }, actor)
 * Kitchen tapped "Finished": the order is made and delivered. It leaves
 * the Kitchen screen (Kitchen shows only pending) but STAYS on the bill —
 * completed orders are still active, the customer ate them.
 */
export async function markOrderCompleted(orderId, orderInfo, actor) {
  await updateDoc(doc(db, "orders", orderId), {
    status: "completed",
    updatedAt: serverTimestamp(),
  });

  await safeLog({
    venueId: orderInfo.venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "order_completed",
    tableNumber: orderInfo.tableNumber,
    details: `Kitchen finished order #${orderInfo.orderNumber ?? orderId}`,
  });
}

/**
 * cancelOrderFromKitchen(orderId, { venueId, tableNumber, orderNumber }, actor)
 * Kitchen tapped "Dismiss": can't or won't make this (out of stock,
 * mistaken order). Status → cancelled, which drops it from the bill and
 * every live view via isActiveOrder(). NOT a delete — it stays queryable
 * for shift reports, and the activity log tells front-of-house it
 * happened so they can inform the table.
 */
export async function cancelOrderFromKitchen(orderId, orderInfo, actor) {
  await updateDoc(doc(db, "orders", orderId), {
    status: "cancelled",
    updatedAt: serverTimestamp(),
  });

  await safeLog({
    venueId: orderInfo.venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "order_cancelled",
    tableNumber: orderInfo.tableNumber,
    details: `Kitchen dismissed order #${orderInfo.orderNumber ?? orderId} (removed from bill)`,
  });
}

/**
 * uncancelOrder(orderId, { venueId, tableNumber, orderNumber }, actor)
 * Undo for a Dismiss (and for Finished, if ever needed) — puts the order
 * back to pending so it returns to the Kitchen screen and the bill.
 * Powers the brief in-screen "Undo" after a dismissal.
 */
export async function uncancelOrder(orderId, orderInfo, actor) {
  await updateDoc(doc(db, "orders", orderId), {
    status: "pending",
    updatedAt: serverTimestamp(),
  });

  await safeLog({
    venueId: orderInfo.venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "order_restored",
    tableNumber: orderInfo.tableNumber,
    details: `Restored order #${orderInfo.orderNumber ?? orderId} to the kitchen`,
  });
}

// ─── Server actions: add / edit / remove / void ──────────────────────────────

function recomputeOrderTotals(items, existingOrder) {
  const subtotal = recomputeItemsSubtotal(items);
  // Reconstruct the effective tax/service rate from the order's OWN
  // stored amounts rather than re-reading venue config, so an edit
  // doesn't change the rate applied to an order placed under a
  // different historical rate. Falls back to 0% if the prior subtotal
  // is missing/zero/non-finite — calculateOrderTotals() itself also
  // guards against NaN/negative inputs as a second layer.
  const priorSubtotal = existingOrder.subtotal;
  const hasValidPriorSubtotal = Number.isFinite(priorSubtotal) && priorSubtotal > 0;

  const impliedPricing = {
    taxRatePercent: hasValidPriorSubtotal ? ((existingOrder.taxAmount ?? 0) / priorSubtotal) * 100 : 0,
    serviceChargeRatePercent: hasValidPriorSubtotal
      ? ((existingOrder.serviceChargeAmount ?? 0) / priorSubtotal) * 100
      : 0,
    taxInclusive: false,
  };
  return calculateOrderTotals(subtotal, impliedPricing);
}

/**
 * buildRestorePayload(snapshot, actor)
 * Shared by restoreRemovedItem / restoreVoidedOrder. The rules treat
 * createdByUid and priceValidation as immutable on updates, and
 * setDoc(merge:false) REMOVES any field not present in the payload —
 * which would count as changing it and get the whole write rejected.
 * So restores must carry those fields forward from the pre-action
 * snapshot, exactly as they were (or omit them if the snapshot never
 * had them, e.g. legacy orders from before this migration).
 */
function buildRestorePayload(snapshot, actor) {
  return {
    venueId: snapshot.venueId,
    tableNumber: snapshot.tableNumber,
    tabletSlot: snapshot.tabletSlot,
    orderNumber: snapshot.orderNumber,
    items: snapshot.items,
    subtotal: snapshot.subtotal,
    taxAmount: snapshot.taxAmount,
    serviceChargeAmount: snapshot.serviceChargeAmount,
    totalPrice: snapshot.totalPrice,
    status: snapshot.status,
    source: snapshot.source,
    ...(snapshot.createdByUid != null && { createdByUid: snapshot.createdByUid }),
    ...(snapshot.priceValidation != null && { priceValidation: snapshot.priceValidation }),
    lastEditedBy: actor?.email ?? null,
    updatedAt: serverTimestamp(),
  };
}

/**
 * removeItemFromOrder(orderId, currentOrder, itemIndexToRemove, venueId, tableNumber, actor)
 * currentOrder is the FULL order entry (not just its items array) — needed
 * to reconstruct the tax/service rate for recomputation.
 */
export async function removeItemFromOrder(orderId, currentOrder, itemIndexToRemove, venueId, tableNumber, actor) {
  const removedItem = currentOrder.items[itemIndexToRemove];
  const updatedItems = currentOrder.items.filter((_, i) => i !== itemIndexToRemove);

  if (updatedItems.length === 0) {
    await deleteDoc(doc(db, "orders", orderId));
  } else {
    const totals = recomputeOrderTotals(updatedItems, currentOrder);
    await updateDoc(doc(db, "orders", orderId), {
      items: updatedItems,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      serviceChargeAmount: totals.serviceChargeAmount,
      totalPrice: totals.totalPrice,
      lastEditedBy: actor?.email ?? null,
      updatedAt: serverTimestamp(),
    });
  }

  await safeLog({
    venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "item_removed",
    tableNumber,
    details: removedItem ? `Removed ${removedItem.name_en} (x${removedItem.quantity})` : "Removed an item",
  });
}

/**
 * restoreRemovedItem(orderId, previousOrderSnapshot, actor)
 * Undo for removeItemFromOrder().
 */
export async function restoreRemovedItem(orderId, previousOrderSnapshot, actor) {
  const ref = doc(db, "orders", orderId);
  await setDoc(ref, buildRestorePayload(previousOrderSnapshot, actor), { merge: false });

  await safeLog({
    venueId: previousOrderSnapshot.venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "item_removal_undone",
    tableNumber: previousOrderSnapshot.tableNumber,
    details: "Restored a removed item",
  });
}

/**
 * updateItemQuantity(orderId, currentOrder, itemIndex, newQuantity, venueId, tableNumber, actor)
 */
export async function updateItemQuantity(orderId, currentOrder, itemIndex, newQuantity, venueId, tableNumber, actor) {
  const item = currentOrder.items[itemIndex];
  if (!item) return;

  if (newQuantity <= 0) {
    return removeItemFromOrder(orderId, currentOrder, itemIndex, venueId, tableNumber, actor);
  }

  const oldQuantity = item.quantity;
  const updatedItems = currentOrder.items.map((it, i) => (i === itemIndex ? { ...it, quantity: newQuantity } : it));
  const totals = recomputeOrderTotals(updatedItems, currentOrder);

  await updateDoc(doc(db, "orders", orderId), {
    items: updatedItems,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    serviceChargeAmount: totals.serviceChargeAmount,
    totalPrice: totals.totalPrice,
    lastEditedBy: actor?.email ?? null,
    updatedAt: serverTimestamp(),
  });

  await safeLog({
    venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "item_quantity_changed",
    tableNumber,
    details: `${item.name_en}: ${oldQuantity} → ${newQuantity}`,
  });
}

/**
 * voidOrder(orderId, venueId, tableNumber, actor, orderSummary)
 */
export async function voidOrder(orderId, venueId, tableNumber, actor, orderSummary) {
  await deleteDoc(doc(db, "orders", orderId));

  await safeLog({
    venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "order_voided",
    tableNumber,
    details: orderSummary ? `Voided order (${orderSummary})` : "Voided an order",
  });
}

/**
 * restoreVoidedOrder(orderId, voidedOrderSnapshot, actor)
 * Undo for voidOrder(). Recreates the document at the SAME id.
 */
export async function restoreVoidedOrder(orderId, voidedOrderSnapshot, actor) {
  const ref = doc(db, "orders", orderId);
  await setDoc(
    ref,
    {
      ...buildRestorePayload(voidedOrderSnapshot, actor),
      createdAt: serverTimestamp(), // best-effort — original createdAt isn't preserved across a delete
    },
    { merge: false }
  );

  await safeLog({
    venueId: voidedOrderSnapshot.venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "order_void_undone",
    tableNumber: voidedOrderSnapshot.tableNumber,
    details: "Restored a voided order",
  });
}

/**
 * createOrderForTable({ venueId, tableNumber, items, pricing, actor, idempotencyKey })
 * Staff are signed in via AuthContext, so createdByUid is the staff uid.
 */
export async function createOrderForTable({ venueId, tableNumber, items, pricing, actor, idempotencyKey }) {
  const subtotal = recomputeItemsSubtotal(items);
  const totals = calculateOrderTotals(subtotal, pricing);
  const orderNumber = generateOrderNumber();

  const orderData = {
    venueId,
    tableNumber,
    tabletSlot: null,
    orderNumber,
    createdByUid: auth.currentUser?.uid ?? null,
    items,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    serviceChargeAmount: totals.serviceChargeAmount,
    totalPrice: totals.totalPrice,
    status: "pending",
    source: "staff",
    createdByEmail: actor?.email ?? null,
    createdAt: serverTimestamp(),
  };

  let ref;
  if (idempotencyKey) {
    ref = doc(db, "orders", idempotencyKey);
    try {
      await setDoc(ref, orderData, { merge: false });
    } catch (err) {
      if (err?.code === "permission-denied") {
        const existing = await getDoc(ref);
        if (!existing.exists()) throw err;
      } else {
        throw err;
      }
    }
  } else {
    ref = await addDoc(collection(db, "orders"), orderData);
  }

  await safeLog({
    venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "order_created",
    tableNumber,
    details: `Added order (${items.length} item${items.length === 1 ? "" : "s"}, $${totals.totalPrice.toFixed(2)})`,
  });

  return { ref, orderNumber };
}

// ─── Bill Requests (Checkout) ─────────────────────────────────────────────────

export async function requestBill({ venueId, tableNumber, tabletSlot, totalDue }) {
  const user = await ensureCustomerAuth();
  return addDoc(collection(db, "billRequests"), {
    venueId,
    tableNumber,
    tabletSlot,
    totalDue,
    createdByUid: user.uid,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

/**
 * subscribeToTableBillRequest(venueId, tableNumber, callback)
 * Composite index required: venueId (==) + tableNumber (==) + createdAt (desc).
 * Customer-facing — same auth-before-listen pattern as subscribeToTableOrders.
 */
export function subscribeToTableBillRequest(venueId, tableNumber, callback) {
  if (!venueId) {
    callback({ data: null, error: null });
    return () => {};
  }

  let unsubscribe = null;
  let cancelled = false;

  ensureCustomerAuth()
    .then(() => {
      if (cancelled) return;
      const q = query(
        collection(db, "billRequests"),
        where("venueId", "==", venueId),
        where("tableNumber", "==", tableNumber),
        orderBy("createdAt", "desc")
      );
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const docs = snap.docs.map(billRequestDocToEntry);
          callback({ data: docs[0] ?? null, error: null });
        },
        (err) => callback({ data: null, error: err })
      );
    })
    .catch((err) => callback({ data: null, error: err }));

  return () => {
    cancelled = true;
    if (unsubscribe) unsubscribe();
  };
}

function billRequestDocToEntry(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    venueId: d.venueId,
    tableNumber: d.tableNumber,
    tabletSlot: d.tabletSlot,
    totalDue: d.totalDue ?? 0,
    status: d.status ?? "pending",
    createdAt: d.createdAt?.toDate?.() ?? null,
  };
}

/**
 * subscribeToVenueBillRequests(venueId, callback)
 * Composite index required: venueId (==) + createdAt (desc). Staff-only.
 * Same RECENT_WINDOW_MS growth cap as subscribeToVenueOrders.
 */
export function subscribeToVenueBillRequests(venueId, callback) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  const q = query(
    collection(db, "billRequests"),
    where("venueId", "==", venueId),
    where("createdAt", ">=", recentWindowStart()),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => callback({ data: snap.docs.map(billRequestDocToEntry), error: null }),
    (err) => callback({ data: [], error: err })
  );
}

/**
 * acknowledgeBillRequest(requestId, venueId, tableNumber, actor)
 */
export async function acknowledgeBillRequest(requestId, venueId, tableNumber, actor) {
  await updateDoc(doc(db, "billRequests", requestId), {
    status: "acknowledged",
    updatedAt: serverTimestamp(),
  });

  await safeLog({
    venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "bill_acknowledged",
    tableNumber,
    details: "Marked bill request as handled",
  });
}

// ─── Close Tab (payment received) ──────────────────────────────────────────────
//
// DESIGN: settle, don't delete. Every active order gets a `settledAt`
// timestamp instead of being removed — active views filter these out, but
// the historical record survives for shift reports. Cancelled orders are
// already off the bill, so they're settled alongside the rest for a clean
// slate but excluded from the closed total (the customer isn't paying for
// something the kitchen dismissed). Staff action with a confirm step.

/**
 * closeTab({ venueId, tableNumber, actor })
 * Returns the total amount that was closed out, for the UI to show a
 * "Closed: $47.50" confirmation.
 */
export async function closeTab({ venueId, tableNumber, actor }) {
  const ordersQuery = query(
    collection(db, "orders"),
    where("venueId", "==", venueId),
    where("tableNumber", "==", tableNumber)
  );
  const ordersSnap = await getDocs(ordersQuery);

  const unsettledDocs = ordersSnap.docs.filter((d) => !d.data().settledAt);

  if (unsettledDocs.length === 0) {
    return { closedOrderCount: 0, closedTotal: 0 };
  }

  const batch = writeBatch(db);
  let closedTotal = 0;
  let billableCount = 0;

  for (const orderDoc of unsettledDocs) {
    const data = orderDoc.data();
    batch.update(orderDoc.ref, { settledAt: serverTimestamp() });
    // Cancelled orders get settled (cleared) but don't count toward the
    // bill — the table never owed for them.
    if (data.status !== "cancelled") {
      closedTotal += data.totalPrice ?? 0;
      billableCount++;
    }
  }

  const billRequestsQuery = query(
    collection(db, "billRequests"),
    where("venueId", "==", venueId),
    where("tableNumber", "==", tableNumber),
    where("status", "==", "pending")
  );
  const billRequestsSnap = await getDocs(billRequestsQuery);
  for (const reqDoc of billRequestsSnap.docs) {
    batch.update(reqDoc.ref, { status: "acknowledged", updatedAt: serverTimestamp() });
  }

  await batch.commit();

  await safeLog({
    venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "tab_closed",
    tableNumber,
    details: `Closed tab: ${billableCount} order${billableCount === 1 ? "" : "s"}, $${closedTotal.toFixed(2)}`,
  });

  return { closedOrderCount: billableCount, closedTotal };
}
