// ─────────────────────────────────────────────────────────────────────────────
// lib/orderService.js  —  Ordering Module: data layer (venue-scoped)
//
// Collections:
//   orders/{orderId}
//     venueId, tableNumber, tabletSlot, orderNumber,
//     items: [{
//       itemId, name_en, name_mm, basePrice, unitPrice, quantity,
//       selectedModifiers: [{groupId, groupName_en, optionId, optionName_en, priceDelta}],
//       specialInstructions
//     }],
//     subtotal, taxAmount, serviceChargeAmount, totalPrice,
//     status, source, createdAt
//
//   billRequests/{id}
//     venueId, tableNumber, tabletSlot, totalDue, status, createdAt
//
// The bill for a table is still derived (not stored separately) by
// querying all orders matching venueId + tableNumber.
//
// Tax/service charge: every order stores its own subtotal/taxAmount/
// serviceChargeAmount/totalPrice, calculated ONCE at submit time using
// lib/venueConfig.js's calculateOrderTotals() against the venue's pricing
// config at that moment. This is a deliberate snapshot, not a live
// recalculation — if a venue changes its tax rate later, past orders keep
// the rate that was in effect when they were placed.
//
// No tipping fields exist anywhere in this system. Tips are cash, handled
// directly between customer and server, and never touch the app.
//
// `source` on an order is "customer" (submitted from a tablet) or "staff"
// (created by a server/manager on the table's behalf via /staff).
//
// orderNumber is a short, customer-facing number (NOT the Firestore doc
// id) shown on the order confirmation screen and the bill.
//
// Every mutating staff action writes one entry to activityLog. Logging is
// best-effort — a failure is caught and reported but never blocks the
// actual order mutation.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
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

// ─── Orders ───────────────────────────────────────────────────────────────────

/**
 * submitOrder({ venueId, tableNumber, tabletSlot, items, pricing, idempotencyKey })
 * `items` come from the cart, each already carrying unitPrice. `pricing`
 * is the venue's current tax/service config — snapshotted permanently.
 *
 * idempotencyKey (optional but strongly recommended): a client-generated
 * unique string, one per "checkout attempt" — NOT regenerated on retry.
 * When provided, it becomes the Firestore document ID directly (via
 * setDoc instead of addDoc). If the same key is submitted twice — e.g. the
 * customer's connection blips right after tapping "Place Order" and the
 * UI shows an error, so they tap again, but the original write actually
 * succeeded server-side — the second write lands on the SAME document
 * and simply overwrites it with identical data, rather than creating a
 * duplicate order. This avoids the classic "did my order go through?
 * let me tap again" double-order problem without needing a separate
 * existence-check read (which would have its own race condition between
 * the check and the write).
 *
 * If idempotencyKey is omitted, falls back to addDoc with a random ID —
 * existing callers (e.g. any older code path) keep working, just without
 * the de-dup guarantee.
 */
export async function submitOrder({ venueId, tableNumber, tabletSlot, items, pricing, idempotencyKey }) {
  const subtotal = recomputeItemsSubtotal(items);
  const totals = calculateOrderTotals(subtotal, pricing);
  const orderNumber = generateOrderNumber();

  const orderData = {
    venueId,
    tableNumber,
    tabletSlot,
    orderNumber,
    items,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    serviceChargeAmount: totals.serviceChargeAmount,
    totalPrice: totals.totalPrice,
    status: "pending",
    source: "customer",
    createdAt: serverTimestamp(),
  };

  let ref;
  if (idempotencyKey) {
    ref = doc(db, "orders", idempotencyKey);
    await setDoc(ref, orderData, { merge: false });
  } else {
    ref = await addDoc(collection(db, "orders"), orderData);
  }

  return { ref, orderNumber };
}

/**
 * subscribeToTableOrders(venueId, tableNumber, callback)
 * Composite index required: venueId (==) + tableNumber (==) + createdAt (asc).
 *
 * Filters out SETTLED orders (closed-out tabs) client-side — see
 * closeTab() below for why settling doesn't delete orders. This keeps
 * the customer Bill tab and Floor View showing a clean slate after
 * close-out without needing a new composite index for a small per-table
 * dataset.
 */
