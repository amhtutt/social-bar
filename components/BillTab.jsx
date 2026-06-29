"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/BillTab.jsx  —  Running bill / tab for the table
//
// Subscribes to ALL orders for this tableNumber (shared across Tablet A/B)
// and shows them grouped by order, each with its own tax/service
// breakdown (snapshotted at order time), plus an aggregate summary across
// every order. "Request Bill" writes a billRequests doc that alerts
// staff — no payment processing, cash is handled in person.
//
// "+ Add More Items" closes the loop back to ordering without forcing the
// customer to find their own way back to the Menu tab.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import { subscribeToTableOrders, subscribeToTableBillRequest, requestBill } from "@/lib/orderService";
import { useCartOptional } from "@/lib/CartContext";
import { theme } from "@/lib/theme";

function Shimmer() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
        animation: "shimmerSweep 1.6s ease-in-out infinite",
      }}
    />
  );
}

function BillSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 64,
            borderRadius: 12,
            background: theme.color.surface,
            border: `1px solid ${theme.color.border}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Shimmer />
        </div>
      ))}
    </div>
  );
}

function OrderGroup({ order, onReorder }) {
  const timeLabel = order.createdAt
    ? order.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div style={styles.orderCard}>
      <div style={styles.orderHeader}>
        <span style={styles.orderTime}>
          {order.orderNumber && <span style={styles.orderNumber}>#{order.orderNumber}</span>} {timeLabel}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onReorder && (
            <button onClick={() => onReorder(order)} style={styles.reorderBtn}>
              ↻ Reorder
            </button>
          )}
          <span style={{ ...styles.orderStatus, ...statusStyle(order.status) }}>{order.status.toUpperCase()}</span>
        </div>
      </div>

      {order.items.map((item, i) => (
        <div key={i} style={styles.orderItemBlock}>
          <div style={styles.orderItemRow}>
            <span style={styles.orderItemName}>
              {item.quantity}× {item.name_en}
            </span>
            <span style={styles.orderItemPrice}>${(item.unitPrice * item.quantity).toFixed(2)}</span>
          </div>
          {item.selectedModifiers?.length > 0 && (
            <p style={styles.modifierLine}>{item.selectedModifiers.map((m) => m.optionName_en).join(", ")}</p>
          )}
          {item.specialInstructions && <p style={styles.instructionsLine}>&quot;{item.specialInstructions}&quot;</p>}
        </div>
      ))}

      <div style={styles.orderBreakdown}>
        <div style={styles.orderBreakdownRow}>
          <span style={styles.orderBreakdownLabel}>Subtotal</span>
          <span style={styles.orderBreakdownValue}>${order.subtotal.toFixed(2)}</span>
        </div>
        {order.taxAmount > 0 && (
          <div style={styles.orderBreakdownRow}>
            <span style={styles.orderBreakdownLabel}>Tax</span>
            <span style={styles.orderBreakdownValue}>${order.taxAmount.toFixed(2)}</span>
          </div>
        )}
        {order.serviceChargeAmount > 0 && (
          <div style={styles.orderBreakdownRow}>
            <span style={styles.orderBreakdownLabel}>Service charge</span>
            <span style={styles.orderBreakdownValue}>${order.serviceChargeAmount.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div style={styles.orderSubtotalRow}>
        <span style={styles.orderSubtotalLabel}>Order total</span>
        <span style={styles.orderSubtotalValue}>${order.totalPrice.toFixed(2)}</span>
      </div>
    </div>
  );
}

function statusStyle(status) {
  if (status === "served") return { color: theme.color.accent, background: theme.color.accentBg };
  if (status === "preparing") return { color: theme.color.warning, background: theme.color.warningBg };
  return { color: theme.color.info, background: theme.color.infoBg };
}

export default function BillTab({ identity, onAddMoreItems }) {
  const cart = useCartOptional();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(false);
  const [billRequest, setBillRequest] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [reorderedLabel, setReorderedLabel] = useState(false);

  useEffect(() => {
    const unsubOrders = subscribeToTableOrders(identity.venueId, identity.table, ({ data, error }) => {
      if (error) console.error("[BillTab] subscribeToTableOrders error:", error);
      setError(!!error);
      setOrders(error ? [] : data);
    });

    const unsubBillRequest = subscribeToTableBillRequest(identity.venueId, identity.table, ({ data, error }) => {
      if (error) console.error("[BillTab] subscribeToTableBillRequest error:", error);
      setBillRequest(data);
    });

    return () => {
      unsubOrders();
      unsubBillRequest();
    };
  }, [identity.venueId, identity.table]);

  const aggregate = useMemo(() => {
    if (!orders) return { subtotal: 0, taxAmount: 0, serviceChargeAmount: 0, grandTotal: 0 };
    return orders.reduce(
      (acc, o) => ({
        subtotal: acc.subtotal + o.subtotal,
        taxAmount: acc.taxAmount + o.taxAmount,
        serviceChargeAmount: acc.serviceChargeAmount + o.serviceChargeAmount,
        grandTotal: acc.grandTotal + o.totalPrice,
      }),
      { subtotal: 0, taxAmount: 0, serviceChargeAmount: 0, grandTotal: 0 }
    );
  }, [orders]);

  const hasActiveBillRequest = billRequest?.status === "pending";

  // Re-adds every item from a past order back into the live cart, one
  // addToCart() call per line — CartContext's own merge logic (same
  // itemId + same modifiers + same instructions) takes care of combining
  // with anything already in the cart, exactly as if the customer had
  // tapped "Add to Cart" on each item again by hand.
  const handleReorder = (order) => {
    if (!cart) return;
    for (const item of order.items) {
      cart.addToCart({
        itemId: item.itemId,
        name_en: item.name_en,
        name_mm: item.name_mm,
        basePrice: item.basePrice,
        selectedModifiers: item.selectedModifiers ?? [],
        specialInstructions: item.specialInstructions ?? "",
        quantity: item.quantity,
      });
    }
    setReorderedLabel(true);
    setTimeout(() => setReorderedLabel(false), 2500);
  };

  const handleRequestBill = async () => {
    setRequesting(true);
    try {
      await requestBill({
        venueId: identity.venueId,
        tableNumber: identity.table,
        tabletSlot: identity.slot,
        totalDue: aggregate.grandTotal,
      });
    } catch (err) {
      console.error("[BillTab] Failed to request bill:", err);
    } finally {
      setRequesting(false);
    }
  };

  const isLoading = orders === null;

  return (
    <div style={styles.tabPane}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.heading}>Your Bill</h2>
          <p style={styles.subheading}>Table {identity.table} — shared across both tablets</p>
        </div>
        {onAddMoreItems && (
          <button onClick={onAddMoreItems} style={styles.addMoreBtn}>
            + Add More Items
          </button>
        )}
      </div>

      {isLoading && <BillSkeleton />}

      {!isLoading && error && (
        <div style={styles.errorBox}>
          <p style={{ fontFamily: theme.font.body, fontSize: 14, color: theme.color.danger, margin: 0 }}>
            Could not load your bill. Ask staff for help.
          </p>
        </div>
      )}

      {!isLoading && !error && orders.length === 0 && (
        <div style={styles.emptyState}>
          <span style={{ fontSize: 40 }}>🧾</span>
          <p style={styles.emptyTitle}>Nothing ordered yet</p>
          <p style={styles.emptyBody}>Items you order will show up here, with the running total for your table.</p>
        </div>
      )}

      {!isLoading && !error && orders.length > 0 && (
        <>
          {reorderedLabel && (
            <div style={styles.reorderedToast}>
              <span>✓ Added to cart — review in the cart drawer.</span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {orders.map((order) => (
              <OrderGroup key={order.id} order={order} onReorder={cart ? handleReorder : undefined} />
            ))}
          </div>

          <div style={styles.grandTotalCard}>
            <div style={styles.grandTotalBreakdown}>
              <div style={styles.grandBreakdownRow}>
                <span style={styles.grandBreakdownLabel}>Subtotal</span>
                <span style={styles.grandBreakdownValue}>${aggregate.subtotal.toFixed(2)}</span>
              </div>
              {aggregate.taxAmount > 0 && (
                <div style={styles.grandBreakdownRow}>
                  <span style={styles.grandBreakdownLabel}>Tax</span>
                  <span style={styles.grandBreakdownValue}>${aggregate.taxAmount.toFixed(2)}</span>
                </div>
              )}
              {aggregate.serviceChargeAmount > 0 && (
                <div style={styles.grandBreakdownRow}>
                  <span style={styles.grandBreakdownLabel}>Service charge</span>
                  <span style={styles.grandBreakdownValue}>${aggregate.serviceChargeAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
            <div style={styles.grandTotalRow}>
              <span style={styles.grandTotalLabel}>Total Due</span>
              <span style={styles.grandTotalValue}>${aggregate.grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {hasActiveBillRequest ? (
            <div style={styles.notifiedBox}>
              <p style={{ fontFamily: theme.font.display, fontWeight: 700, fontSize: 14, color: theme.color.accent, margin: 0 }}>
                Staff has been notified
              </p>
              <p style={{ fontFamily: theme.font.body, fontSize: 12, color: theme.color.textMuted, margin: "4px 0 0" }}>
                Someone will be over shortly to settle up.
              </p>
            </div>
          ) : (
            <button
              onClick={handleRequestBill}
              disabled={requesting}
              style={{ ...styles.requestBillBtn, opacity: requesting ? 0.6 : 1 }}
            >
              {requesting ? "Notifying staff…" : "Request Bill"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  tabPane: {
    maxWidth: 680,
    margin: "0 auto",
    paddingBottom: 16,
    animation: "fadeUp 0.3s ease both",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  heading: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 22,
    color: theme.color.textPrimary,
    margin: "0 0 4px",
  },
  subheading: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
    margin: 0,
  },
  addMoreBtn: {
    padding: "9px 16px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  errorBox: {
    padding: "20px",
    background: theme.color.dangerBg,
    border: `1px solid ${theme.color.danger}30`,
    borderRadius: 14,
  },
  emptyState: {
    textAlign: "center",
    padding: "50px 20px",
  },
  emptyTitle: {
    margin: "12px 0 4px",
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 16,
    color: theme.color.textSecondary,
  },
  emptyBody: {
    margin: 0,
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
    maxWidth: 300,
    marginLeft: "auto",
    marginRight: "auto",
    lineHeight: 1.6,
  },
  orderCard: {
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.lg,
    padding: 16,
  },
  orderHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  orderTime: {
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textFaint,
  },
  orderNumber: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    color: theme.color.textSecondary,
    marginRight: 4,
  },
  orderStatus: {
    fontFamily: theme.font.display,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    padding: "3px 8px",
    borderRadius: 6,
  },
  reorderBtn: {
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 10,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  reorderedToast: {
    textAlign: "center",
    padding: "10px 14px",
    background: theme.color.accentBg,
    border: `1px solid ${theme.color.accentBorder}`,
    borderRadius: theme.radius.sm,
    marginBottom: 14,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    color: theme.color.accent,
  },
  orderItemBlock: {
    padding: "4px 0",
  },
  orderItemRow: {
    display: "flex",
    justifyContent: "space-between",
  },
  orderItemName: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textSecondary,
  },
  orderItemPrice: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textSecondary,
  },
  modifierLine: {
    margin: "2px 0 0",
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.accent,
  },
  instructionsLine: {
    margin: "2px 0 0",
    fontFamily: theme.font.body,
    fontSize: 11,
    fontStyle: "italic",
    color: theme.color.textFaint,
  },
  orderBreakdown: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: `1px solid ${theme.color.border}`,
  },
  orderBreakdownRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "2px 0",
  },
  orderBreakdownLabel: {
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textFaint,
  },
  orderBreakdownValue: {
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textFaint,
  },
  orderSubtotalRow: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTop: `1px solid ${theme.color.border}`,
  },
  orderSubtotalLabel: {
    fontFamily: theme.font.display,
    fontSize: 11,
    fontWeight: 700,
    color: theme.color.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  orderSubtotalValue: {
    fontFamily: theme.font.display,
    fontSize: 13,
    fontWeight: 700,
    color: theme.color.textPrimary,
  },
  grandTotalCard: {
    background: theme.color.accentBg,
    border: `1px solid ${theme.color.accentBorder}`,
    borderRadius: theme.radius.lg,
    padding: "18px 20px",
    marginBottom: 16,
  },
  grandTotalBreakdown: {
    marginBottom: 10,
  },
  grandBreakdownRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "2px 0",
  },
  grandBreakdownLabel: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.accent,
    opacity: 0.8,
  },
  grandBreakdownValue: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.accent,
    opacity: 0.8,
  },
  grandTotalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTop: `1px solid ${theme.color.accentBorder}`,
  },
  grandTotalLabel: {
    fontFamily: theme.font.display,
    fontSize: 13,
    fontWeight: 700,
    color: theme.color.accent,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  grandTotalValue: {
    fontFamily: theme.font.display,
    fontSize: 28,
    fontWeight: 800,
    color: theme.color.accent,
  },
  requestBillBtn: {
    width: "100%",
    padding: "18px",
    borderRadius: theme.radius.md,
    border: `1.5px solid ${theme.color.borderStrong}`,
    background: theme.color.surface,
    color: theme.color.textPrimary,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "0.02em",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  notifiedBox: {
    textAlign: "center",
    padding: "18px",
    background: theme.color.accentBg,
    border: `1px solid ${theme.color.accentBorder}`,
    borderRadius: theme.radius.md,
  },
};
