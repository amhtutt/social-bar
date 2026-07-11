// ─────────────────────────────────────────────────────────────────────────────
// lib/customerAuth.js  —  Anonymous Auth for customer tablets
//
// The hardened Firestore rules require EVERY client to be signed in —
// including customer tablets, which have no account. Tablets therefore
// sign in anonymously: Firebase issues them a stable uid that persists
// in local storage across restarts (until app data is cleared).
//
// That uid is what the whole security model hangs on:
//   • the tablet's identity doc lives at tablets/{uid}
//   • orders / bill requests it creates carry createdByUid: uid
//   • rules let it read ONLY the orders of the venue+table its own
//     tablets/{uid} doc says it's registered to
//
// ensureCustomerAuth() is safe to call repeatedly and from multiple
// call sites at once (in-flight promise is shared). If a staff member is
// already signed in on this device (email/password), that existing user
// is returned untouched — we never kick a staff session to create an
// anonymous one.
//
// PREREQUISITE: enable the Anonymous provider in Firebase console →
// Authentication → Sign-in method (staging AND production projects).
// ─────────────────────────────────────────────────────────────────────────────

import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

let inflight = null;

export function ensureCustomerAuth() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (inflight) return inflight;

  inflight = new Promise((resolve, reject) => {
    // Wait for Firebase to finish restoring any persisted session first —
    // auth.currentUser is null for a moment on every cold start even when
    // a previous anonymous session exists. Signing in anonymously during
    // that window would mint a NEW uid and orphan the tablet's identity.
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        if (user) {
          inflight = null;
          resolve(user);
          return;
        }
        signInAnonymously(auth)
          .then((cred) => {
            inflight = null;
            resolve(cred.user);
          })
          .catch((err) => {
            inflight = null;
            reject(err);
          });
      },
      (err) => {
        inflight = null;
        reject(err);
      }
    );
  });

  return inflight;
}
