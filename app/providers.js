"use client";

// ─────────────────────────────────────────────────────────────────────────────
// app/providers.js  —  Client-side context providers
//
// layout.js needs to stay a server component (it exports `metadata`), but
// AuthProvider relies on useState/useEffect and must be a client component.
// This thin wrapper is the bridge: layout.js renders <Providers>{children}
// </Providers>, keeping the provider tree in one place without forcing the
// whole layout to be client-side.
// ─────────────────────────────────────────────────────────────────────────────

import { AuthProvider } from "@/lib/AuthContext";

export default function Providers({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
