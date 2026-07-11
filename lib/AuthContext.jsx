"use client";

// ─────────────────────────────────────────────────────────────────────────────
// lib/AuthContext.jsx  —  Combined auth state: Firebase User + role + venueId
//
// Wraps two async sources into one piece of state:
//   1. Firebase Auth's signed-in user (or null)
//   2. That user's Firestore profile doc (role + venueId)
//
// Consumers get a single useAuth() hook returning:
//   { user, profile, loading, isAdmin, isFOH, isKitchen, isStaff }
//
// These mirror firestore.rules' role-check functions 1:1 (isVenueAdmin,
// isFOH, isKitchen, isVenueStaff) so a UI-level permission check never
// silently drifts from what Firestore will actually allow:
//   isAdmin — role === "admin"
//   isFOH   — role === "admin" || "staff" (front-of-house: orders/bills,
//             no menu edits) — what app/staff/page.js's AdminGuard requires
//   isKitchen — role === "kitchen"
//   isStaff — any of the above; "signed in as SOME employee of this venue"
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect } from "react";
import { subscribeToAuthState, subscribeToUserProfile } from "./userService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    const unsubAuth = subscribeToAuthState((firebaseUser) => {
      setUser(firebaseUser ?? null);
      if (!firebaseUser) {
        setProfile(null);
      } else {
        // Reset to "loading" (undefined), not "resolved with nothing" (null),
        // every time the signed-in user changes — including switching from
        // one account to another without a full page reload. This guards
        // against briefly reusing a stale profile/role from a previous user.
        setProfile(undefined);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubProfile = subscribeToUserProfile(user.uid, (p) => {
      setProfile(p);
    });
    return () => unsubProfile();
  }, [user]);

  const loading = user === undefined || (user !== null && profile === undefined);

  const role = profile?.role ?? null;

  const value = {
    user: user ?? null,
    profile: profile ?? null,
    loading,
    role,
    venueId: profile?.venueId ?? null,
    isAdmin: role === "admin",
    isFOH: role === "admin" || role === "staff",
    isKitchen: role === "kitchen",
    isStaff: role === "admin" || role === "staff" || role === "kitchen",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used inside an <AuthProvider>");
  }
  return ctx;
}
