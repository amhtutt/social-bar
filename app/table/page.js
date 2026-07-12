"use client";

// ─────────────────────────────────────────────────────────────────────────────
// app/table/page.js  —  Main tablet dashboard
//
// Feature flags AND pricing (tax/service charge config) both come from a
// live Firestore subscription (subscribeToVenueConfig) keyed on
// identity.venueId. pricing is threaded down to MenuView's modal,
// CartDrawer, and is used at order-submit time so every order snapshots
// the correct rate.
//
// New in this pass:
//   - OrderConfirmation full-screen overlay after a successful order
//   - OrderStatusBadge persistent indicator on the Menu tab
//   - "+ Add More Items" on the Bill tab jumps back to the Menu tab
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadIdentity, clearIdentity } from "@/lib/tabletIdentity";
import { markTabletOffline } from "@/lib/tabletService";
import { useTabletConnection } from "@/lib/useTabletConnection";
import { subscribeToVenueConfig } from "@/lib/venueConfig";
import { CartProvider } from "@/lib/CartContext";
import { theme } from "@/lib/theme";
import MenuView from "@/components/MenuView";
import BillTab from "@/components/BillTab";
import CartButton from "@/components/CartButton";
import CartDrawer from "@/components/CartDrawer";
import CallServerButton from "@/components/CallServerButton";
import RequestBillButton from "@/components/RequestBillButton";
import OrderConfirmation from "@/components/OrderConfirmation";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import StaffPinModal from "@/components/StaffPinModal";

const ALL_TABS = [
  { id: "menu", icon: "🍽️", label: "Menu", feature: "menu" },
  { id: "bill", icon: "🧾", label: "Bill", feature: "bill" },
];

export default function TablePage() {
  const router = useRouter();
  const [identity, setIdentity] = useState(undefined);
  const [activeTab, setActiveTab] = useState("menu");
  const [resetting, setResetting] = useState(false);
  const [venueName, setVenueName] = useState(null);
  const [features, setFeatures] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [staffPin, setStaffPin] = useState("0000");
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  useEffect(() => {
    const saved = loadIdentity();
    if (!saved) {
      router.replace("/");
    } else {
      setIdentity(saved);
    }
  }, [router]);

  useEffect(() => {
    if (!identity) return;
    const unsub = subscribeToVenueConfig(identity.venueId, ({ name, features, pricing, staffPin }) => {
      setVenueName(name);
      setFeatures(features);
      setPricing(pricing);
      setStaffPin(staffPin);
    });
    return () => unsub();
  }, [identity]);

  const { connStatus, lastSynced } = useTabletConnection(
    identity?.venueId ?? null,
    identity?.table ?? null,
    identity?.slot ?? null
  );

  const isFeatureEnabled = (key) => Boolean(features?.[key]);

  const visibleTabs = ALL_TABS.filter((tab) => !tab.feature || isFeatureEnabled(tab.feature));

  const handleReset = async () => {
    if (!identity) return;
    setResetting(true);
    await markTabletOffline(identity.venueId, identity.table, identity.slot);
    clearIdentity();
    router.replace("/");
  };

  if (identity === undefined || identity === null || features === null) return null;

  const cartPersistKey = `cart_${identity.venueId}_${identity.table}_${identity.slot}`.replace(/\s+/g, "_");

  return (
    <CartProvider persistKey={cartPersistKey}>
      <div style={styles.shell}>
        <div style={styles.blob1} />
        <div style={styles.blob2} />

        <header style={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={styles.logoMark}>⬡</span>
            <span style={styles.brandText}>{venueName || process.env.NEXT_PUBLIC_VENUE_NAME || "Bar System"}</span>
          </div>

          <div style={styles.identityPill}>
            <span style={styles.identityText}>Table {identity.table}</span>
            <span style={{ color: theme.color.accentGlow, fontSize: 16 }}>·</span>
            <span style={styles.identityText}>{identity.slot}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ConnectionIndicator connStatus={connStatus} />
            <StaffPinModal
              identity={identity}
              connStatus={connStatus}
              lastSynced={lastSynced}
              onReset={handleReset}
              resetting={resetting}
              staffPin={staffPin}
            />
          </div>
        </header>

        <main style={styles.content}>
          {activeTab === "menu" && isFeatureEnabled("menu") && (
            <div style={styles.tabPane}>
              {isFeatureEnabled("ordering") && (
                <OrderStatusBadge identity={identity} onViewBill={() => setActiveTab("bill")} />
              )}
              <MenuView venueId={identity.venueId} />
            </div>
          )}

          {activeTab === "bill" && isFeatureEnabled("bill") && (
            <BillTab
              identity={identity}
              onAddMoreItems={isFeatureEnabled("menu") ? () => setActiveTab("menu") : undefined}
            />
          )}
        </main>

        <CartButton />

        {isFeatureEnabled("ordering") && (
          <CartDrawer identity={identity} pricing={pricing} onOrderPlaced={setConfirmedOrder} />
        )}

        {isFeatureEnabled("callServer") && <CallServerButton identity={identity} />}

        {isFeatureEnabled("bill") && (
          <RequestBillButton
            identity={identity}
            stacked={isFeatureEnabled("callServer")}
            hidden={activeTab === "bill"}
          />
        )}

        {confirmedOrder && (
          <OrderConfirmation
            orderNumber={confirmedOrder.orderNumber}
            totals={confirmedOrder.totals}
            onDismiss={() => setConfirmedOrder(null)}
          />
        )}

        <nav style={styles.bottomNav}>
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  ...styles.navButton,
                  borderTop: `2px solid ${active ? theme.color.accent : "transparent"}`,
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{tab.icon}</span>
                <span style={{ ...styles.navLabel, color: active ? theme.color.accent : theme.color.textMuted }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </CartProvider>
  );
}

function ConnectionIndicator({ connStatus }) {
  const cfg =
    {
      connecting: { color: theme.color.warning, label: "Connecting…" },
      online: { color: theme.color.accent, label: "Online" },
      reconnecting: { color: theme.color.info, label: "Reconnecting" },
      offline: { color: theme.color.danger, label: "Offline" },
    }[connStatus] ?? { color: theme.color.warning, label: "Connecting…" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ position: "relative", display: "inline-flex" }}>
        <span
          style={{
            position: "absolute",
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: `${cfg.color}30`,
            animation: "ping 1.6s ease-out infinite",
          }}
        />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
      </span>
      <span style={{ fontFamily: theme.font.display, fontSize: 12, fontWeight: 700, color: cfg.color }}>
        {cfg.label.toUpperCase()}
      </span>
    </div>
  );
}

