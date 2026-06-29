// ─────────────────────────────────────────────────────────────────────────────
// lib/callServerService.js  —  Call Server Module: data layer
//
// Deliberately mirrors lib/orderService.js's billRequests pattern: a table
// requests something, staff sees and acknowledges it. No "reason" field
// per product decision — a tap is a tap, staff figures out why in person.
//
// Collection:
//   serverCalls/{callId}
//     venueId, tableNumber, tabletSlot, status ("pending"|"acknowledged"),
//     createdAt
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { logActivity } from "./activityLogService";

async function safeLog(entry) {
  try {
    await logActivity(entry);
  } catch (err) {
    console.error("[callServerService] Failed to write activity log entry:", err);
  }
}

/**
 * callServer({ venueId, tableNumber, tabletSlot })
 * Called when a customer taps "Call Server". Writes one document — does
 * NOT check for an existing pending call from the same table, since a
 * second tap (e.g. "still waiting") is meaningful information for staff,
 * not a duplicate to suppress.
 */
export async function callServer({ venueId, tableNumber, tabletSlot }) {
  return addDoc(collection(db, "serverCalls"), {
    venueId,
    tableNumber,
    tabletSlot,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

/**
 * subscribeToTableServerCall(venueId, tableNumber, callback)
 * Most recent server call for one table — lets the tablet show "Staff has
 * been notified" after tapping the button.
 * Composite index required: venueId (==) + tableNumber (==) + createdAt (desc).
 */
export function subscribeToTableServerCall(venueId, tableNumber, callback) {
  if (!venueId) {
    callback({ data: null, error: null });
    return () => {};
  }

  const q = query(
    collection(db, "serverCalls"),
    where("venueId", "==", venueId),
    where("tableNumber", "==", tableNumber),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map(callDocToEntry);
      callback({ data: docs[0] ?? null, error: null });
    },
    (err) => callback({ data: null, error: err })
  );
}

function callDocToEntry(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    venueId: d.venueId,
    tableNumber: d.tableNumber,
    tabletSlot: d.tabletSlot,
    status: d.status ?? "pending",
    createdAt: d.createdAt?.toDate?.() ?? null,
  };
}

/**
 * subscribeToVenueServerCalls(venueId, callback)
 * ALL server calls across the venue — powers the Floor View's per-table
 * banner and the header's "X tables need help" counter.
 * Composite index required: venueId (==) + createdAt (desc).
 */
export function subscribeToVenueServerCalls(venueId, callback) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  const q = query(
    collection(db, "serverCalls"),
    where("venueId", "==", venueId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => callback({ data: snap.docs.map(callDocToEntry), error: null }),
    (err) => callback({ data: [], error: err })
  );
}

/**
 * acknowledgeServerCall(callId, venueId, tableNumber, actor)
 * Marks a server call as handled once staff has been to the table.
 * Logged to activityLog so a Manager can see response times / who
 * responded — same pattern as acknowledgeBillRequest.
 */
export async function acknowledgeServerCall(callId, venueId, tableNumber, actor) {
  await updateDoc(doc(db, "serverCalls", callId), {
    status: "acknowledged",
    updatedAt: serverTimestamp(),
  });

  await safeLog({
    venueId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    action: "server_call_acknowledged",
    tableNumber,
    details: "Responded to server call",
  });
}
