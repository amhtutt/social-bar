"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/CartButton.jsx  —  Floating cart trigger
//
// Shows item count badge, opens CartDrawer on tap. Hidden entirely when
// cart is empty — no point showing a cart button with nothing in it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCart } from "@/lib/CartContext";
import { theme } from "@/lib/theme";

export default function CartButton() {
  const { totalItemCount, subtotal, openDrawer } = useCart();

  if (totalItemCount === 0) return null;

  return (
    <button onClick={openDrawer} style={styles.button}>
      <span style={styles.icon}>🛒</span>
      <span style={styles.label}>View Cart</span>
      <span style={styles.priceTag}>${subtotal.toFixed(2)}</span>
      <span style={styles.badge}>{totalItemCount}</span>
    </button>
  );
}

const styles = {
  button: {
    position: "fixed",
    bottom: 84,
    right: 20,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 20px",
    borderRadius: theme.radius.pill,
    border: "none",
    background: `linear-gradient(135deg, ${theme.color.accent} 0%, #00c87a 100%)`,
    color: theme.color.bg,
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "0 8px 30px rgba(0,255,170,0.35)",
    zIndex: 50,
    animation: "fadeUp 0.3s ease both",
  },
  icon: {
    fontSize: 16,
  },
  label: {
    whiteSpace: "nowrap",
  },
  priceTag: {
    opacity: 0.85,
  },
  badge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 22,
    borderRadius: "50%",
    background: theme.color.bg,
    color: theme.color.accent,
    fontSize: 12,
    fontWeight: 800,
    padding: "0 6px",
  },
};
