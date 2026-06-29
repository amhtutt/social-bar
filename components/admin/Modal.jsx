"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/admin/Modal.jsx  —  Reusable modal dialog
//
// Used for both add/edit forms and delete confirmations across the admin
// menu editor. Closes on backdrop click or Escape key.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { theme } from "@/lib/theme";

export default function Modal({ open, onClose, title, children, maxWidth = 480 }) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={{ ...styles.dialog, maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>{title}</h3>
          <button onClick={onClose} style={styles.closeBtn}>
            ✕
          </button>
        </div>
        <div style={styles.body}>{children}</div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 200,
    animation: "fadeUp 0.2s ease both",
  },
  dialog: {
    width: "100%",
    background: "#13161c",
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.lg,
    boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
    maxHeight: "85vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 20px",
    borderBottom: `1px solid ${theme.color.border}`,
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 17,
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
  body: {
    padding: 20,
    overflowY: "auto",
  },
};
