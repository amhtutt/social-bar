"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/UndoToast.jsx  —  Reusable "Undo" toast with a countdown
//
// The action it's undoing has ALREADY happened by the time this renders —
// this is not a confirmation step (those already exist via ConfirmDialog
// for the riskiest actions). This is the brief grace window AFTER an
// action completes, for the realistic case of "I meant to remove a
// different line" or "wrong table" after the fact.
//
// Auto-dismisses after `durationMs`. Calling onUndo before it expires
// reverses the action and dismisses immediately.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { theme } from "@/lib/theme";

const DEFAULT_DURATION_MS = 6000;

export default function UndoToast({ message, onUndo, onExpire, durationMs = DEFAULT_DURATION_MS }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(durationMs / 1000));
  const expiredRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    const timeout = setTimeout(() => {
      if (!expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    }, durationMs);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  const handleUndo = () => {
    if (expiredRef.current) return;
    expiredRef.current = true;
    onUndo();
  };

  return (
    <div style={styles.toast}>
      <span style={styles.message}>{message}</span>
      <button onClick={handleUndo} style={styles.undoBtn}>
        Undo ({secondsLeft}s)
      </button>
    </div>
  );
}

const styles = {
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "#13161c",
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.lg,
    padding: "12px 16px 12px 20px",
    boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
    zIndex: 400,
    animation: "fadeUp 0.2s ease both",
  },
  message: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textSecondary,
    whiteSpace: "nowrap",
  },
  undoBtn: {
    padding: "8px 16px",
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
};
