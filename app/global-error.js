"use client";

// ─────────────────────────────────────────────────────────────────────────────
// app/global-error.js  —  Top-level error boundary
//
// Next.js App Router convention: this catches any error that escapes
// every other error boundary, anywhere in the app. Reports to Sentry
// before showing a minimal fallback — without this file, an uncaught
// render error just shows Next.js's default white-screen error page with
// no monitoring at all.
//
// Deliberately plain/inline styles (no theme import) since this needs to
// render even if something in the normal app shell is what's broken.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0a0c10", color: "#fff", fontFamily: "sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 40, marginBottom: 12 }}>⚠️</p>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 24, maxWidth: 360 }}>
            This has been reported automatically. Ask staff for help, or try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "12px 24px",
              borderRadius: 10,
              border: "1px solid rgba(0,255,170,0.4)",
              background: "rgba(0,255,170,0.1)",
              color: "#00ffaa",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
