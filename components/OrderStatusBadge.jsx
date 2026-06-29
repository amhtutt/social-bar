"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/OrderStatusBadge.jsx  —  Persistent "you have orders in" indicator
//
// Small pill, visible from the Menu tab, showing how many orders this
// table has placed and the most recent order's status. Subscribes to the
// same table-orders feed BillTab uses, so it's always in sync.
//
// Tapping it calls onViewBill — lets the customer jump straight to the
// Bill tab from wherever they are.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { subscribeToTableOrders } from "@/lib/orderService";
import { theme } from "@/lib/theme";

const STATUS_LABEL = {
  pending: "Pending",
  preparing: "Preparing",
  served: "Served",
};

export default function OrderStatusBadge({ identity, onViewBill }) {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const unsub = subscribeToTableOrders(identity.venueId, identity.table, ({ data, error }) => {
      if (!error) setOrders(data);
    });
    return () => unsub();
  }, [identity.venueId, identity.table]);

  if (orders.length === 0) return null;

  const mostRecent = orders[orders.length - 1];
  const statusLabel = STATUS_LABEL[mostRecent.status] ?? mostRecent.status;

  return (
    <button onClick={onViewBill} style={styles.badge}>
      <span style={styles.dot} />
      <span style={styles.text}>
        {orders.length} order{orders.length === 1 ? "" : "s"} placed · {statusLabel}
      </span>
      <span style={styles.chevron}>›</span>
    </button>
  );
}

const styles = {
  badge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: theme.radius.pill,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    cursor: "pointer",
    marginBottom: 16,
    width: "fit-content",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: theme.color.accent,
    boxShadow: `0 0 6px ${theme.color.accentGlow}`,
    flexShrink: 0,
    animation: "ping 2s ease-out infinite",
  },
  text: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    color: theme.color.accent,
    whiteSpace: "nowrap",
  },
  chevron: {
    color: theme.color.accent,
    fontSize: 14,
    opacity: 0.6,
  },
};
