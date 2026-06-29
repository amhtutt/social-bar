"use client";

// ─────────────────────────────────────────────────────────────────────────────
// app/kitchen/page.js  —  Kitchen Display System (KDS)
//
// Dedicated screen for a single tablet/monitor left running in the
// kitchen. Still READ-ONLY with respect to order status (no
// Preparing/Ready buttons) — that's a deliberate, deferred decision.
//
// Three additions in this pass:
//   1. Tickets split into "New" (under 5 min) and "Older" sections,
//      instead of one long undifferentiated grid — urgency is grouped,
//      not just color-coded per card.
//   2. A short audible chime plays when a NEW order arrives, since
//      kitchen staff are heads-down cooking, not watching the screen.
//   3. A "Dismiss" button per ticket — LOCAL ONLY (localStorage on this
//      device), does NOT touch order status in Firestore. This is
//      intentionally not the same as marking an order "served" — it's
//      just "stop showing me this on this kitchen screen." Dismissals do
//      NOT sync across multiple kitchen screens, which is the correct
//      tradeoff for a purely local "get this off my view" action.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { signOut } from "@/lib/userService";
import { subscribeToVenueOrders } from "@/lib/orderService";
import { theme } from "@/lib/theme";
import AdminGuard from "@/components/admin/AdminGuard";
import StagingBanner from "@/components/StagingBanner";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

const NEW_TICKET_THRESHOLD_MIN = 5;
const URGENT_THRESHOLD_MIN = 10;
const DISMISSED_STORAGE_KEY = "kitchen_dismissed_order_ids";

function loadDismissedIds() {
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissedIds(idSet) {
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(Array.from(idSet)));
  } catch {
    // ignore — worst case, a dismissed ticket reappears after a refresh
  }
}

/**
 * playChime()
 * A short, simple two-tone beep using the Web Audio API directly —
 * avoids needing an audio file asset. Wrapped in try/catch since some
 * browsers block audio until a user interaction has occurred on the
 * page; failing silently is far better than crashing the whole screen
 * over a sound effect.
 */
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    const now = ctx.currentTime;
    playTone(880, now, 0.15);
    playTone(1100, now + 0.18, 0.18);
  } catch (err) {
    console.warn("[KitchenPage] Could not play chime:", err);
  }
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

