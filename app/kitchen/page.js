"use client";

// ─────────────────────────────────────────────────────────────────────────────
// app/kitchen/page.js  —  Kitchen Display System (KDS)
//
// Dedicated screen meant for a single tablet/monitor left running in the
// kitchen — NOT a tab inside /staff. Shows every order venue-wide as a
// ticket, oldest first (FIFO), since "what do I cook next" maps better to
// chronological order than the table-grouped layout Floor View uses.
//
// READ-ONLY in this first version, per product decision — no status
// buttons, no tap targets. Designed for viewing from a few feet away in a
// busy kitchen: larger text, higher contrast, no fine print, no dense
// multi-column layout.
//
// Auth: same AdminGuard pattern as /staff — admin, manager, or server can
// view. A venue can hand a server-tier login to kitchen staff specifically
// if they want a lighter-weight account than admin/manager.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { signOut } from "@/lib/userService";
import { subscribeToVenueOrders } from "@/lib/orderService";
import { theme } from "@/lib/theme";
import AdminGuard from "@/components/admin/AdminGuard";
import StagingBanner from "@/components/StagingBanner";

export default function KitchenPage() {
  return (
    <AdminGuard requiredRoles={["admin", "manager", "server"]}>
      <KitchenPageContent />
    </AdminGuard>
  );
}

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

