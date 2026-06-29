"use client";

// ─────────────────────────────────────────────────────────────────────────────
// app/staff/page.js  —  Server/Manager dashboard
//
// Two tabs: "Floor View" (tables grouped with their orders, edit/void/add
// actions) and "Activity Log" (audit trail of every staff action, global
// feed + per-table filter). Accessible to admin, manager, AND server
// roles (unlike /admin, which is admin-only).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { signOut } from "@/lib/userService";
import { subscribeToVenueOrders, subscribeToVenueBillRequests } from "@/lib/orderService";
import { subscribeToVenueServerCalls } from "@/lib/callServerService";
import { subscribeToVenueTablets, subscribeToVenueFlaggedTables, flagTable, unflagTable } from "@/lib/tabletService";
import { theme } from "@/lib/theme";
import AdminGuard from "@/components/admin/AdminGuard";
import TableOrdersCard from "@/components/staff/TableOrdersCard";
import ActivityLogPanel from "@/components/staff/ActivityLogPanel";
import StagingBanner from "@/components/StagingBanner";

const TABS = [
  { id: "floor", label: "Floor View" },
  { id: "log", label: "Activity Log" },
];

export default function StaffPage() {
  return (
    <AdminGuard requiredRoles={["admin", "manager", "server"]}>
      <StaffPageContent />
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

function StaffPageContent() {
  const { profile, venueId } = useAuth();
  const [activeTab, setActiveTab] = useState("floor");
  const [orders, setOrders] = useState(null);
  const [billRequests, setBillRequests] = useState([]);
  const [serverCalls, setServerCalls] = useState([]);
  const [tablets, setTablets] = useState([]);
  const [flaggedTables, setFlaggedTables] = useState([]);
  const [error, setError] = useState(false);

  const actor = { email: profile?.email, role: profile?.role };

  useEffect(() => {
    if (!venueId) return;

    const unsubOrders = subscribeToVenueOrders(venueId, ({ data, error }) => {
      if (error) console.error("[StaffPage] subscribeToVenueOrders error:", error);
      setError(!!error);
      setOrders(error ? [] : data);
    });

    const unsubBillRequests = subscribeToVenueBillRequests(venueId, ({ data, error }) => {
      if (error) console.error("[StaffPage] subscribeToVenueBillRequests error:", error);
      setBillRequests(error ? [] : data);
    });

    const unsubServerCalls = subscribeToVenueServerCalls(venueId, ({ data, error }) => {
      if (error) console.error("[StaffPage] subscribeToVenueServerCalls error:", error);
      setServerCalls(error ? [] : data);
    });

    const unsubTablets = subscribeToVenueTablets(venueId, ({ data, error }) => {
      if (error) console.error("[StaffPage] subscribeToVenueTablets error:", error);
      setTablets(error ? [] : data);
    });

    const unsubFlagged = subscribeToVenueFlaggedTables(venueId, ({ data, error }) => {
      if (error) console.error("[StaffPage] subscribeToVenueFlaggedTables error:", error);
      setFlaggedTables(error ? [] : data);
    });

    return () => {
      unsubOrders();
      unsubBillRequests();
      unsubServerCalls();
      unsubTablets();
      unsubFlagged();
    };
  }, [venueId]);

  // Build table groups from orders, then ALSO include:
  //   - any table with a pending server call but no orders yet
  //   - any table with an ONLINE tablet but no orders/calls yet (a table
  //     that just sat down — "occupied but quiet" — previously invisible
  //     on Floor View entirely, which made it look like nobody was there)
  //   - any FLAGGED table, even if otherwise quiet, so a manually-flagged
  //     table never silently disappears from view
  const tableGroups = useMemo(() => {
    if (!orders) return [];

    const grouped = {};
    for (const order of orders) {
      if (!grouped[order.tableNumber]) grouped[order.tableNumber] = [];
      grouped[order.tableNumber].push(order);
    }

    const pendingCallTables = serverCalls.filter((c) => c.status === "pending").map((c) => c.tableNumber);
    const onlineTabletTables = tablets.filter((t) => t.status === "online").map((t) => t.tableNumber);
    const flaggedTableNumbers = flaggedTables.map((f) => f.tableNumber);

    for (const t of [...pendingCallTables, ...onlineTabletTables, ...flaggedTableNumbers]) {
      if (!grouped[t]) grouped[t] = [];
    }

    return Object.entries(grouped)
      .map(([tableNumber, tableOrders]) => {
        const sorted = [...tableOrders].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
        const billRequest = billRequests.find(
          (br) => br.tableNumber === Number(tableNumber) && br.status === "pending"
        );
        const serverCall = serverCalls.find((c) => c.tableNumber === Number(tableNumber) && c.status === "pending");
        const isOccupied = onlineTabletTables.includes(Number(tableNumber));
        const flag = flaggedTables.find((f) => f.tableNumber === Number(tableNumber)) ?? null;
        return { tableNumber: Number(tableNumber), orders: sorted, billRequest, serverCall, isOccupied, flag };
      })
      .sort((a, b) => a.tableNumber - b.tableNumber);
  }, [orders, billRequests, serverCalls, tablets, flaggedTables]);

  const isLoading = orders === null;
  const pendingBillCount = billRequests.filter((br) => br.status === "pending").length;
  const pendingCallCount = serverCalls.filter((c) => c.status === "pending").length;
  const availableTables = tableGroups.map((g) => g.tableNumber);

  const handleToggleFlag = async (tableNumber, currentFlag) => {
    try {
      if (currentFlag) {
        await unflagTable(venueId, tableNumber);
      } else {
        const note = window.prompt("Flag note (optional) — e.g. VIP, celebrating a birthday, needs a check-in:") ?? "";
        await flagTable(venueId, tableNumber, note, actor);
      }
    } catch (err) {
      console.error("[StaffPage] Failed to toggle table flag:", err);
    }
  };

  return (
    <div style={styles.page}>
      <StagingBanner />
      <style>{`@keyframes shimmerSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>

      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Floor View</h1>
          <p style={styles.subtitle}>
            {isLoading ? "Loading…" : `${tableGroups.length} active tables`}
            {pendingBillCount > 0 && <span style={styles.pendingBillTag}> · {pendingBillCount} requesting bill</span>}
            {pendingCallCount > 0 && (
              <span style={styles.pendingCallTag}>
                {" "}
                · {pendingCallCount} table{pendingCallCount === 1 ? "" : "s"} need help
              </span>
            )}
          </p>
        </div>
        <div style={styles.userArea}>
          {profile?.role === "admin" && (
            <Link href="/admin" style={styles.menuEditorLink}>
              📋 Menu Editor
            </Link>
          )}
          <Link href="/kitchen" style={styles.kitchenLink}>
            🍳 Kitchen
          </Link>
          <span style={styles.userEmail}>
            {profile?.email} <span style={styles.roleTag}>{profile?.role}</span>
          </span>
          <button onClick={() => signOut()} style={styles.signOutBtn}>
            Sign Out
          </button>
        </div>
      </header>

      <div style={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tabBtn,
              ...(activeTab === tab.id ? styles.tabBtnActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main style={styles.content}>
        {activeTab === "floor" && (
          <>
            {error && (
              <div style={styles.errorBox}>
                <p style={{ fontFamily: theme.font.body, fontSize: 14, color: theme.color.danger, margin: 0 }}>
                  Could not load orders. Check the browser console for details.
                </p>
              </div>
            )}

            {isLoading && !error && (
              <div style={styles.grid}>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 160,
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

            {!isLoading && !error && tableGroups.length === 0 && (
              <div style={styles.emptyState}>
                <span style={{ fontSize: 40, display: "block", marginBottom: 12 }}>🪑</span>
                <p style={{ fontFamily: theme.font.body, fontSize: 14, color: theme.color.textMuted }}>
                  No active orders right now. New orders from any table will appear here automatically.
                </p>
              </div>
            )}

            {!isLoading && !error && tableGroups.length > 0 && (
              <div style={styles.grid}>
                {tableGroups.map((group) => (
                  <TableOrdersCard
                    key={group.tableNumber}
                    tableNumber={group.tableNumber}
                    orders={group.orders}
                    billRequest={group.billRequest}
                    serverCall={group.serverCall}
                    isOccupied={group.isOccupied}
                    flag={group.flag}
                    onToggleFlag={() => handleToggleFlag(group.tableNumber, group.flag)}
                    venueId={venueId}
                    actor={actor}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "log" && <ActivityLogPanel venueId={venueId} availableTables={availableTables} />}
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: theme.color.bg,
    padding: "28px 24px 60px",
  },
  header: {
    maxWidth: 1200,
    margin: "0 auto 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  title: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 26,
    color: theme.color.textPrimary,
    margin: "0 0 6px",
  },
  subtitle: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
    margin: 0,
  },
  pendingBillTag: {
    color: theme.color.warning,
    fontWeight: 700,
  },
  pendingCallTag: {
    color: theme.color.danger,
    fontWeight: 700,
  },
  userArea: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  kitchenLink: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    color: theme.color.accent,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  menuEditorLink: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    color: theme.color.textSecondary,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  userEmail: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
  },
  roleTag: {
    fontFamily: theme.font.display,
    fontSize: 10,
    fontWeight: 700,
    color: theme.color.accent,
    background: theme.color.accentBg,
    border: `1px solid ${theme.color.accentBorder}`,
    borderRadius: 5,
    padding: "2px 7px",
    marginLeft: 6,
    letterSpacing: "0.04em",
  },
  signOutBtn: {
    padding: "8px 16px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textSecondary,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  tabBar: {
    maxWidth: 1200,
    margin: "0 auto 20px",
    display: "flex",
    gap: 8,
    borderBottom: `1px solid ${theme.color.border}`,
  },
  tabBtn: {
    padding: "10px 18px",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: theme.color.textMuted,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  tabBtnActive: {
    color: theme.color.accent,
    borderBottom: `2px solid ${theme.color.accent}`,
  },
  content: {
    maxWidth: 1200,
    margin: "0 auto",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 16,
  },
  errorBox: {
    padding: 20,
    background: theme.color.dangerBg,
    border: `1px solid ${theme.color.danger}30`,
    borderRadius: theme.radius.md,
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
  },
};
