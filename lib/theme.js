// ─────────────────────────────────────────────────────────────────────────────
// lib/theme.js  —  Centralized design tokens
//
// Every color and font in the app should reference this file rather than
// hardcoding hex values inline. This was a pain point in the previous
// build — colors were scattered across every component, making the planned
// palette change (neon mint -> a more premium, bar-appropriate palette)
// a tedious find-and-replace across many files.
//
// Currently using the placeholder neon palette per "worry about colors
// later" — when the final palette is chosen, this is the ONLY file that
// needs to change.
// ─────────────────────────────────────────────────────────────────────────────

export const theme = {
  font: {
    display: "'Syne', sans-serif",
    body: "'Syne', sans-serif",
  },

  color: {
    bg: "#0a0c10",
    surface: "rgba(255,255,255,0.03)",
    surfaceHover: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.15)",

    textPrimary: "#ffffff",
    textSecondary: "rgba(255,255,255,0.6)",
    textMuted: "rgba(255,255,255,0.35)",
    textFaint: "rgba(255,255,255,0.2)",

    accent: "#00ffaa",
    accentGlow: "rgba(0,255,170,0.4)",
    accentBg: "rgba(0,255,170,0.1)",
    accentBorder: "rgba(0,255,170,0.4)",

    warning: "#fbbf24",
    warningBg: "rgba(251,191,36,0.1)",

    danger: "#ef4444",
    dangerBg: "rgba(239,68,68,0.1)",

    info: "#f97316",
    infoBg: "rgba(249,115,22,0.1)",
  },

  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 100,
  },
};

export default theme;
