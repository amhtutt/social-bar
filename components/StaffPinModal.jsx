"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/StaffPinModal.jsx  —  PIN-gated access to Status/Reset
//
// Replaces the customer-facing Status tab. A small lock icon sits in the
// header next to the online/offline indicator; tapping it opens a tiny
// PIN prompt. The venue's staffPin (set by Admin, lives on the venue
// document) gates access — only on a correct PIN does the actual Status
// content (table info + Reset Tablet Setup) render.
//
// This is intentionally a single shared PIN per venue, not per-staff-member
// auth — it's a "keep customers out," not a "track which staff member did
// this" control. (StaffManager / role-based auth already exists for that
// distinction in /admin and /staff.)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { theme } from "@/lib/theme";
import StatusTab from "./StatusTab";

export default function StaffPinModal({ identity, connStatus, lastSynced, onReset, resetting, staffPin }) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);

  // createPortal needs document.body to exist — only true after mount in
  // a Next.js client component, so guard against a server-render mismatch.
  useEffect(() => setMounted(true), []);

  const openPrompt = () => {
    setPinInput("");
    setError(false);
    setPromptOpen(true);
  };

  const closeAll = () => {
    setPromptOpen(false);
    setUnlocked(false);
    setPinInput("");
    setError(false);
  };

  const handleSubmitPin = (e) => {
    e.preventDefault();
    if (pinInput === staffPin) {
      setPromptOpen(false);
      setUnlocked(true);
    } else {
      setError(true);
      setPinInput("");
    }
  };

  return (
    <>
      <button onClick={openPrompt} style={styles.lockBtn} aria-label="Staff access">
        🔒
      </button>

      {/* Rendered via portal directly into document.body — NOT as a child
          of <header>. The header has backdropFilter: blur(...), which in
          modern browsers creates a new CSS containing block for any
          position:fixed descendant. Without the portal, this modal's
          "fixed" backdrop/sheet would be positioned relative to the
          60px-tall header bar instead of the actual viewport, clipping
          and misplacing it near the top of the screen. */}
      {mounted &&
        promptOpen &&
        createPortal(
          <div style={styles.backdrop} onClick={() => setPromptOpen(false)}>
            <form onSubmit={handleSubmitPin} style={styles.promptCard} onClick={(e) => e.stopPropagation()}>
              <p style={styles.promptTitle}>Staff Access</p>
              <p style={styles.promptSubtitle}>Enter the staff PIN to view table status and reset options.</p>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setError(false);
                }}
                placeholder="PIN"
                style={{ ...styles.pinInput, ...(error ? styles.pinInputError : {}) }}
              />
              {error && <p style={styles.errorText}>Incorrect PIN.</p>}
              <div style={styles.promptActions}>
                <button type="button" onClick={() => setPromptOpen(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" style={styles.unlockBtn}>
                  Unlock
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

      {mounted &&
        unlocked &&
        createPortal(
          <div style={styles.backdrop} onClick={closeAll}>
            <div style={styles.statusSheet} onClick={(e) => e.stopPropagation()}>
              <div style={styles.statusHeader}>
                <span style={styles.statusHeaderTitle}>Table Status</span>
                <button onClick={closeAll} style={styles.closeBtn}>
                  ✕
                </button>
              </div>
              <StatusTab
                identity={identity}
                connStatus={connStatus}
                lastSynced={lastSynced}
                onReset={onReset}
                resetting={resetting}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

const styles = {
  lockBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textMuted,
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(5,6,8,0.88)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 300,
    padding: 20,
    animation: "fadeUp 0.2s ease both",
  },
  promptCard: {
    width: "100%",
    maxWidth: 320,
    background: "#13161c",
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.lg,
    padding: "24px 22px",
    boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
  },
  promptTitle: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 17,
    color: theme.color.textPrimary,
    margin: "0 0 6px",
  },
  promptSubtitle: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textMuted,
    margin: "0 0 16px",
    lineHeight: 1.5,
  },
  pinInput: {
    width: "100%",
    padding: "13px 14px",
    borderRadius: theme.radius.sm,
    border: `1.5px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textPrimary,
    fontFamily: theme.font.display,
    fontSize: 18,
    letterSpacing: "0.2em",
    textAlign: "center",
    outline: "none",
  },
  pinInputError: {
    border: `1.5px solid ${theme.color.danger}`,
  },
  errorText: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.danger,
    margin: "8px 0 0",
    textAlign: "center",
  },
  promptActions: {
    display: "flex",
    gap: 8,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    padding: "11px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textSecondary,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  unlockBtn: {
    flex: 1,
    padding: "11px",
    borderRadius: theme.radius.sm,
    border: "none",
    background: `linear-gradient(135deg, ${theme.color.accent} 0%, #00c87a 100%)`,
    color: theme.color.bg,
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
  },
  statusSheet: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85vh",
    overflowY: "auto",
    background: "#0e1015",
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.xl,
    boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
  },
  statusHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 20px",
    borderBottom: `1px solid ${theme.color.border}`,
    position: "sticky",
    top: 0,
    background: "#0e1015",
  },
  statusHeaderTitle: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 16,
    color: theme.color.textPrimary,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textSecondary,
    fontSize: 13,
    cursor: "pointer",
  },
};
