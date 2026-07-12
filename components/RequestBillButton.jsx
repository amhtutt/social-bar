"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/RequestBillButton.jsx  —  Customer-facing "Request Bill" button
//
// Floating button, same always-visible pattern as CallServerButton — "I
// want to pay" is one of the most time-sensitive things a customer does,
// and previously the only way to ask was to navigate to the Bill tab and
// use the button there. This makes it reachable from anywhere, one tap,
// matching Call Server's prominence.
//
// Stacks directly above CallServerButton (same left column) when both
// feature flags are on; otherwise takes the base position. Hidden while
// already on the Bill tab, where BillTab renders its own inline version
// of the same action — no point showing it twice.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import { requestBill, subscribeToTableOrders, subscribeToTableBillRequest } from "@/lib/orderService";
import { theme } from "@/lib/theme";

export default function RequestBillButton({ identity, stacked, hidden }) {
  const [orders, setOrders] = useState([]);
  const [billRequest, setBillRequest] = useState(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const unsub = subscribeToTableOrders(identity.venueId, identity.table, ({ data, error }) => {
      if (!error) setOrders(data);
    });
    return () => unsub();
  }, [identity.venueId, identity.table]);

  useEffect(() => {
    const unsub = subscribeToTableBillRequest(identity.venueId, identity.table, ({ data }) => {
      setBillRequest(data);
    });
    return () => unsub();
  }, [identity.venueId, identity.table]);

  const grandTotal = useMemo(() => orders.reduce((sum, o) => sum + (o.totalPrice ?? 0), 0), [orders]);
  const isPending = billRequest?.status === "pending";

  if (hidden || orders.length === 0) return null;

  const handleRequest = async () => {
    if (isPending || requesting) return;
    setRequesting(true);
    try {
      await requestBill({
        venueId: identity.venueId,
        tableNumber: identity.table,
        tabletSlot: identity.slot,
        totalDue: grandTotal,
      });
    } catch (err) {
      console.error("[RequestBillButton] requestBill failed:", err);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <button
      onClick={handleRequest}
      disabled={isPending || requesting}
      style={{
        ...styles.button,
        ...(stacked ? styles.buttonStacked : {}),
        ...(isPending ? styles.buttonConfirmed : {}),
        opacity: requesting ? 0.6 : 1,
      }}
    >
      <span style={styles.icon}>{isPending ? "✓" : "🧾"}</span>
      <span style={styles.label}>{isPending ? "Bill Requested" : "Request Bill"}</span>
    </button>
  );
}

const styles = {
  button: {
    position: "fixed",
    bottom: 84,
    left: 20,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "14px 18px",
    borderRadius: theme.radius.pill,
    border: `1.5px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.04)",
    color: theme.color.textSecondary,
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
    zIndex: 50,
    transition: "all 0.25s ease",
  },
  buttonStacked: {
    bottom: 146,
  },
  buttonConfirmed: {
    border: `1.5px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
  },
  icon: {
    fontSize: 15,
  },
  label: {
    whiteSpace: "nowrap",
  },
};
