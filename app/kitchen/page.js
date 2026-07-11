"use client";

// ─────────────────────────────────────────────────────────────────────────────
// app/kitchen/page.js  —  Kitchen Display System (KDS)
//
// Dedicated screen for a single tablet/monitor left running in the
// kitchen. Shows only PENDING orders (subscribeToVenueOrders already
// filters out settled + cancelled; completed orders also leave the view).
//
// Two REAL, Firestore-backed actions per ticket (this replaces the old
// local-only "Dismiss" that just hid a ticket on one screen):
//   • FINISHED  → markOrderCompleted(): order is made + delivered. Ticket
//     leaves every kitchen screen (synced), STAYS on the customer's bill.
//   • DISMISS   → cancelOrderFromKitchen(): can't/won't make it. Ticket
//     leaves every kitchen screen AND drops off the bill and Floor View.
//     Guarded by a confirm dialog (it costs the venue a sale), logged to
//     the activity log, and reversible for a few seconds via an Undo bar.
//
// Both are status changes, never deletes — the record survives for shift
// reports, and they fit the hardened security rules (kitchen role may
// update only an order's status).
//
// Kept from before: New/Older sections, per-ticket urgency coloring, and
// an audible chime when a genuinely new order arrives.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { signOut } from "@/lib/userService";
import {
  subscribeToVenueOrders,
  markOrderCompleted,
  cancelOrderFromKitchen,
  uncancelOrder,
} from "@/lib/orderService";
import { theme } from "@/lib/theme";
import AdminGuard from "@/components/admin/AdminGuard";
import StagingBanner from "@/components/StagingBanner";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

const NEW_TICKET_THRESHOLD_MIN = 5;
const URGENT_THRESHOLD_MIN = 10;
const UNDO_WINDOW_MS = 6000;

