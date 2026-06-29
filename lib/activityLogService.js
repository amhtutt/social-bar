// ─────────────────────────────────────────────────────────────────────────────
// lib/activityLogService.js  —  Audit trail for staff order actions
//
// Every server/manager action that touches an order or table's bill writes
// one entry here. This is intentionally append-only — entries are never
// edited or deleted, since the whole point is an honest record of what
// happened, even if a later action "fixes" an earlier mistake.
//
// Collection:
//   activityLog/{entryId}
//     venueId, actorEmail, actorRole, action, tableNumber, details, createdAt
//
// action values:
//   "item_removed"           — a line item was removed from an order
//   "item_quantity_changed"  — a line item's quantity was adjusted
//   "order_voided"           — an entire order was deleted
//   "order_created"          — staff created a new order on a table's behalf
//   "bill_acknowledged"      — staff marked a bill request as handled
//
// `details` is a short human-readable string describing what changed,
// built by the caller (e.g. "Removed Emerald Fizz (x1)") — kept as plain
// text rather than structured fields so the log stays simple to read.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const DEFAULT_LIMIT = 100;

/**
 * logActivity({ venueId, actorEmail, actorRole, action, tableNumber, details })
 * Fire-and-forget by convention at call sites — logging failures are
 * caught and console.error'd there rather than blocking the actual
 * order mutation.
 */
export async function logActivity({ venueId, actorEmail, actorRole, action, tableNumber, details }) {
  return addDoc(collection(db, "activityLog"), {
    venueId,
    actorEmail: actorEmail ?? "unknown",
    actorRole: actorRole ?? "unknown",
    action,
    tableNumber,
    details,
    createdAt: serverTimestamp(),
  });
}

/**
 * subscribeToVenueActivityLog(venueId, callback, options)
 * Global feed — every action across every table, newest first.
 * options.tableNumber, if provided, filters to just that table.
 *
 * Composite index required:
 *   - Global feed: venueId (==) + createdAt (desc)
 *   - Table-filtered: venueId (==) + tableNumber (==) + createdAt (desc)
 */
export function subscribeToVenueActivityLog(venueId, callback, options = {}) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  const constraints = [where("venueId", "==", venueId)];
  if (options.tableNumber !== undefined && options.tableNumber !== null) {
    constraints.push(where("tableNumber", "==", options.tableNumber));
  }
  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(fbLimit(options.limit ?? DEFAULT_LIMIT));

  const q = query(collection(db, "activityLog"), ...constraints);

  return onSnapshot(
    q,
    (snap) => callback({ data: snap.docs.map(logDocToEntry), error: null }),
    (err) => callback({ data: [], error: err })
  );
}

function logDocToEntry(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    venueId: d.venueId,
    actorEmail: d.actorEmail ?? "unknown",
    actorRole: d.actorRole ?? "unknown",
    action: d.action,
    tableNumber: d.tableNumber,
    details: d.details ?? "",
    createdAt: d.createdAt?.toDate?.() ?? null,
  };
}
