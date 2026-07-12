"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/OrderStatusBadge.jsx  —  Persistent "you have orders in" indicator
//
// Small pill + 2-stage stepper, visible from the Menu tab, summarizing
// every active order this table has placed. Subscribes to the same
// table-orders feed BillTab uses, so it's always in sync.
//
// Real order lifecycle (see lib/orderService.js): pending -> completed |
// cancelled. Cancelled orders never reach here — isActiveOrder() filters
// them out upstream — so only pending/completed ever show. The stepper
// reflects the AGGREGATE of every active order, not just the most recent
// one: a table that ordered three rounds where two are done and one is
// still cooking is genuinely "in progress," not "ready."
//
// Tapping it calls onViewBill — lets the customer jump straight to the
// Bill tab from wherever they are.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { subscribeToTableOrders } from "@/lib/orderService";
import { theme } from "@/lib/theme";

export default function OrderStatusBadge({ identity, onViewBill }) {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const unsub = subscribeToTableOrders(identity.venueId, identity.table, ({ data, error }) => {
      if (!error) setOrders(data);
    });
    return () => unsub();
  }, [identity.venueId, identity.table]);

  if (orders.length === 0) return null;

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const completedCount = orders.length - pendingCount;
  const allReady = pendingCount === 0;

  let statusLabel;
  if (pendingCount > 0 && completedCount > 0) statusLabel = `${completedCount} ready, ${pendingCount} preparing`;
  else if (pendingCount > 0) statusLabel = "Preparing";
  else statusLabel = "Ready";

  return (
    <button onClick={onViewBill} style={styles.badge}>
      <div style={styles.stepper}>
        <span style={{ ...styles.step, ...styles.stepFilled }} />
        <span style={{ ...styles.stepLine, ...(allReady ? styles.stepLineFilled : {}) }} />
        <span style={{ ...styles.step, ...(allReady ? styles.stepFilled : {}) }} />
      </div>
      <span style={styles.text}>
        {orders.length} order{orders.length === 1 ? "" : "s"} · {statusLabel}
      </span>
      <span style={styles.chevron}>›</span>
    </button>
  );
}

const styles = {
  badge: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 14px",
    borderRadius: theme.radius.pill,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    cursor: "pointer",
    marginBottom: 16,
    width: "fit-content",
  },
  stepper: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  },
  step: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: theme.color.border,
    flexShrink: 0,
  },
  stepFilled: {
    background: theme.color.accent,
    boxShadow: `0 0 6px ${theme.color.accentGlow}`,
  },
  stepLine: {
    width: 14,
    height: 2,
    background: theme.color.border,
  },
  stepLineFilled: {
    background: theme.color.accent,
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