function KitchenTicket({ order }) {
  const timeLabel = order.createdAt
    ? order.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  const minutesAgo = order.createdAt ? Math.floor((Date.now() - order.createdAt.getTime()) / 60000) : null;
  const isUrgent = minutesAgo !== null && minutesAgo >= 10;

  return (
    <div style={{ ...styles.ticket, ...(isUrgent ? styles.ticketUrgent : {}) }}>
      <div style={styles.ticketHeader}>
        <div>
          <span style={styles.tableLabel}>TABLE {order.tableNumber}</span>
          {order.orderNumber && <span style={styles.orderNumber}>#{order.orderNumber}</span>}
        </div>
        <div style={styles.timeBlock}>
          <span style={{ ...styles.minutesAgo, ...(isUrgent ? styles.minutesAgoUrgent : {}) }}>
            {minutesAgo !== null ? `${minutesAgo}m ago` : ""}
          </span>
          <span style={styles.timeLabel}>{timeLabel}</span>
        </div>
      </div>

      <div style={styles.itemList}>
        {order.items.map((item, i) => (
          <div key={i} style={styles.itemRow}>
            <span style={styles.itemQty}>{item.quantity}×</span>
            <div style={{ flex: 1 }}>
              <span style={styles.itemName}>{item.name_en}</span>
              {item.selectedModifiers?.length > 0 && (
                <p style={styles.modifierLine}>{item.selectedModifiers.map((m) => m.optionName_en).join(", ")}</p>
              )}
              {item.specialInstructions && <p style={styles.instructionsLine}>⚠ {item.specialInstructions}</p>}
            </div>
          </div>
        ))}
      </div>

      {order.source === "staff" && <p style={styles.staffTag}>Added by staff</p>}
    </div>
  );
}

function KitchenPageContent() {
  const { profile, venueId } = useAuth();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    const unsub = subscribeToVenueOrders(venueId, ({ data, error }) => {
      if (error) console.error("[KitchenPage] subscribeToVenueOrders error:", error);
      setError(!!error);
      setOrders(error ? [] : [...data].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)));
    });
    return () => unsub();
  }, [venueId]);

  // Re-render every 30s purely so "Xm ago" / the urgency highlight stays
  // accurate without requiring a new Firestore snapshot.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const isLoading = orders === null;

  return (
    <div style={styles.page}>
      <StagingBanner />
      <style>{`@keyframes shimmerSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>

      <header style={styles.header}>
        <h1 style={styles.title}>🍳 Kitchen</h1>
        <div style={styles.headerRight}>
          <span style={styles.ticketCount}>{isLoading ? "" : `${orders.length} active`}</span>
          <span style={styles.userEmail}>{profile?.email}</span>
          <button onClick={() => signOut()} style={styles.signOutBtn}>
            Sign Out
          </button>
        </div>
      </header>

      <main style={styles.content}>
        {error && (
          <div style={styles.errorBox}>
            <p style={{ fontFamily: theme.font.body, fontSize: 16, color: theme.color.danger, margin: 0 }}>
              Could not load orders. Check the connection or ask for help.
            </p>
          </div>
        )}

        {isLoading && !error && (
          <div style={styles.grid}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  height: 200,
                  borderRadius: theme.radius.lg,
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

        {!isLoading && !error && orders.length === 0 && (
          <div style={styles.emptyState}>
            <span style={{ fontSize: 56 }}>✅</span>
            <p style={styles.emptyTitle}>All caught up</p>
            <p style={styles.emptyBody}>New orders will appear here automatically.</p>
          </div>
        )}

        {!isLoading && !error && orders.length > 0 && (
          <div style={styles.grid}>
            {orders.map((order) => (
              <KitchenTicket key={order.id} order={order} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: theme.color.bg,
    padding: "20px 24px 40px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    flexWrap: "wrap",
    gap: 12,
  },
  title: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 30,
    color: theme.color.textPrimary,
    margin: 0,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  ticketCount: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 15,
    color: theme.color.accent,
  },
  userEmail: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
  },
  signOutBtn: {
    padding: "9px 16px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textSecondary,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  content: {
    maxWidth: 1600,
    margin: "0 auto",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 18,
  },
  errorBox: {
    padding: 24,
    background: theme.color.dangerBg,
    border: `1px solid ${theme.color.danger}30`,
    borderRadius: theme.radius.md,
  },
  emptyState: {
    textAlign: "center",
    padding: "100px 20px",
  },
  emptyTitle: {
    margin: "16px 0 6px",
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 24,
    color: theme.color.textSecondary,
  },
  emptyBody: {
    margin: 0,
    fontFamily: theme.font.body,
    fontSize: 15,
    color: theme.color.textMuted,
  },
  ticket: {
    background: theme.color.surface,
    border: `2px solid ${theme.color.border}`,
    borderRadius: theme.radius.lg,
    padding: 18,
    transition: "border-color 0.3s ease",
  },
  ticketUrgent: {
    border: `2px solid ${theme.color.danger}`,
    boxShadow: `0 0 0 1px ${theme.color.danger}40, 0 8px 24px rgba(239,68,68,0.12)`,
  },
  ticketHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    paddingBottom: 14,
    borderBottom: `1px solid ${theme.color.border}`,
  },
  tableLabel: {
    display: "block",
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 22,
    color: theme.color.textPrimary,
    letterSpacing: "-0.01em",
  },
  orderNumber: {
    display: "block",
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textFaint,
    marginTop: 2,
  },
  timeBlock: {
    textAlign: "right",
  },
  minutesAgo: {
    display: "block",
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 17,
    color: theme.color.accent,
  },
  minutesAgoUrgent: {
    color: theme.color.danger,
  },
  timeLabel: {
    display: "block",
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textFaint,
    marginTop: 2,
  },
  itemList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  itemRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
  itemQty: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 17,
    color: theme.color.accent,
    flexShrink: 0,
    minWidth: 28,
  },
  itemName: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 17,
    color: theme.color.textPrimary,
  },
  modifierLine: {
    margin: "3px 0 0",
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textSecondary,
  },
  instructionsLine: {
    margin: "3px 0 0",
    fontFamily: theme.font.body,
    fontSize: 13,
    fontWeight: 700,
    color: theme.color.warning,
  },
  staffTag: {
    margin: "12px 0 0",
    paddingTop: 10,
    borderTop: `1px solid ${theme.color.border}`,
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textFaint,
    fontStyle: "italic",
  },
};
