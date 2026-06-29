// ─────────────────────────────────────────────────────────────────────────────
// sentry.client.config.js  —  Error monitoring, browser/client side
//
// Catches unhandled errors and promise rejections in every customer-facing
// and staff-facing screen (/, /table, /admin, /staff). Without this, a
// production bug at 11pm on a Friday is only visible if someone happens
// to have DevTools open — with it, you get a notification the moment it
// happens.
//
// NEXT_PUBLIC_SENTRY_DSN comes from environment variables, NOT hardcoded
// — see .env.local.example. If it's missing, Sentry simply does nothing
// (no crash, no errors) rather than failing the build, so this is safe to
// commit even before you've set up a Sentry account.
// ─────────────────────────────────────────────────────────────────────────────

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 10% trace sampling — this app's traffic volume is low enough that a
  // higher rate isn't needed yet; revisit if/when this scales to many
  // venues with heavy simultaneous traffic.
  tracesSampleRate: 0.1,

  // Session replay helps reproduce "what did the customer actually do
  // right before this broke" — invaluable for a tablet UI you can't watch
  // over someone's shoulder. Sampled low since replays cost more quota
  // than plain error events.
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: false, // menu prices/names aren't sensitive; no need to mask UI text
      blockAllMedia: false,
    }),
  ],

  // Don't spam Sentry with noise from browser extensions, ad blockers,
  // etc. injecting errors that have nothing to do with this app.
  ignoreErrors: [
    "top.GLOBALS",
    "ResizeObserver loop limit exceeded",
    /extension\//i,
    /^chrome-extension:\/\//i,
  ],

  environment: process.env.NODE_ENV,
});
