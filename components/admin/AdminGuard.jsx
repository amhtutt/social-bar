"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/admin/AdminGuard.jsx  —  Role-based route protection
//
// Wrap any admin/staff page in this. Behavior:
//   - Still checking auth state -> render nothing (avoids a flash)
//   - Not signed in -> show LoginScreen
//   - Signed in but role doesn't match requiredRoles -> "access denied"
//   - Signed in with matching role -> render children
//
// requiredRoles defaults to ["admin"] (the menu editor). Pass a wider list
// like ["admin","staff"] for screens any front-of-house member can use, or
// ["admin","staff","kitchen"] for screens every role can reach.
// ─────────────────────────────────────────────────────────────────────────────

import { useAuth } from "@/lib/AuthContext";
import { signOut } from "@/lib/userService";
import { theme } from "@/lib/theme";
import LoginScreen from "./LoginScreen";

export default function AdminGuard({ children, requiredRoles = ["admin"] }) {
  const { user, role, loading } = useAuth();

  if (loading) return null;

  if (!user) return <LoginScreen />;

  if (!requiredRoles.includes(role)) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <span style={{ fontSize: 36, display: "block", marginBottom: 14 }}>🔒</span>
          <h1 style={styles.title}>Access Denied</h1>
          <p style={styles.body}>
            Your account doesn&apos;t have permission to view this page.
            {role && (
              <>
                {" "}
                Signed in as <strong>{role}</strong>.
              </>
            )}
          </p>
          <button onClick={() => signOut()} style={styles.signOutBtn}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return children;
}

const styles = {
  page: {
    minHeight: "100vh",
    background: theme.color.bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    maxWidth: 420,
    textAlign: "center",
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.xl,
    padding: "36px 32px",
  },
  title: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 20,
    color: theme.color.textPrimary,
    margin: "0 0 10px",
  },
  body: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
    lineHeight: 1.6,
    margin: "0 0 20px",
  },
  signOutBtn: {
    padding: "10px 22px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textSecondary,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
};