export function subscribeToTableOrders(venueId, tableNumber, callback) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  const q = query(
    collection(db, "orders"),
    where("venueId", "==", venueId),
    where("tableNumber", "==", tableNumber),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(
    q,
    (snap) => callback({ data: snap.docs.map(orderDocToEntry).filter((o) => !o.settledAt), error: null }),
    (err) => callback({ data: [], error: err })
  );
}

/**
 * subscribeToVenueOrders(venueId, callback)
 * Composite index required: venueId (==) + createdAt (desc).
 * Same settled-order filtering as subscribeToTableOrders — Floor View
 * and Kitchen should never show a table's already-paid orders.
 */
export function subscribeToVenueOrders(venueId, callback) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  const q = query(
    collection(db, "orders"),
    where("venueId", "==", venueId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => callback({ data: snap.docs.map(orderDocToEntry).filter((o) => !o.settledAt), error: null }),
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
    items: d.items ?? [],
    subtotal: d.subtotal ?? d.totalPrice ?? 0,
    taxAmount: d.taxAmount ?? 0,
    serviceChargeAmount: d.serviceChargeAmount ?? 0,
    totalPrice: d.totalPrice ?? 0,
    status: d.status ?? "pending",
    source: d.source ?? "customer",
    createdAt: d.createdAt?.toDate?.() ?? null,
    settledAt: d.settledAt?.toDate?.() ?? null,
  };
}

export async function updateOrderStatus(orderId, status) {
  const ref = doc(db, "orders", orderId);
  return updateDoc(ref, { status, updatedAt: serverTimestamp() });
}

// ─── Server actions: add / edit / remove / void ──────────────────────────────
//
// `actor` shape used throughout: { email, role }

