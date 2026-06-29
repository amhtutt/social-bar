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

import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
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
