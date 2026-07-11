"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/admin/ConfirmDialog.jsx  —  Delete confirmation
// ─────────────────────────────────────────────────────────────────────────────

import Modal from "./Modal";
import { theme } from "@/lib/theme";

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirming, confirmLabel }) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={400}>
      <p style={styles.message}>{message}</p>
      <div style={styles.actions}>
        <button onClick={onClose} style={styles.cancelBtn}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={confirming} style={{ ...styles.deleteBtn, opacity: confirming ? 0.6 : 1 }}>
          {confirming ? (confirmLabel ? "Working…" : "Deleting…") : confirmLabel ?? "Delete"}
        </button>
      </div>
    </Modal>
  );
}

const styles = {
  message: {
    fontFamily: theme.font.body,
    fontSize: 14,
    color: theme.color.textSecondary,
    lineHeight: 1.6,
    margin: "0 0 20px",
  },
  actions: {
    display: "flex",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    padding: "12px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textSecondary,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  deleteBtn: {
    flex: 1,
    padding: "12px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.danger}`,
    background: theme.color.dangerBg,
    color: theme.color.danger,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
};
