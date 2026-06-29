// ─────────────────────────────────────────────────────────────────────────────
// lib/firebase.js  —  Firebase client SDK initialization
//
// Config now comes from environment variables (.env.local) instead of being
// hardcoded — this keeps the Firebase project out of source control and
// makes it trivial to point the same codebase at a different Firebase
// project later (e.g. when this gets sold/resold to another venue).
//
// This file is imported by every service module that talks to Firestore.
// It must only ever run in the browser — Next.js Server Components should
// never import this directly; use it from "use client" files only.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Next.js can re-evaluate modules during hot reload in dev — getApps() guard
// prevents "Firebase App named '[DEFAULT]' already exists" errors.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Firestore — used by every service module (tabletService, menuService, etc.)
export const db = getFirestore(app);

// Auth — email/password sign-in for admin/manager/server roles
export const auth = getAuth(app);

// NOTE: Firebase Storage is intentionally NOT initialized here — it requires
// the paid Blaze plan. Menu images use plain `imageUrl` string fields
// (pasted URLs) instead. Add Storage back here if/when Blaze is enabled.

// NOTE: Analytics is intentionally NOT initialized here either — getAnalytics()
// requires `window` and breaks if this module is ever imported on the server.
// If you need Analytics, initialize it inside a "use client" component with
// a useEffect, not at this module's top level.

export default app;