/**
 * playChime()
 * A short two-tone beep via the Web Audio API — no audio asset needed.
 * Wrapped in try/catch since some browsers block audio until a user
 * interaction; failing silently beats crashing the screen over a sound.
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

function KitchenTicket({ order, onFinish, onRequestDismiss, busy }) {
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

      <div style={styles.actionRow}>
        <button
          onClick={() => onRequestDismiss(order)}
          disabled={busy}
          style={{ ...styles.dismissBtn, ...(busy ? styles.btnDisabled : {}) }}
        >
          Dismiss
        </button>
        <button
          onClick={() => onFinish(order)}
          disabled={busy}
          style={{ ...styles.finishBtn, ...(busy ? styles.btnDisabled : {}) }}
        >
          ✓ Finished
        </button>
      </div>
    </div>
  );
}

function TicketSection({ title, count, accentColor, orders, onFinish, onRequestDismiss, busyId }) {
  if (orders.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={styles.sectionHeader}>
        <span style={{ ...styles.sectionTitle, color: accentColor }}>{title}</span>
        <span style={styles.sectionCount}>{count}</span>
      </div>
      <div style={styles.grid}>
        {orders.map((order) => (
          <KitchenTicket
            key={order.id}
            order={order}
            onFinish={onFinish}
            onRequestDismiss={onRequestDismiss}
            busy={busyId === order.id}
          />
        ))}
      </div>
    </div>
  );
}

function KitchenPageContent() {
  const { profile, venueId } = useAuth();
  const actor = useMemo(() => ({ email: profile?.email, role: profile?.role }), [profile]);

  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [dismissTarget, setDismissTarget] = useState(null);
  const [undo, setUndo] = useState(null); // { order, timeoutId }

  const knownOrderIdsRef = useRef(new Set());
  const isFirstSnapshotRef = useRef(true);

  // Only PENDING orders belong on the kitchen screen. Completed orders
  // stay on the bill but are done cooking; cancelled/settled are already
  // filtered out upstream by subscribeToVenueOrders. Filtered once here,
  // at the subscription boundary — `orders` state is never consumed
  // unfiltered, so there's no reason to re-filter it downstream.
  const kitchenOrders = orders;

  useEffect(() => {
    if (!venueId) return;
    const unsub = subscribeToVenueOrders(venueId, ({ data, error }) => {
      if (error) {
        console.error("[KitchenPage] subscribeToVenueOrders error:", error);
        setError(true);
        setOrders([]);
        return;
      }

      const pending = data.filter((o) => o.status === "pending");

      // Chime if this snapshot contains a pending order we haven't seen —
      // but never on the first snapshot after load.
      if (!isFirstSnapshotRef.current) {
        const hasNewOrder = pending.some((o) => !knownOrderIdsRef.current.has(o.id));
        if (hasNewOrder) playChime();
      }
      isFirstSnapshotRef.current = false;
      knownOrderIdsRef.current = new Set(pending.map((o) => o.id));

      setError(false);
      setOrders(pending);
    });
    return () => unsub();
  }, [venueId]);

  // Re-render every 30s so "Xm ago" / urgency / section grouping stay
  // accurate without needing a new Firestore snapshot.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Clear any pending undo timer on unmount.
  useEffect(() => {
    return () => {
      if (undo?.timeoutId) clearTimeout(undo.timeoutId);
    };
  }, [undo]);

  const orderInfo = (o) => ({ venueId, tableNumber: o.tableNumber, orderNumber: o.orderNumber });

  const handleFinish = async (order) => {
    setBusyId(order.id);
    try {
      await markOrderCompleted(order.id, orderInfo(order), actor);
    } catch (err) {
      console.error("[KitchenPage] Finish failed:", err);
      setError(true);
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDismiss = async () => {
    const order = dismissTarget;
    setDismissTarget(null);
    if (!order) return;

    setBusyId(order.id);
    try {
      await cancelOrderFromKitchen(order.id, orderInfo(order), actor);
      // Offer a brief undo. The order has already left the screen (it's no
      // longer pending), so the undo lives in a bottom bar.
      const timeoutId = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
      setUndo({ order, timeoutId });
    } catch (err) {
      console.error("[KitchenPage] Dismiss failed:", err);
      setError(true);
    } finally {
      setBusyId(null);
    }
  };

  const handleUndo = async () => {
    if (!undo) return;
    const { order, timeoutId } = undo;
    if (timeoutId) clearTimeout(timeoutId);
    setUndo(null);
    try {
      await uncancelOrder(order.id, orderInfo(order), actor);
    } catch (err) {
      console.error("[KitchenPage] Undo failed:", err);
      setError(true);
    }
  };

  const { newOrders, olderOrders } = useMemo(() => {
    const newList = [];
    const olderList = [];
    for (const order of kitchenOrders ?? []) {
      const minutesAgo = order.createdAt ? (Date.now() - order.createdAt.getTime()) / 60000 : 0;
      if (minutesAgo < NEW_TICKET_THRESHOLD_MIN) newList.push(order);
      else olderList.push(order);
    }
    // Oldest-first within each section so the kitchen works top-to-bottom.
    const byAge = (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0);
    return { newOrders: newList.sort(byAge), olderOrders: olderList.sort(byAge) };
  }, [kitchenOrders]);

  const isLoading = kitchenOrders === null;
  const activeCount = kitchenOrders?.length ?? 0;

  return (
    <div style={styles.page}>
      <StagingBanner />
      <style>{`@keyframes shimmerSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>

      <header style={styles.header}>
        <h1 style={styles.title}>🍳 Kitchen</h1>
        <div style={styles.headerRight}>
          <span style={styles.ticketCount}>{isLoading ? "" : `${activeCount} active`}</span>
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
              Something went wrong. Check the connection or ask for help.
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

        {!isLoading && !error && activeCount === 0 && (
          <div style={styles.emptyState}>
            <span style={{ fontSize: 56 }}>✅</span>
            <p style={styles.emptyTitle}>All caught up</p>
            <p style={styles.emptyBody}>New orders will appear here automatically.</p>
          </div>
        )}

        {!isLoading && !error && activeCount > 0 && (
          <>
            <TicketSection
              title="NEW"
              count={newOrders.length}
              accentColor={theme.color.accent}
              orders={newOrders}
              onFinish={handleFinish}
              onRequestDismiss={setDismissTarget}
              busyId={busyId}
            />
            <TicketSection
              title="OLDER"
              count={olderOrders.length}
              accentColor={theme.color.warning}
              orders={olderOrders}
              onFinish={handleFinish}
              onRequestDismiss={setDismissTarget}
              busyId={busyId}
            />
          </>
        )}
      </main>

      {undo && (
        <div style={styles.undoBar}>
          <span style={styles.undoText}>
            Dismissed Table {undo.order.tableNumber}&apos;s order — removed from the bill.
          </span>
          <button onClick={handleUndo} style={styles.undoBtn}>
            Undo
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!dismissTarget}
        onClose={() => setDismissTarget(null)}
        onConfirm={handleConfirmDismiss}
        title="Dismiss Order"
        confirmLabel="Dismiss & remove from bill"
        message={
          dismissTarget
            ? `Dismiss Table ${dismissTarget.tableNumber}'s order? This tells everyone the kitchen won't make it — it's removed from every kitchen screen AND taken off the customer's bill. You'll have a few seconds to undo.`
            : ""
        }
      />
    </div>
  );
}

export default function KitchenPage() {
  return (
    <AdminGuard requiredRoles={["admin", "staff", "kitchen"]}>
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
  actionRow: {
    display: "flex",
    gap: 10,
  },
  finishBtn: {
    flex: 2,
    padding: "14px",
    borderRadius: theme.radius.sm,
    border: "none",
    background: theme.color.accent,
    color: "#0a0c10",
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 16,
    letterSpacing: "0.02em",
    cursor: "pointer",
  },
  dismissBtn: {
    flex: 1,
    padding: "14px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.danger}55`,
    background: "rgba(239,68,68,0.08)",
    color: theme.color.danger,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: "0.02em",
    cursor: "pointer",
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: "default",
  },
  undoBar: {
    position: "fixed",
    left: "50%",
    bottom: 24,
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 18,
    padding: "14px 20px",
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.md,
    boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
    zIndex: 50,
    maxWidth: "90vw",
  },
  undoText: {
    fontFamily: theme.font.body,
    fontSize: 14,
    color: theme.color.textSecondary,
  },
  undoBtn: {
    padding: "8px 18px",
    borderRadius: theme.radius.sm,
    border: "none",
    background: theme.color.accent,
    color: "#0a0c10",
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    flexShrink: 0,
  },
};