const styles = {
  shell: {
    position: "fixed",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    background: theme.color.bg,
    overflow: "hidden",
  },
  blob1: {
    position: "fixed",
    width: "clamp(200px,60vw,500px)",
    height: "clamp(200px,60vw,500px)",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(0,255,170,0.06) 0%, transparent 70%)",
    top: "-15%",
    right: "-10%",
    pointerEvents: "none",
  },
  blob2: {
    position: "fixed",
    width: "clamp(160px,50vw,400px)",
    height: "clamp(160px,50vw,400px)",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(80,80,255,0.05) 0%, transparent 70%)",
    bottom: "-10%",
    left: "-8%",
    pointerEvents: "none",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 20px",
    height: 60,
    flexShrink: 0,
    background: "rgba(10,12,16,0.95)",
    backdropFilter: "blur(16px)",
    borderBottom: `1px solid ${theme.color.border}`,
    zIndex: 10,
    gap: 12,
  },
  logoMark: {
    fontSize: 22,
    color: theme.color.accent,
    filter: "drop-shadow(0 0 10px rgba(0,255,170,0.5))",
  },
  brandText: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 14,
    color: theme.color.textPrimary,
    letterSpacing: "-0.01em",
  },
  identityPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: theme.color.accentBg,
    border: `1px solid ${theme.color.accentBorder}`,
    borderRadius: theme.radius.pill,
    padding: "6px 16px",
  },
  identityText: {
    fontFamily: theme.font.display,
    fontSize: 13,
    fontWeight: 700,
    color: theme.color.accent,
  },
  content: {
    flex: 1,
    overflowY: "auto",
    padding: "24px 20px 8px",
    position: "relative",
  },
  tabPane: {
    maxWidth: 1100,
    margin: "0 auto",
    paddingBottom: 16,
    animation: "fadeUp 0.3s ease both",
  },
  bottomNav: {
    display: "flex",
    flexShrink: 0,
    height: 64,
    background: "rgba(10,12,16,0.97)",
    backdropFilter: "blur(16px)",
    borderTop: `1px solid ${theme.color.border}`,
    zIndex: 10,
  },
  navButton: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "10px 8px",
    transition: "all 0.2s ease",
  },
  navLabel: {
    fontFamily: theme.font.display,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    transition: "color 0.2s ease",
  },
};
