"use client";

// ─────────────────────────────────────────────────────────────────────────────
// app/page.js  —  Entry point
//
// CHANGED for multi-tenant: captures venueId from the URL (?venue=xxx) the
// FIRST time a tablet is set up, then stores it in localStorage alongside
// table/slot. Staff visit this URL once per tablet during physical setup;
// after that, the tablet remembers its venue forever (until reset).
//
// If no ?venue= param is present AND no saved identity exists, shows a
// clear "missing venue" message instead of silently failing.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadIdentity, saveIdentity, getVenueIdFromUrl } from "@/lib/tabletIdentity";
import { theme } from "@/lib/theme";
import SetupScreen from "@/components/SetupScreen";

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [venueId, setVenueId] = useState(null);
  const [missingVenue, setMissingVenue] = useState(false);

  useEffect(() => {
    const identity = loadIdentity();
    if (identity) {
      router.replace("/table");
      return;
    }

    const urlVenueId = getVenueIdFromUrl();
    if (urlVenueId) {
      setVenueId(urlVenueId);
      setChecking(false);
    } else {
      setMissingVenue(true);
      setChecking(false);
    }
  }, [router]);

  const handleConfirm = ({ table, slot }) => {
    saveIdentity({ table, slot, venueId });
    router.replace("/table");
  };

  if (checking) return null;

  if (missingVenue) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <span style={{ fontSize: 36, display: "block", marginBottom: 14 }}>⚠️</span>
          <h1 style={styles.title}>Venue Not Specified</h1>
          <p style={styles.body}>
            This tablet doesn&apos;t know which venue it belongs to yet. Open this page using the link your venue
            admin provided — it should look like{" "}
            <code style={styles.code}>yourapp.com/?venue=your-venue-id</code>.
          </p>
        </div>
      </div>
    );
  }

  return <SetupScreen onConfirm={handleConfirm} />;
}

const styles = {
  page: {
    minHeight: "100vh",
    background: theme.color.bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    maxWidth: 440,
    textAlign: "center",
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.xl,
    padding: "36px 32px",
  },
  title: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 20,
    color: theme.color.textPrimary,
    margin: "0 0 10px",
  },
  body: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
    lineHeight: 1.7,
    margin: 0,
  },
  code: {
    background: "rgba(255,255,255,0.06)",
    padding: "2px 6px",
    borderRadius: 4,
    fontSize: 12,
  },
};