function KitchenTicket({ order, onRequestDismiss }) {
  const timeLabel = order.createdAt
    ? order.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  const minutesAgo = order.createdAt ? Math.floor((Date.now() - order.createdAt.getTime()) / 60000) : null;
  const isUrgent = minutesAgo !== null && minutesAgo >= URGENT_THRESHOLD_MIN;

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
        {order.items.map((item, i) => {
          // Visually group consecutive lines of the SAME dish (e.g. two
          // burgers ordered with different modifiers) with a thin
          // connecting divider, rather than letting them look like two
          // unrelated items — easier to scan when a table orders
          // multiple variants of one thing.
          const isSameAsPrevious = i > 0 && order.items[i - 1].name_en === item.name_en;

          return (
            <div key={i} style={{ ...styles.itemRow, ...(isSameAsPrevious ? styles.itemRowGrouped : {}) }}>
              <span style={styles.itemQty}>{item.quantity}×</span>
              <div style={{ flex: 1 }}>
                <span style={styles.itemName}>{item.name_en}</span>
                {item.selectedModifiers?.length > 0 && (
                  <p style={styles.modifierLine}>{item.selectedModifiers.map((m) => m.optionName_en).join(", ")}</p>
                )}
                {item.specialInstructions && <p style={styles.instructionsLine}>⚠ {item.specialInstructions}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {order.source === "staff" && <p style={styles.staffTag}>Added by staff</p>}

      <button onClick={() => onRequestDismiss(order)} style={styles.dismissBtn}>
        Dismiss
      </button>
    </div>
  );
}

function TicketSection({ title, count, accentColor, orders, onRequestDismiss }) {
  if (orders.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={styles.sectionHeader}>
        <span style={{ ...styles.sectionTitle, color: accentColor }}>{title}</span>
        <span style={styles.sectionCount}>{count}</span>
      </div>
      <div style={styles.grid}>
        {orders.map((order) => (
          <KitchenTicket key={order.id} order={order} onRequestDismiss={onRequestDismiss} />
        ))}
      </div>
    </div>
  );
}

function KitchenPageContent() {
  const { profile, venueId } = useAuth();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(false);
  const [dismissedIds, setDismissedIds] = useState(() => new Set());
  const knownOrderIdsRef = useRef(new Set());
  const isFirstSnapshotRef = useRef(true);

  useEffect(() => {
    setDismissedIds(loadDismissedIds());
  }, []);

  useEffect(() => {
    if (!venueId) return;
    const unsub = subscribeToVenueOrders(venueId, ({ data, error }) => {
      if (error) {
        console.error("[KitchenPage] subscribeToVenueOrders error:", error);
        setError(true);
        setOrders([]);
        return;
      }

      const sorted = [...data].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

      // Play a chime if any order in this snapshot is one we haven't seen
      // before — but never on the very first snapshot after page load
      // (otherwise every pre-existing order would chime at once on open).
      if (!isFirstSnapshotRef.current) {
        const hasNewOrder = sorted.some((o) => !knownOrderIdsRef.current.has(o.id));
        if (hasNewOrder) playChime();
      }
      isFirstSnapshotRef.current = false;
      knownOrderIdsRef.current = new Set(sorted.map((o) => o.id));

      setError(false);
      setOrders(sorted);
    });
    return () => unsub();
  }, [venueId]);

  // Re-render every 30s purely so "Xm ago" / urgency / new-vs-older
  // grouping stays accurate without requiring a new Firestore snapshot.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const [dismissTarget, setDismissTarget] = useState(null);

  const handleConfirmDismiss = () => {
    if (!dismissTarget) return;
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(dismissTarget.id);
      saveDismissedIds(next);
      return next;
    });
    setDismissTarget(null);
  };

  const visibleOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => !dismissedIds.has(o.id));
  }, [orders, dismissedIds]);

  const { newOrders, olderOrders } = useMemo(() => {
    const newList = [];
    const olderList = [];
    for (const order of visibleOrders) {
      const minutesAgo = order.createdAt ? (Date.now() - order.createdAt.getTime()) / 60000 : 0;
      if (minutesAgo < NEW_TICKET_THRESHOLD_MIN) {
        newList.push(order);
      } else {
        olderList.push(order);
      }
    }
    return { newOrders: newList, olderOrders: olderList };
  }, [visibleOrders]);

  const isLoading = orders === null;

  return (
    <div style={styles.page}>
      <StagingBanner />
      <style>{`@keyframes shimmerSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>

      <header style={styles.header}>
        <h1 style={styles.title}>🍳 Kitchen</h1>
        <div style={styles.headerRight}>
          <span style={styles.ticketCount}>{isLoading ? "" : `${visibleOrders.length} active`}</span>
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

        {!isLoading && !error && visibleOrders.length === 0 && (
          <div style={styles.emptyState}>
            <span style={{ fontSize: 56 }}>✅</span>
            <p style={styles.emptyTitle}>All caught up</p>
            <p style={styles.emptyBody}>New orders will appear here automatically.</p>
          </div>
        )}

        {!isLoading && !error && visibleOrders.length > 0 && (
          <>
            <TicketSection
              title="NEW"
              count={newOrders.length}
              accentColor={theme.color.accent}
              orders={newOrders}
              onRequestDismiss={setDismissTarget}
            />
            <TicketSection
              title="OLDER"
              count={olderOrders.length}
              accentColor={theme.color.warning}
              orders={olderOrders}
              onRequestDismiss={setDismissTarget}
            />
          </>
        )}
      </main>

      <ConfirmDialog
        open={!!dismissTarget}
        onClose={() => setDismissTarget(null)}
        onConfirm={handleConfirmDismiss}
        title="Dismiss Ticket"
        message={
          dismissTarget
            ? `Dismiss Table ${dismissTarget.tableNumber}'s ticket? This only removes it from THIS kitchen screen — it does not mark the order as served, and it will not reappear unless this screen is refreshed and the dismissal is cleared.`
            : ""
        }
      />
    </div>
  );
}

export default function KitchenPage() {
  return (
    <AdminGuard requiredRoles={["admin", "manager", "server", "kitchen"]}>
      <KitchenPageContent />
    </AdminGuard>
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
  sectionHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 18,
    letterSpacing: "0.08em",
  },
  sectionCount: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textFaint,
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
    marginBottom: 14,
  },
  itemRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
  itemRowGrouped: {
    marginTop: -4,
    paddingTop: 6,
    borderTop: `1px dashed ${theme.color.border}`,
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
    margin: "0 0 12px",
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textFaint,
    fontStyle: "italic",
  },
  dismissBtn: {
    width: "100%",
    padding: "10px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textMuted,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.04em",
    cursor: "pointer",
  },
};
