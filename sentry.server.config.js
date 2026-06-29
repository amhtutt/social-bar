// ─────────────────────────────────────────────────────────────────────────────
// sentry.server.config.js  —  Error monitoring, Next.js server side
//
// Catches errors in any server-side code (API routes, server components,
// middleware). This app is mostly client components talking directly to
// Firestore, so this matters less today than sentry.client.config.js —
// but becomes essential once any Cloud Functions / API routes are added
// (e.g. the server-side order validation function planned next).
// ─────────────────────────────────────────────────────────────────────────────

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
