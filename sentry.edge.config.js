// ─────────────────────────────────────────────────────────────────────────────
// sentry.edge.config.js  —  Error monitoring, Next.js Edge runtime
//
// Covers Edge middleware/routes if any get added later. This app doesn't
// use Edge runtime today, but Next.js's Sentry integration expects this
// file to exist regardless — an empty/minimal config here costs nothing
// and avoids a build warning.
// ─────────────────────────────────────────────────────────────────────────────

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
