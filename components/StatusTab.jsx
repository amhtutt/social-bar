"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/StatusTab.jsx  —  Status content, shown inside StaffPinModal
//
// No longer a customer-facing tab — customers never see this directly.
// StaffPinModal renders this only after the correct staff PIN is entered.
//
// CHANGED: removed the oversized "Table 1" hero card + giant heading that
// used to lead this view. That made sense as a full-page tab, but reads as
// broken/redundant inside a compact popup — the page header right above
// the popup already shows "Table N · Tablet X" persistently, so repeating
// it here (at 80px font size) just created visual clutter and an apparent
// layout glitch. This is now just the compact info grid + reset button.
// ─────────────────────────────────────────────────────────────────────────────

import { theme } from "@/lib/theme";

const STATUS_CONFIG = {
  connecting: { color: theme.color.warning, label: "Connecting…" },
  online: { color: theme.color.accent, label: "Online" },
  reconnecting: { color: theme.color.info, label: "Reconnecting" },
  offline: { color: theme.color.danger, label: "Offline" },
};

function InfoTile({ label, value, accentColor }) {
  return (
    <div style={styles.infoTile}>
      <p style={styles.infoTileLabel}>{label}</p>
      <p style={{ ...styles.infoTileValue, color: accentColor ?? theme.color.textPrimary }}>{value}</p>
    </div>
  );
}

export default function StatusTab({ identity, connStatus, lastSynced, onReset, resetting }) {
  const statusCfg = STATUS_CONFIG[connStatus] ?? STATUS_CONFIG.connecting;
  const lastSyncedLabel = lastSynced
    ? lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <div style={styles.wrap}>
      <div style={styles.infoGrid}>
        <InfoTile label="Table" value={identity.table} />
        <InfoTile label="Slot" value={identity.slot} />
        <InfoTile label="Firebase" value={statusCfg.label} accentColor={statusCfg.color} />
      </div>

      <div style={styles.lastSyncedRow}>
        <span style={styles.lastSyncedLabel}>LAST SYNCED</span>
        <span style={styles.lastSyncedValue}>{lastSyncedLabel}</span>
      </div>

      <div style={styles.divider} />

      <button onClick={onReset} disabled={resetting} style={{ ...styles.resetBtn, opacity: resetting ? 0.5 : 1 }}>
        {resetting ? "Resetting…" : "Reset Tablet Setup"}
      </button>

      <p style={styles.resetHint}>This clears table/slot assignment and sends the tablet back to setup.</p>
    </div>
  );
}

const styles = {
  wrap: {
    padding: "20px",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
    marginBottom: 16,
  },
  infoTile: {
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.md,
    padding: "14px 16px",
    textAlign: "center",
  },
  infoTileLabel: {
    margin: 0,
    fontSize: 10,
    color: theme.color.textMuted,
    fontFamily: theme.font.display,
    letterSpacing: "0.1em",
    marginBottom: 5,
    textTransform: "uppercase",
  },
  infoTileValue: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    fontFamily: theme.font.display,
  },
  lastSyncedRow: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  lastSyncedLabel: {
    fontFamily: theme.font.display,
    fontSize: 10,
    color: theme.color.textFaint,
    letterSpacing: "0.06em",
  },
  lastSyncedValue: {
    fontFamily: theme.font.display,
    fontSize: 12,
    fontWeight: 600,
    color: theme.color.textSecondary,
  },
  divider: {
    height: 1,
    background: theme.color.border,
    marginBottom: 16,
  },
  resetBtn: {
    width: "100%",
    borderRadius: theme.radius.md,
    border: `1.5px solid ${theme.color.borderStrong}`,
    background: theme.color.surface,
    color: theme.color.textSecondary,
    fontFamily: theme.font.display,
    fontWeight: 600,
    letterSpacing: "0.02em",
    transition: "all 0.2s ease",
    padding: "15px",
    fontSize: 14,
    cursor: "pointer",
  },
  resetHint: {
    margin: "8px 0 0",
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textFaint,
    textAlign: "center",
    lineHeight: 1.5,
  },
};
