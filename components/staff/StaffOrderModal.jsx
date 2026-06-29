"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/staff/StaffOrderModal.jsx  —  Staff creates an order for a table
//
// Wraps its own LOCAL CartProvider around MenuView + a cart summary panel,
// so staff get the exact same modifier-picking / special-instructions
// experience customers get (MenuView already opens ItemCustomizationModal
// for items with modifierGroups) — without sharing state with any
// tablet's actual cart. This replaces an earlier version that
// reimplemented a simplified cart inline and silently dropped modifiers
// and special instructions for staff-entered orders.
//
// Needs the venue's pricing config (tax/service rate) just like the
// customer cart does, fetched once when the modal opens.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef } from "react";
import { createOrderForTable } from "@/lib/orderService";
import { subscribeToVenueConfig, calculateOrderTotals } from "@/lib/venueConfig";
import { CartProvider, useCart } from "@/lib/CartContext";
import { theme } from "@/lib/theme";
import Modal from "@/components/admin/Modal";
import MenuView from "@/components/MenuView";

function generateIdempotencyKey() {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function StaffOrderModal({ open, onClose, venueId, tableNumber, actor }) {
  const [pricing, setPricing] = useState(null);

  useEffect(() => {
    if (!open || !venueId) return;
    const unsub = subscribeToVenueConfig(venueId, ({ pricing }) => setPricing(pricing));
    return () => unsub();
  }, [open, venueId]);

  return (
    <Modal open={open} onClose={onClose} title={`Add Order — Table ${tableNumber}`} maxWidth={900}>
      <CartProvider>
        <StaffOrderModalContent venueId={venueId} tableNumber={tableNumber} actor={actor} pricing={pricing} onClose={onClose} />
      </CartProvider>
    </Modal>
  );
}

function StaffOrderModalContent({ venueId, tableNumber, actor, pricing, onClose }) {
  const { cartItems, subtotal, incrementItem, decrementItem, removeItem, clearCart } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Same idempotency pattern as CartDrawer.jsx — see that file's comment
  // for the full rationale. Persists across a failed retry, resets after
  // a successful submission.
  const idempotencyKeyRef = useRef(null);

  const totals = useMemo(() => calculateOrderTotals(subtotal, pricing), [subtotal, pricing]);

  const handleClose = () => {
    clearCart();
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (cartItems.length === 0) return;
    setSubmitting(true);
    setError(null);

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }

    try {
      await createOrderForTable({
        venueId,
        tableNumber,
        items: cartItems,
        pricing,
        actor,
        idempotencyKey: idempotencyKeyRef.current,
      });
      idempotencyKeyRef.current = null;
      handleClose();
    } catch (err) {
      console.error("[StaffOrderModal] createOrderForTable failed:", err);
      setError("Could not create the order. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.layout}>
      <div style={styles.menuColumn}>
        <MenuView venueId={venueId} />
      </div>

      <div style={styles.cartColumn}>
        <p style={styles.cartLabel}>This Order</p>

        {cartItems.length === 0 && <p style={styles.emptyCart}>Tap items on the left to add them.</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {cartItems.map((item) => (
            <div key={item.lineKey} style={styles.cartRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={styles.cartItemName}>{item.name_en}</p>
                {item.selectedModifiers.length > 0 && (
                  <p style={styles.modifierLine}>{item.selectedModifiers.map((m) => m.optionName_en).join(", ")}</p>
                )}
                {item.specialInstructions && <p style={styles.instructionsLine}>&quot;{item.specialInstructions}&quot;</p>}
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

              <div style={{ textAlign: "right" }}>
                <span style={styles.cartItemPrice}>${(item.unitPrice * item.quantity).toFixed(2)}</span>
                <button onClick={() => removeItem(item.lineKey)} style={styles.removeBtn}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {cartItems.length > 0 && (
          <>
            <div style={styles.breakdown}>
              <div style={styles.breakdownRow}>
                <span>Subtotal</span>
                <span>${totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.taxAmount > 0 && (
                <div style={styles.breakdownRow}>
                  <span>Tax</span>
                  <span>${totals.taxAmount.toFixed(2)}</span>
                </div>
              )}
              {totals.serviceChargeAmount > 0 && (
                <div style={styles.breakdownRow}>
                  <span>Service charge</span>
                  <span>${totals.serviceChargeAmount.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div style={styles.totalRow}>
              <span>Total</span>
              <span style={styles.totalValue}>${totals.totalPrice.toFixed(2)}</span>
            </div>

            {error && <p style={styles.errorText}>{error}</p>}

            <button onClick={handleSubmit} disabled={submitting} style={{ ...styles.submitBtn, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? "Adding…" : "Add Order to Table"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  layout: {
    display: "flex",
    gap: 20,
    flexWrap: "wrap",
  },
  menuColumn: {
    flex: 2,
    minWidth: 320,
  },
  cartColumn: {
    flex: 1,
    minWidth: 240,
    borderLeft: `1px solid ${theme.color.border}`,
    paddingLeft: 20,
  },
  cartLabel: {
    fontFamily: theme.font.display,
    fontSize: 11,
    fontWeight: 700,
    color: theme.color.textMuted,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    margin: "0 0 14px",
  },
  emptyCart: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textFaint,
  },
  cartRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  },
  cartItemName: {
    margin: 0,
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textSecondary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  modifierLine: {
    margin: "2px 0 0",
    fontFamily: theme.font.body,
    fontSize: 10,
    color: theme.color.accent,
  },
  instructionsLine: {
    margin: "2px 0 0",
    fontFamily: theme.font.body,
    fontSize: 10,
    fontStyle: "italic",
    color: theme.color.textFaint,
  },
  qtyControls: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    marginTop: 2,
  },
  qtyBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
  },
  qtyValue: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    color: theme.color.textPrimary,
    minWidth: 14,
    textAlign: "center",
  },
  cartItemPrice: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    color: theme.color.accent,
    display: "block",
  },
  removeBtn: {
    marginTop: 2,
    background: "none",
    border: "none",
    color: theme.color.textFaint,
    fontFamily: theme.font.body,
    fontSize: 9,
    textDecoration: "underline",
    cursor: "pointer",
    padding: 0,
  },
  breakdown: {
    paddingTop: 10,
    borderTop: `1px solid ${theme.color.border}`,
    marginBottom: 8,
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textMuted,
  },
  breakdownRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "2px 0",
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    color: theme.color.textMuted,
    marginBottom: 12,
    paddingTop: 8,
    borderTop: `1px solid ${theme.color.border}`,
  },
  totalValue: {
    color: theme.color.textPrimary,
    fontSize: 18,
  },
  errorText: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.danger,
    marginBottom: 10,
  },
  submitBtn: {
    width: "100%",
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
