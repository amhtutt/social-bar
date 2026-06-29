// ─────────────────────────────────────────────────────────────────────────────
// lib/userService.js  —  Multi-tenant foundation: users + venues
//
// Collections:
//   venues/{venueId}
//     name, ownerUid, config: { games, menu, ordering, chat, callServer, bill }
//
//   users/{uid}
//     email, role: "admin" | "manager" | "server", venueId, createdAt
//
// Role semantics:
//   "admin"   — full menu CRUD (categories/items) + can create manager/server
//               accounts for their OWN venue. Created automatically as the
//               owner when a venue is created (see createVenueWithAdmin).
//   "manager" — can view/edit orders and bills. Same permissions as "server"
//               for now (per product decision) — kept as a distinct role so
//               manager-only abilities (voids, discounts) can be added later
//               without a data migration.
//   "server"  — same permissions as "manager" today.
//
// IMPORTANT: Firebase Auth's createUserWithEmailAndPassword() signs in as
// the newly created user immediately, which is a problem when an Admin is
// creating a Manager/Server account FROM WITHIN their own session (it would
// kick the Admin out and log them in as the new staff member instead).
// createStaffAccount() below uses a SECONDARY Firebase Auth app instance to
// avoid this — see the secondaryAuth setup.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ─── User profile (role + venue membership) ───────────────────────────────────

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { uid, email: d.email, role: d.role, venueId: d.venueId };
}

/**
 * subscribeToUserProfile(uid, callback)
 * Live version of getUserProfile — used by AuthContext so role changes
 * take effect without a re-login.
 *
 * IMPORTANT: on error, this does NOT call callback(null). A transient
 * error (e.g. the Firestore SDK's auth token hasn't fully propagated yet
 * in the moment right after sign-in) must NOT be treated the same as
 * "no profile exists" — doing so previously caused a flash of "Access
 * Denied" immediately after login, before onSnapshot's automatic retry
 * succeeded a moment later. Errors are logged and otherwise ignored;
 * onSnapshot will keep retrying on its own.
 */
export function subscribeToUserProfile(uid, callback) {
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      if (!snap.exists()) return callback(null);
      const d = snap.data();
      callback({ uid, email: d.email, role: d.role, venueId: d.venueId });
    },
    (err) => {
      console.error("[subscribeToUserProfile] snapshot error (will retry):", err);
      // Deliberately do not call callback here — see comment above.
    }
  );
}

// ─── Venue creation (onboarding a new restaurant) ─────────────────────────────

/**
 * createVenueWithAdmin({ venueName, adminEmail, adminPassword })
 * Full "onboard a new restaurant" flow:
 *   1. Creates the Firebase Auth user for the admin
 *   2. Creates the venues/{venueId} document with default feature flags
 *   3. Creates the users/{uid} profile document with role "admin"
 *
 * This is the ONLY place a brand-new venueId is generated.
 */
export async function createVenueWithAdmin({ venueName, adminEmail, adminPassword }) {
  const cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
  const uid = cred.user.uid;
  const venueId = uid; // simplest 1:1 mapping: the founding admin's uid IS the venueId

  await setDoc(doc(db, "venues", venueId), {
    name: venueName,
    ownerUid: uid,
    config: {
      games: false,
      menu: true,
      ordering: true,
      chat: false,
      callServer: true,
      bill: true,
      pricing: {
        taxRatePercent: 0,
        serviceChargeRatePercent: 0,
        taxInclusive: false,
      },
      staffPin: "0000",
    },
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, "users", uid), {
    email: adminEmail,
    role: "admin",
    venueId,
    createdAt: serverTimestamp(),
  });

  return { uid, venueId };
}

/**
 * createStaffAccount({ email, password, role, venueId })
 * Called by an Admin to create a Manager, Server, or Kitchen account FOR
 * THEIR OWN venue. Uses a secondary, temporary Firebase Auth app instance
 * so the Admin's own session in the main `auth` instance is untouched —
 * without this, signing up a new user would silently log the Admin out
 * and log the new staff member in instead.
 */
export async function createStaffAccount({ email, password, role, venueId }) {
  if (role !== "manager" && role !== "server" && role !== "kitchen") {
    throw new Error('role must be "manager", "server", or "kitchen"');
  }

  const secondaryAppName = `staff-creation-${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;

    await setDoc(doc(db, "users", uid), {
      email,
      role,
      venueId,
      createdAt: serverTimestamp(),
    });

    await firebaseSignOut(secondaryAuth);

    return { uid };
  } finally {
    await deleteApp(secondaryApp);
  }
}

/**
 * subscribeToVenueStaff(venueId, callback)
 * Lists every user (manager + server, NOT admin) belonging to a venue —
 * powers the "Staff" tab in the admin menu editor.
 */
export function subscribeToVenueStaff(venueId, callback) {
  const q = query(collection(db, "users"), where("venueId", "==", venueId));

  return onSnapshot(
    q,
    (snap) => {
      const all = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      const staff = all.filter((u) => u.role === "manager" || u.role === "server");
      callback({ data: staff, error: null });
    },
    (err) => callback({ data: [], error: err })
  );
}

// ─── Sign in / out ─────────────────────────────────────────────────────────────

export async function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOut() {
  return firebaseSignOut(auth);
}

/**
 * subscribeToAuthState(callback)
 * Wraps Firebase's onAuthStateChanged for the primary auth instance.
 * callback receives the Firebase User object or null.
 */
export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
