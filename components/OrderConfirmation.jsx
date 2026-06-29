"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/OrderConfirmation.jsx  —  Full-screen "order placed" moment
//
// Shown briefly after a successful submitOrder() — gives the customer a
// clear, satisfying confirmation (order number + total) instead of the
// cart drawer just silently closing. Auto-dismisses after a few seconds,
// or the customer can tap through immediately.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { theme } from "@/lib/theme";

const AUTO_DISMISS_MS = 3500;

export default function OrderConfirmation({ orderNumber, totals, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div style={styles.overlay} onClick={onDismiss}>
      <div style={styles.card}>
        <div style={styles.checkCircle}>
          <span style={styles.checkMark}>✓</span>
        </div>

        <h2 style={styles.title}>Order placed</h2>
        <p style={styles.subtitle}>Your order is on its way to the kitchen.</p>

        <div style={styles.orderNumberBox}>
          <span style={styles.orderNumberLabel}>ORDER NUMBER</span>
          <span style={styles.orderNumberValue}>#{orderNumber}</span>
        </div>

        {totals && (
          <p style={styles.totalLine}>
            Total: <span style={styles.totalValue}>${totals.totalPrice.toFixed(2)}</span>
          </p>
        )}

        <p style={styles.tapHint}>Tap anywhere to continue</p>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,12,16,0.92)",
    backdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
    animation: "fadeUp 0.3s ease both",
    cursor: "pointer",
  },
  card: {
    textAlign: "center",
    padding: "40px 36px",
    maxWidth: 360,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: theme.color.accentBg,
    border: `2px solid ${theme.color.accent}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 20px",
    boxShadow: `0 0 30px ${theme.color.accentGlow}`,
  },
  checkMark: {
    fontSize: 34,
    color: theme.color.accent,
    fontWeight: 800,
  },
  title: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 26,
    color: theme.color.textPrimary,
    margin: "0 0 8px",
  },
  subtitle: {
    fontFamily: theme.font.body,
    fontSize: 14,
    color: theme.color.textMuted,
    margin: "0 0 24px",
  },
  orderNumberBox: {
    display: "inline-flex",
    flexDirection: "column",
    gap: 4,
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.lg,
    padding: "16px 32px",
    marginBottom: 18,
  },
  orderNumberLabel: {
    fontFamily: theme.font.display,
    fontSize: 10,
    fontWeight: 700,
    color: theme.color.textFaint,
    letterSpacing: "0.1em",
  },
  orderNumberValue: {
    fontFamily: theme.font.display,
    fontSize: 28,
    fontWeight: 800,
    color: theme.color.accent,
    letterSpacing: "0.02em",
  },
  totalLine: {
    fontFamily: theme.font.body,
    fontSize: 14,
    color: theme.color.textSecondary,
    margin: "0 0 24px",
  },
  totalValue: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    color: theme.color.textPrimary,
  },
  tapHint: {
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textFaint,
    margin: 0,
  },
};
