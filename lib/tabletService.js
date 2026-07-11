// ─────────────────────────────────────────────────────────────────────────────
// lib/tabletService.js  —  Tablet presence in Firestore (venue-scoped)
//
// Collections:
//   tablets/{docId}            docId = "{venueId}_table_{tableNumber}_{slotLetter}"
//                              — presence (online/offline/lastSeen). Deterministic
//                              IDs kept on purpose: a swapped device for the same
//                              slot reuses the same doc, so Floor View never shows
//                              duplicates.
//
//   tabletIdentities/{uid}     uid = the device's anonymous-auth uid
//                              — NEW: the security anchor. The hardened Firestore
//                              rules look this doc up to decide which venue+table
//                              a signed-in device may read orders / bill requests
//                              for, and which presence doc it may write. Written
//                              (or overwritten, when a tablet is re-purposed to a
//                              different table) inside registerTablet(), so the
//                              Setup component needs NO changes.
//
// SECURITY CHANGES in this version (pairs with firestore.rules +
// lib/customerAuth.js): every tablet-side write first ensures the device
// is signed in anonymously. The identity doc is written BEFORE the
// presence doc — the rules validate the presence write against it.
// ─────────────────────────────────────────────────────────────────────────────

import { collection, doc, setDoc, updateDoc, deleteDoc, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { ensureCustomerAuth } from "./customerAuth";

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
  const user = await ensureCustomerAuth();

  // 1. Identity first — the rules check the presence write against it.
  //    setDoc (not merge) so re-running Setup on a re-purposed tablet
  //    cleanly replaces any previous table assignment.
  await setDoc(doc(db, "tabletIdentities", user.uid), {
    uid: user.uid,
    venueId,
    tableNumber,
    tabletSlot,
    updatedAt: serverTimestamp(),
  });

  // 2. Presence — unchanged shape and doc ID.
  const docId = buildDocId(venueId, tableNumber, tabletSlot);
  await setDoc(
    doc(db, "tablets", docId),
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
  await ensureCustomerAuth();

  const docId = buildDocId(venueId, tableNumber, tabletSlot);
  const ref = doc(db, "tablets", docId);

  await updateDoc(ref, {
    status: "online",
    lastSeen: serverTimestamp(),
  });
}

export async function markTabletOffline(venueId, tableNumber, tabletSlot) {
  try {
    await ensureCustomerAuth();
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
 * status — powers the Floor View's "every occupied table" overview.
 * Staff-only under the new rules (caller is signed in via AuthContext).
 *
 * Deliberately NOT filtered to status=="online" server-side — the
 * online/offline split happens client-side in the consuming component.
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
// presence or order activity. Staff-only (FOH) under the new rules.

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
