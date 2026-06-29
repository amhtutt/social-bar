"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/admin/LoginScreen.jsx  —  Email/password sign-in
//
// Shown by AdminGuard whenever there's no signed-in user. On success,
// AuthContext picks up the new auth state automatically via its
// onAuthStateChanged listener — no manual redirect needed here.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { signIn } from "@/lib/userService";
import { theme } from "@/lib/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      console.error("[LoginScreen] sign-in failed:", err);
      setError("Incorrect email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <span style={styles.logoMark}>⬡</span>
        <h1 style={styles.title}>Staff Sign In</h1>
        <p style={styles.subtitle}>Sign in to manage orders, bills, or the menu.</p>

        <label style={styles.label}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          style={styles.input}
        />

        <label style={styles.label}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          style={styles.input}
        />

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" disabled={loading} style={{ ...styles.submitBtn, opacity: loading ? 0.6 : 1 }}>
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
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
    width: "100%",
    maxWidth: 380,
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.xl,
    padding: "36px 32px",
    display: "flex",
    flexDirection: "column",
  },
  logoMark: {
    fontSize: 28,
    color: theme.color.accent,
    filter: "drop-shadow(0 0 10px rgba(0,255,170,0.5))",
    marginBottom: 14,
  },
  title: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 22,
    color: theme.color.textPrimary,
    margin: "0 0 6px",
  },
  subtitle: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
    margin: "0 0 24px",
  },
  label: {
    fontFamily: theme.font.display,
    fontSize: 11,
    fontWeight: 700,
    color: theme.color.textMuted,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textPrimary,
    fontFamily: theme.font.body,
    fontSize: 14,
    outline: "none",
    marginBottom: 16,
  },
  error: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.danger,
    margin: "0 0 14px",
  },
  submitBtn: {
    padding: "13px",
    borderRadius: theme.radius.sm,
    border: "none",
    background: `linear-gradient(135deg, ${theme.color.accent} 0%, #00c87a 100%)`,
    color: theme.color.bg,
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
  },
};
