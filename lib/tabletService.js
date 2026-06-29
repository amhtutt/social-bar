// ─────────────────────────────────────────────────────────────────────────────
// lib/tabletService.js  —  Tablet presence in Firestore (now venue-scoped)
//
// CHANGED for multi-tenant: doc ID now includes venueId, since table
// numbers repeat across venues (every restaurant has a "Table 1"). Without
// this, two different restaurants' Table 1 / Tablet A would collide on the
// same Firestore document.
//
// Collection:
//   tablets/{docId}   where docId = "{venueId}_table_{tableNumber}_{slotLetter}"
// ─────────────────────────────────────────────────────────────────────────────

import { collection, doc, setDoc, updateDoc, deleteDoc, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

/**
 * buildDocId(venueId, tableNumber, tabletSlot)
 * e.g. venueId="abc123", tableNumber=1, tabletSlot="Tablet A"
 *      -> "abc123_table_1_A"
 */
export function buildDocId(venueId, tableNumber, tabletSlot) {
  const slotLetter = tabletSlot.replace("Tablet ", "").trim();
  return `${venueId}_table_${tableNumber}_${slotLetter}`;
}

export async function registerTablet(venueId, tableNumber, tabletSlot) {
  const docId = buildDocId(venueId, tableNumber, tabletSlot);
  const ref = doc(db, "tablets", docId);

  await setDoc(
    ref,
    {
      venueId,
      tableNumber,
      tabletSlot,
      status: "online",
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function updateTabletHeartbeat(venueId, tableNumber, tabletSlot) {
  const docId = buildDocId(venueId, tableNumber, tabletSlot);
  const ref = doc(db, "tablets", docId);

  await updateDoc(ref, {
    status: "online",
    lastSeen: serverTimestamp(),
  });
}

export async function markTabletOffline(venueId, tableNumber, tabletSlot) {
  try {
    const docId = buildDocId(venueId, tableNumber, tabletSlot);
    const ref = doc(db, "tablets", docId);
    await updateDoc(ref, {
      status: "offline",
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Network may already be gone — ignore
  }
}

/**
 * subscribeToVenueTablets(venueId, callback)
 * ALL tablet presence docs for a venue, regardless of online/offline
 * status — powers the Floor View's "every occupied table" overview,
 * which needs to show tables that have a tablet checked in even if
 * they have zero active orders yet (e.g. a table that just sat down).
 *
 * Deliberately NOT filtered to status=="online" server-side — that
 * would need its own composite index for a fairly small dataset (tens
 * of tablets per venue, not thousands), so the online/offline split
 * happens client-side in the consuming component instead.
 */
export function subscribeToVenueTablets(venueId, callback) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  const q = query(collection(db, "tablets"), where("venueId", "==", venueId));

  return onSnapshot(
    q,
    (snap) => callback({ data: snap.docs.map(tabletDocToEntry), error: null }),
    (err) => callback({ data: [], error: err })
  );
}

function tabletDocToEntry(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    venueId: d.venueId,
    tableNumber: d.tableNumber,
    tabletSlot: d.tabletSlot,
    status: d.status ?? "offline",
    lastSeen: d.lastSeen?.toDate?.() ?? null,
  };
}

// ─── Table flags ────────────────────────────────────────────────────────────
//
// A manual "flag this table" toggle for service quality (e.g. VIP,
// needs a check-in, celebrating something) — independent of tablet
// presence or order activity. Modeled as its own small collection
// rather than a field on `tablets`, since a flag is a staff judgment
// call, not a system-detected state.

/**
 * flagTable(venueId, tableNumber, note, actor)
 * Sets/replaces the flag for a table. A table can only have ONE active
 * flag at a time — calling this again overwrites the note rather than
 * stacking flags, since the doc ID is deterministic (venueId_table).
 */
export async function flagTable(venueId, tableNumber, note, actor) {
  const docId = `${venueId}_table_${tableNumber}`;
  await setDoc(doc(db, "flaggedTables", docId), {
    venueId,
    tableNumber,
    note: note ?? "",
    flaggedByEmail: actor?.email ?? null,
    createdAt: serverTimestamp(),
  });
}

/**
 * unflagTable(venueId, tableNumber)
 */
export async function unflagTable(venueId, tableNumber) {
  const docId = `${venueId}_table_${tableNumber}`;
  await deleteDoc(doc(db, "flaggedTables", docId));
}

/**
 * subscribeToVenueFlaggedTables(venueId, callback)
 */
export function subscribeToVenueFlaggedTables(venueId, callback) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  const q = query(collection(db, "flaggedTables"), where("venueId", "==", venueId));

  return onSnapshot(
    q,
    (snap) =>
      callback({
        data: snap.docs.map((d) => ({ id: d.id, tableNumber: d.data().tableNumber, note: d.data().note ?? "" })),
        error: null,
      }),
    (err) => callback({ data: [], error: err })
  );
}
