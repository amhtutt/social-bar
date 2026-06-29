"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/CartDrawer.jsx  —  Slide-in cart drawer
//
// Shows current cart with +/- quantity controls, modifier/special
// instruction details per line, a tax/service charge breakdown, and a
// "Place Order" button.
//
// Submitting:
//   1. Optimistically shows "Sending order…" immediately
//   2. Calls orderService.submitOrder() — on success, clears the cart,
//      closes the drawer, and calls onOrderPlaced(orderNumber, totals) so
//      the parent (/table) can show the order confirmation screen
//   3. On failure, shows a clear error and keeps the cart intact
//
// No tipping UI anywhere — tips are cash, handled directly with the
// server, never touching this app.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useRef } from "react";
import * as Sentry from "@sentry/nextjs";
import { useCart } from "@/lib/CartContext";
import { submitOrder } from "@/lib/orderService";
import { calculateOrderTotals } from "@/lib/venueConfig";
import { theme } from "@/lib/theme";

/**
 * generateIdempotencyKey()
 * Firestore document IDs can't contain "/" — everything else from a
 * UUID-ish random string is safe. Doesn't need to be cryptographically
 * strong, just unique enough that two different checkout attempts never
 * collide.
 */
function generateIdempotencyKey() {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function CartDrawer({ identity, pricing, onOrderPlaced }) {
  const { cartItems, isDrawerOpen, subtotal, closeDrawer, incrementItem, decrementItem, removeItem, clearCart } =
    useCart();

  const [submitState, setSubmitState] = useState("idle");

  // One key per checkout ATTEMPT, not per tap — generated lazily on first
  // submit and deliberately NOT regenerated on a failed retry, so a
  // connection blip + re-tap reuses the same key. submitOrder() then
  // writes to the same Firestore doc ID either way, so a successful
  // original write that the client never heard back from doesn't result
  // in a second, duplicate order. Reset to null after a successful
  // submission so the NEXT order (a genuinely new checkout) gets its own
  // fresh key.
  const idempotencyKeyRef = useRef(null);

  const totals = useMemo(() => calculateOrderTotals(subtotal, pricing), [subtotal, pricing]);
  const hasTaxOrService = totals.taxAmount > 0 || totals.serviceChargeAmount > 0;

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) return;
    setSubmitState("sending");

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }

    try {
      const { orderNumber } = await submitOrder({
        venueId: identity.venueId,
        tableNumber: identity.table,
        tabletSlot: identity.slot,
        items: cartItems,
        pricing,
        idempotencyKey: idempotencyKeyRef.current,
      });
      idempotencyKeyRef.current = null; // next order gets a fresh key
      clearCart();
      setSubmitState("idle");
      closeDrawer();
      onOrderPlaced?.({ orderNumber, totals });
    } catch (err) {
      console.error("[CartDrawer] Failed to submit order:", err);
      Sentry.captureException(err, {
        tags: { feature: "order_submission" },
        extra: { venueId: identity.venueId, tableNumber: identity.table, itemCount: cartItems.length },
      });
      setSubmitState("error");
      // idempotencyKeyRef intentionally NOT cleared here — a retry should
      // reuse the same key.
    }
  };

  return (
    <>
      <div
        onClick={closeDrawer}
        style={{
          ...styles.backdrop,
          opacity: isDrawerOpen ? 1 : 0,
          pointerEvents: isDrawerOpen ? "auto" : "none",
        }}
      />

      <div style={{ ...styles.drawer, transform: isDrawerOpen ? "translateX(0)" : "translateX(100%)" }}>
        <div style={styles.header}>
          <h2 style={styles.title}>Your Cart</h2>
          <button onClick={closeDrawer} style={styles.closeBtn}>
            ✕
          </button>
        </div>

        <div style={styles.itemList}>
          {cartItems.length === 0 && (
            <div style={styles.emptyState}>
              <p style={{ fontSize: 36, marginBottom: 10 }}>🛒</p>
              <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.textMuted }}>
                Your cart is empty. Add something from the menu.
              </p>
            </div>
          )}

          {cartItems.map((item) => (
            <div key={item.lineKey} style={styles.cartRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={styles.itemName}>{item.name_en}</p>

                {item.selectedModifiers.length > 0 && (
                  <p style={styles.modifierLine}>{item.selectedModifiers.map((m) => m.optionName_en).join(", ")}</p>
                )}

                {item.specialInstructions && <p style={styles.instructionsLine}>&quot;{item.specialInstructions}&quot;</p>}

                <p style={styles.itemPrice}>${item.unitPrice.toFixed(2)} each</p>
              </div>

              <div style={styles.qtyControls}>
                <button onClick={() => decrementItem(item.lineKey)} style={styles.qtyBtn}>
                  −
                </button>
                <span style={styles.qtyValue}>{item.quantity}</span>
                <button onClick={() => incrementItem(item.lineKey)} style={styles.qtyBtn}>
                  +
                </button>
              </div>

              <div style={{ textAlign: "right", minWidth: 56 }}>
                <p style={styles.lineTotal}>${(item.unitPrice * item.quantity).toFixed(2)}</p>
                <button onClick={() => removeItem(item.lineKey)} style={styles.removeBtn}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {cartItems.length > 0 && (
          <div style={styles.footer}>
            <div style={styles.breakdown}>
              <div style={styles.breakdownRow}>
                <span style={styles.breakdownLabel}>Subtotal</span>
                <span style={styles.breakdownValue}>${totals.subtotal.toFixed(2)}</span>
              </div>
              {hasTaxOrService && totals.taxAmount > 0 && (
                <div style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>
                    Tax {pricing?.taxInclusive ? "(included)" : `(${pricing?.taxRatePercent ?? 0}%)`}
                  </span>
                  <span style={styles.breakdownValue}>${totals.taxAmount.toFixed(2)}</span>
                </div>
              )}
              {hasTaxOrService && totals.serviceChargeAmount > 0 && (
                <div style={styles.breakdownRow}>
                  <span style={styles.breakdownLabel}>Service charge ({pricing?.serviceChargeRatePercent ?? 0}%)</span>
                  <span style={styles.breakdownValue}>${totals.serviceChargeAmount.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div style={styles.totalRow}>
              <span style={styles.totalLabel}>Total</span>
              <span style={styles.totalValue}>${totals.totalPrice.toFixed(2)}</span>
            </div>

            {submitState === "error" && (
              <p style={styles.errorText}>Could not send order. Check connection and try again.</p>
            )}

            <button
              onClick={handlePlaceOrder}
              disabled={submitState === "sending"}
              style={{
                ...styles.orderBtn,
                opacity: submitState === "sending" ? 0.6 : 1,
                cursor: submitState === "sending" ? "not-allowed" : "pointer",
              }}
            >
              {submitState === "sending" ? "Sending order…" : "Place Order"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    transition: "opacity 0.25s ease",
    zIndex: 90,
  },
  drawer: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "min(420px, 100vw)",
    background: "#0e1015",
    borderLeft: `1px solid ${theme.color.border}`,
    boxShadow: "-20px 0 60px rgba(0,0,0,0.5)",
    zIndex: 91,
    display: "flex",
    flexDirection: "column",
    transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 20px 16px",
    borderBottom: `1px solid ${theme.color.border}`,
    flexShrink: 0,
  },
  title: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 20,
    color: theme.color.textPrimary,
    margin: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textSecondary,
    fontSize: 14,
    cursor: "pointer",
  },
  itemList: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 20px",
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
  },
  cartRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 0",
    borderBottom: `1px solid ${theme.color.border}`,
  },
  itemName: {
    margin: 0,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 14,
    color: theme.color.textPrimary,
  },
  modifierLine: {
    margin: "3px 0 0",
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.accent,
  },
  instructionsLine: {
    margin: "3px 0 0",
    fontFamily: theme.font.body,
    fontSize: 11,
    fontStyle: "italic",
    color: theme.color.textFaint,
  },
  itemPrice: {
    margin: "5px 0 0",
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textMuted,
  },
  qtyControls: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    marginTop: 2,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
  },
  qtyValue: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 14,
    color: theme.color.textPrimary,
    minWidth: 18,
    textAlign: "center",
  },
  lineTotal: {
    margin: 0,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 14,
    color: theme.color.accent,
  },
  removeBtn: {
    marginTop: 4,
    background: "none",
    border: "none",
    color: theme.color.textFaint,
    fontFamily: theme.font.body,
    fontSize: 10,
    textDecoration: "underline",
    cursor: "pointer",
    padding: 0,
  },
  footer: {
    flexShrink: 0,
    padding: "16px 20px 24px",
    borderTop: `1px solid ${theme.color.border}`,
  },
  breakdown: {
    marginBottom: 10,
  },
  breakdownRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "3px 0",
  },
  breakdownLabel: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textMuted,
  },
  breakdownValue: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textSecondary,
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 8,
    paddingTop: 10,
    borderTop: `1px solid ${theme.color.border}`,
    marginBottom: 14,
  },
  totalLabel: {
    fontFamily: theme.font.display,
    fontSize: 13,
    fontWeight: 700,
    color: theme.color.textMuted,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  totalValue: {
    fontFamily: theme.font.display,
    fontSize: 26,
    fontWeight: 800,
    color: theme.color.textPrimary,
  },
  errorText: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.danger,
    marginBottom: 10,
    textAlign: "center",
  },
  orderBtn: {
    width: "100%",
    padding: "18px",
    borderRadius: theme.radius.md,
    border: "none",
    background: `linear-gradient(135deg, ${theme.color.accent} 0%, #00c87a 100%)`,
    color: theme.color.bg,
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 16,
    letterSpacing: "0.02em",
    boxShadow: "0 8px 30px rgba(0,255,170,0.25)",
    transition: "all 0.2s ease",
  },
};
