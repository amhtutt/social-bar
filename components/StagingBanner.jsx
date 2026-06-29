"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/StagingBanner.jsx  —  Visible "this is staging, not real" indicator
//
// Renders a persistent banner strip ONLY when NEXT_PUBLIC_APP_ENV is set
// to "staging" — i.e. only on the staging Vercel deployment, never on
// production. The whole point of a staging environment is testing
// without fear of touching real customer data; this banner exists so
// it's never ambiguous which one you're looking at, especially important
// since staging and production will look visually IDENTICAL otherwise
// (same code, same theme, same everything except the data behind it).
//
// Mount this once near the root of every page shell (app/table/page.js,
// app/admin/page.js, app/staff/page.js) — cheap enough to just always
// render and let the env check decide whether anything actually shows.
// ─────────────────────────────────────────────────────────────────────────────

export default function StagingBanner() {
  const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";

  if (!isStaging) return null;

  return (
    <div style={styles.banner}>
      <span style={styles.dot} />
      STAGING ENVIRONMENT — test data only, not your real venue
    </div>
  );
}

const styles = {
  banner: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    background: "repeating-linear-gradient(45deg, #b45309, #b45309 10px, #92400e 10px, #92400e 20px)",
    color: "#fff",
    fontFamily: "monospace",
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: "0.05em",
    textAlign: "center",
    padding: "4px 8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#fff",
    flexShrink: 0,
  },
};
