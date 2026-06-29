"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/CallServerButton.jsx  —  Customer-facing "Call Server" button
//
// Floating button, always visible (when the callServer feature flag is
// on) regardless of which tab is active — same positioning pattern as
// CartButton, but on the opposite side so they never collide.
//
// After tapping, shows "Staff notified" confirmation state for a few
// seconds, then reverts to the normal button so the table can call again
// if needed. No "reason" field per product decision.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { callServer, subscribeToTableServerCall } from "@/lib/callServerService";
import { useRateLimit } from "@/lib/useRateLimit";
import { theme } from "@/lib/theme";

const CONFIRMATION_DURATION = 4000; // ms
const CALL_COOLDOWN = 15000; // ms — prevents rapid re-tapping after a call resolves

export default function CallServerButton({ identity }) {
  const [justCalled, setJustCalled] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const { isLimited, secondsLeft, trigger } = useRateLimit(CALL_COOLDOWN);

  // Watch this table's most recent call so the button reflects reality
  // even if another tablet at the same table (Tablet A vs B) already
  // called — both tablets should show "already called" together.
  useEffect(() => {
    const unsub = subscribeToTableServerCall(identity.venueId, identity.table, ({ data }) => {
      setActiveCall(data);
    });
    return () => unsub();
  }, [identity.venueId, identity.table]);

  const isPending = activeCall?.status === "pending";

  const handleCall = () =>
    trigger(async () => {
      try {
        await callServer({ venueId: identity.venueId, tableNumber: identity.table, tabletSlot: identity.slot });
        setJustCalled(true);
        setTimeout(() => setJustCalled(false), CONFIRMATION_DURATION);
      } catch (err) {
        console.error("[CallServerButton] callServer failed:", err);
      }
    });

  const showConfirmed = justCalled || isPending;

  return (
    <button
      onClick={handleCall}
      disabled={isLimited}
      style={{ ...styles.button, ...(showConfirmed ? styles.buttonConfirmed : {}), opacity: isLimited && !showConfirmed ? 0.6 : 1 }}
    >
      <span style={styles.icon}>{showConfirmed ? "✓" : "🔔"}</span>
      <span style={styles.label}>
        {showConfirmed ? "Staff Notified" : isLimited ? `Wait ${secondsLeft}s` : "Call Server"}
      </span>
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
