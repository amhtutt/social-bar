"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/staff/ActivityLogPanel.jsx  —  Audit trail viewer
//
// Global feed by default; clicking a table number filters to just that
// table. Re-subscribes whenever the filter changes since the underlying
// query itself changes (different where() clause), not just client-side
// filtering of one big result set.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { subscribeToVenueActivityLog } from "@/lib/activityLogService";
import { theme } from "@/lib/theme";

const ACTION_LABELS = {
  item_removed: { label: "Item Removed", color: theme.color.danger },
  item_removal_undone: { label: "↩ Item Restored", color: theme.color.accent },
  item_quantity_changed: { label: "Quantity Changed", color: theme.color.warning },
  order_voided: { label: "Order Voided", color: theme.color.danger },
  order_void_undone: { label: "↩ Order Restored", color: theme.color.accent },
  order_created: { label: "Order Added", color: theme.color.accent },
  bill_acknowledged: { label: "Bill Acknowledged", color: theme.color.info },
  tab_closed: { label: "✓ Tab Closed", color: theme.color.accent },
  server_call_acknowledged: { label: "Call Acknowledged", color: theme.color.info },
  menu_item_created: { label: "Menu Item Added", color: theme.color.accent },
  menu_item_updated: { label: "Menu Item Updated", color: theme.color.info },
  menu_item_price_changed: { label: "Price Changed", color: theme.color.warning },
  menu_item_deleted: { label: "Menu Item Deleted", color: theme.color.danger },
  menu_items_bulk_available: { label: "Bulk: Marked Available", color: theme.color.accent },
  menu_items_bulk_unavailable: { label: "Bulk: Marked Unavailable", color: theme.color.warning },
  price_validation_failed: { label: "⚠ Price Mismatch", color: theme.color.danger },
};

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

export default function ActivityLogPanel({ venueId, availableTables = [] }) {
  const [tableFilter, setTableFilter] = useState(null);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    const unsub = subscribeToVenueActivityLog(
      venueId,
      ({ data, error }) => {
        if (error) console.error("[ActivityLogPanel] subscribe error:", error);
        setError(!!error);
        setEntries(error ? [] : data);
      },
      tableFilter !== null ? { tableNumber: tableFilter } : {}
    );
    return () => unsub();
  }, [venueId, tableFilter]);

  const isLoading = entries === null;

  return (
    <div>
      <div style={styles.filterRow}>
        <button
          onClick={() => setTableFilter(null)}
          style={{ ...styles.filterChip, ...(tableFilter === null ? styles.filterChipActive : {}) }}
        >
          All Tables
        </button>
        {availableTables.map((t) => (
          <button
            key={t}
            onClick={() => setTableFilter(t)}
            style={{ ...styles.filterChip, ...(tableFilter === t ? styles.filterChipActive : {}) }}
          >
            Table {t}
          </button>
        ))}
      </div>

      {isLoading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: 48,
                borderRadius: theme.radius.sm,
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
      )}

      {!isLoading && error && (
        <div style={styles.errorBox}>
          <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.danger, margin: 0 }}>
            Could not load activity log.
          </p>
        </div>
      )}

      {!isLoading && !error && entries.length === 0 && (
        <div style={styles.emptyState}>
          <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.textMuted }}>
            No activity recorded yet.
          </p>
        </div>
      )}

      {!isLoading && !error && entries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {entries.map((entry) => {
            const cfg = ACTION_LABELS[entry.action] ?? { label: entry.action, color: theme.color.textMuted };
            const timeLabel = entry.createdAt
              ? entry.createdAt.toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—";

            return (
              <div key={entry.id} style={styles.row}>
                <span
                  style={{
                    ...styles.actionTag,
                    color: cfg.color,
                    borderColor: `${cfg.color}40`,
                    background: `${cfg.color}14`,
                  }}
                >
                  {cfg.label}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={styles.details}>{entry.details}</p>
                  <p style={styles.meta}>
                    {entry.tableNumber !== null && entry.tableNumber !== undefined && <>Table {entry.tableNumber} · </>}
                    {entry.actorEmail} ({entry.actorRole})
                  </p>
                </div>
                <span style={styles.time}>{timeLabel}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  filterRow: {
    display: "flex",
    gap: 6,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  filterChip: {
    padding: "6px 12px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.02)",
    color: theme.color.textMuted,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
  },
  filterChipActive: {
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
  },
  errorBox: {
    padding: 16,
    background: theme.color.dangerBg,
    border: `1px solid ${theme.color.danger}30`,
    borderRadius: theme.radius.md,
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.sm,
  },
  actionTag: {
    flexShrink: 0,
    fontFamily: theme.font.display,
    fontSize: 10,
    fontWeight: 700,
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid",
    whiteSpace: "nowrap",
  },
  details: {
    margin: 0,
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textPrimary,
  },
  meta: {
    margin: "2px 0 0",
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textFaint,
  },
  time: {
    flexShrink: 0,
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textFaint,
    whiteSpace: "nowrap",
  },
};