function recomputeOrderTotals(items, existingOrder) {
  const subtotal = recomputeItemsSubtotal(items);
  // Reconstruct the effective tax/service rate from the order's OWN
  // stored amounts rather than re-reading venue config, so an edit
  // doesn't change the rate applied to an order placed under a
  // different historical rate. Falls back to 0% if the prior subtotal
  // is missing/zero/non-finite (e.g. a legacy order from before the
  // tax rework, or any other corrupted data) — calculateOrderTotals()
  // itself also guards against NaN/negative inputs as a second layer.
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
 * Undo for removeItemFromOrder(). previousOrderSnapshot is the FULL order
 * object as it existed immediately BEFORE the removal (captured by the
 * caller right before calling removeItemFromOrder) — this writes the
 * order's items/totals back to exactly that state.
 *
 * If the removal emptied the order (deleteDoc was called), this
 * re-creates the document at the SAME id via setDoc, so any UI still
 * referencing that order id (unlikely, since it would have unmounted,
 * but defensively correct) stays valid.
 */
export async function restoreRemovedItem(orderId, previousOrderSnapshot, actor) {
  const ref = doc(db, "orders", orderId);
  await setDoc(
    ref,
    {
      venueId: previousOrderSnapshot.venueId,
      tableNumber: previousOrderSnapshot.tableNumber,
      tabletSlot: previousOrderSnapshot.tabletSlot,
      orderNumber: previousOrderSnapshot.orderNumber,
      items: previousOrderSnapshot.items,
      subtotal: previousOrderSnapshot.subtotal,
      taxAmount: previousOrderSnapshot.taxAmount,
      serviceChargeAmount: previousOrderSnapshot.serviceChargeAmount,
      totalPrice: previousOrderSnapshot.totalPrice,
      status: previousOrderSnapshot.status,
      source: previousOrderSnapshot.source,
      lastEditedBy: actor?.email ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: false }
  );

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
 * Undo for voidOrder(). voidedOrderSnapshot is the FULL order object as
 * it existed immediately BEFORE voiding (captured by the caller right
 * before calling voidOrder) — recreates the document at the SAME id,
 * so it reappears exactly where it was.
 */
export async function restoreVoidedOrder(orderId, voidedOrderSnapshot, actor) {
  const ref = doc(db, "orders", orderId);
  await setDoc(
    ref,
    {
      venueId: voidedOrderSnapshot.venueId,
      tableNumber: voidedOrderSnapshot.tableNumber,
      tabletSlot: voidedOrderSnapshot.tabletSlot,
      orderNumber: voidedOrderSnapshot.orderNumber,
      items: voidedOrderSnapshot.items,
      subtotal: voidedOrderSnapshot.subtotal,
      taxAmount: voidedOrderSnapshot.taxAmount,
      serviceChargeAmount: voidedOrderSnapshot.serviceChargeAmount,
      totalPrice: voidedOrderSnapshot.totalPrice,
      status: voidedOrderSnapshot.status,
      source: voidedOrderSnapshot.source,
      lastEditedBy: actor?.email ?? null,
      createdAt: serverTimestamp(), // best-effort — original createdAt isn't preserved across a delete
      updatedAt: serverTimestamp(),
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
 * Same idempotency mechanism as submitOrder() — see that function's
 * comment for the full rationale. Staff double-tapping "Add Order to
 * Table" after a slow/failed network response is just as real a risk as
 * a customer double-tapping "Place Order".
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
    await setDoc(ref, orderData, { merge: false });
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
  return addDoc(collection(db, "billRequests"), {
    venueId,
    tableNumber,
    tabletSlot,
    totalDue,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

/**
 * subscribeToTableBillRequest(venueId, tableNumber, callback)
 * Composite index required: venueId (==) + tableNumber (==) + createdAt (desc).
 */
export function subscribeToTableBillRequest(venueId, tableNumber, callback) {
  if (!venueId) {
    callback({ data: null, error: null });
    return () => {};
  }

  const q = query(
    collection(db, "billRequests"),
    where("venueId", "==", venueId),
    where("tableNumber", "==", tableNumber),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map(billRequestDocToEntry);
      callback({ data: docs[0] ?? null, error: null });
    },
    (err) => callback({ data: null, error: err })
  );
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
 * Composite index required: venueId (==) + createdAt (desc).
 */
export function subscribeToVenueBillRequests(venueId, callback) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  const q = query(
    collection(db, "billRequests"),
    where("venueId", "==", venueId),
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
// The missing piece that closes the full order lifecycle: customer orders
// -> kitchen makes it -> staff serves it -> CUSTOMER PAYS -> tab closes,
// table resets for the next guests. Before this existed, paid orders had
// no way to leave the active Bill tab / Floor View / Kitchen — they'd
// just accumulate forever, and a new round of orders from the same table
// (after it turned over to new guests) would visually mix with the
// previous party's already-paid orders.
//
// DESIGN: settle, don't delete. Every order gets a `settledAt` timestamp
// instead of being removed — subscribeToTableOrders/subscribeToVenueOrders
// filter these out so the active views look clean, but the historical
// record survives intact for future shift reports (which need to query
// "every order settled between 6pm and close", not just "every order that
// currently exists").
//
// This is a STAFF action with a confirm step in the UI (showing the exact
// total before committing) — modeled after real POS systems where
// "Request Bill" (customer-initiated) and "Close Tab" (staff-confirmed,
// after payment is physically in hand) are deliberately separate steps.

/**
 * closeTab({ venueId, tableNumber, actor })
 * Marks every active (non-settled) order for this table as settled, in
 * one atomic batch, and clears/acknowledges any pending bill request for
 * the table at the same time — once staff are closing the tab, whatever
 * the customer was asking for via "Request Bill" has already been
 * handled by definition.
 *
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

  const activeOrderDocs = ordersSnap.docs.filter((d) => !d.data().settledAt);

  if (activeOrderDocs.length === 0) {
    return { closedOrderCount: 0, closedTotal: 0 };
  }

  const batch = writeBatch(db);
  let closedTotal = 0;

  for (const orderDoc of activeOrderDocs) {
    batch.update(orderDoc.ref, { settledAt: serverTimestamp() });
    closedTotal += orderDoc.data().totalPrice ?? 0;
  }

  // Clear any pending bill request for this table in the same batch —
  // closing the tab implies whatever the customer asked for has been
  // handled, so a stale "Staff has been notified" banner shouldn't
  // linger on a table that's now empty/turning over.
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
    details: `Closed tab: ${activeOrderDocs.length} order${activeOrderDocs.length === 1 ? "" : "s"}, $${closedTotal.toFixed(2)}`,
  });

  return { closedOrderCount: activeOrderDocs.length, closedTotal };
}
