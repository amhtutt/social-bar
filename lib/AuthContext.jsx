"use client";

// ─────────────────────────────────────────────────────────────────────────────
// lib/AuthContext.jsx  —  Combined auth state: Firebase User + role + venueId
//
// Wraps two async sources into one piece of state:
//   1. Firebase Auth's signed-in user (or null)
//   2. That user's Firestore profile doc (role + venueId)
//
// Consumers get a single useAuth() hook returning:
//   { user, profile, loading, isAdmin, isManager, isServer, isStaff }
//
// "isStaff" is true for admin/manager/server — useful for route guards that
// just need "any logged-in staff member", as opposed to admin-only screens.
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
    isManager: role === "manager",
    isServer: role === "server",
    isStaff: role === "admin" || role === "manager" || role === "server",
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
