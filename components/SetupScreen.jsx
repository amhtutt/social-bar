"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/SetupScreen.jsx  —  Step 1: Tablet identity setup
//
// Staff selects table number + tablet slot (A/B) when a tablet first opens
// or after a reset. Identity persistence (localStorage) is handled by the
// caller via the onConfirm callback — this component is purely
// presentational + selection state.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { theme } from "@/lib/theme";

const TABLE_COUNT = 10;
const TABLET_SLOTS = ["Tablet A", "Tablet B"];

function getBreakpoint() {
  if (typeof window === "undefined") return "lg";
  const w = window.innerWidth;
  if (w < 480) return "xs";
  if (w < 768) return "sm";
  if (w < 1024) return "md";
  return "lg";
}

function useBreakpoint() {
  const [bp, setBp] = useState(getBreakpoint);
  useEffect(() => {
    const handler = () => setBp(getBreakpoint());
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return bp;
}

function SelectCard({ label, selected, onClick, compact }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: selected
          ? "linear-gradient(135deg, rgba(0,255,170,0.18) 0%, rgba(0,180,120,0.12) 100%)"
          : theme.color.surface,
        border: `1.5px solid ${selected ? theme.color.accentBorder : theme.color.border}`,
        borderRadius: compact ? 10 : 14,
        padding: compact ? "12px 6px" : "16px 10px",
        color: selected ? theme.color.accent : theme.color.textSecondary,
        fontSize: compact ? 12 : 15,
        fontFamily: theme.font.display,
        fontWeight: selected ? 700 : 400,
        cursor: "pointer",
        transition: "all 0.2s ease",
        textAlign: "center",
        boxShadow: selected ? "0 0 18px rgba(0,255,170,0.15)" : "none",
        transform: selected ? "scale(1.03)" : "scale(1)",
        minHeight: compact ? 46 : 54,
        width: "100%",
      }}
    >
      {label}
    </button>
  );
}

export default function SetupScreen({ onConfirm }) {
  const bp = useBreakpoint();
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const canConfirm = selectedTable !== null && selectedSlot !== null;
  const compact = bp === "xs";
  const tableGridCols = compact ? "repeat(2, 1fr)" : "repeat(5, 1fr)";

  const handleConfirm = () => {
    if (!canConfirm) return;
    setConfirming(true);
    setTimeout(() => onConfirm({ table: selectedTable, slot: selectedSlot }), 350);
  };

  return (
    <div style={styles.page}>
      <div style={styles.blob1} />
      <div style={styles.blob2} />

      <div style={{ ...styles.card, maxWidth: compact ? "100%" : 700 }}>
        <div style={{ textAlign: "center", marginBottom: compact ? 22 : 34 }}>
          <span style={{ ...styles.logoMark, fontSize: compact ? 22 : 28 }}>⬡</span>
          <h1 style={{ ...styles.heading, fontSize: compact ? 22 : 34 }}>Tablet Setup</h1>
          <p style={styles.subheading}>Assign this tablet to a table before service begins</p>
        </div>

        <section style={{ marginBottom: compact ? 18 : 28 }}>
          <label style={styles.sectionLabel}>Select Table</label>
          <div style={{ display: "grid", gridTemplateColumns: tableGridCols, gap: compact ? 7 : 10 }}>
            {Array.from({ length: TABLE_COUNT }, (_, i) => i + 1).map((n) => (
              <SelectCard
                key={n}
                label={`Table ${n}`}
                selected={selectedTable === n}
                onClick={() => setSelectedTable(n)}
                compact={compact}
              />
            ))}
          </div>
        </section>

        <section style={{ marginBottom: compact ? 22 : 34 }}>
          <label style={styles.sectionLabel}>Select Tablet Slot</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: compact ? 8 : 12 }}>
            {TABLET_SLOTS.map((slot) => (
              <SelectCard
                key={slot}
                label={slot}
                selected={selectedSlot === slot}
                onClick={() => setSelectedSlot(slot)}
                compact={compact}
              />
            ))}
          </div>
        </section>

        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          style={{
            ...styles.confirmBtn,
            padding: compact ? "15px" : "20px",
            fontSize: compact ? 14 : 17,
            opacity: canConfirm ? 1 : 0.35,
            cursor: canConfirm ? "pointer" : "not-allowed",
            transform: confirming ? "scale(0.97)" : "scale(1)",
          }}
        >
          {confirming ? "Saving…" : "Confirm Setup"}
        </button>

        {canConfirm && (
          <p style={styles.previewLabel}>
            Table {selectedTable} — {selectedSlot}
          </p>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: theme.color.bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px 16px",
    position: "relative",
    overflow: "hidden",
    animation: "fadeUp 0.45s ease both",
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
  card: {
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.xl,
    width: "100%",
    backdropFilter: "blur(20px)",
    boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
    position: "relative",
    zIndex: 1,
    padding: "40px 44px",
  },
  logoMark: {
    color: theme.color.accent,
    filter: "drop-shadow(0 0 10px rgba(0,255,170,0.5))",
    display: "block",
    lineHeight: 1,
  },
  heading: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    color: theme.color.textPrimary,
    letterSpacing: "-0.02em",
    marginTop: 10,
    marginBottom: 6,
  },
  subheading: {
    fontFamily: theme.font.body,
    color: theme.color.textMuted,
    fontWeight: 400,
    fontSize: 14,
  },
  sectionLabel: {
    display: "block",
    fontFamily: theme.font.display,
    fontSize: 10,
    fontWeight: 700,
    color: theme.color.textMuted,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  confirmBtn: {
    width: "100%",
    borderRadius: theme.radius.md,
    border: "none",
    background: `linear-gradient(135deg, ${theme.color.accent} 0%, #00c87a 100%)`,
    color: theme.color.bg,
    fontFamily: theme.font.display,
    fontWeight: 800,
    letterSpacing: "0.02em",
    transition: "all 0.2s ease",
    boxShadow: "0 8px 30px rgba(0,255,170,0.25)",
  },
  previewLabel: {
    textAlign: "center",
    marginTop: 12,
    color: theme.color.textMuted,
    fontSize: 14,
    fontFamily: theme.font.display,
  },
};
