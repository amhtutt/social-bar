import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // NOTE: MenuView currently renders item photos via plain CSS
    // background-image (not next/image), so this config is not yet in use.
    // It's pre-configured here for when next/image gets adopted (better
    // perf via automatic resizing/lazy-loading) — at that point, item
    // photos pasted as external URLs will need this remotePatterns allowlist.
    // Tighten the hostname pattern once you know which image hosts staff
    // will actually use (e.g. just Imgur + your own CDN).
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

// withSentryConfig wraps the build to upload sourcemaps to Sentry, so
// stack traces in the Sentry dashboard show your actual readable source
// (component names, real line numbers) instead of minified bundle code.
//
// SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN are build-time-only env
// vars (set in Vercel project settings, NOT prefixed with NEXT_PUBLIC_ —
// they're used during the build step, never shipped to the browser).
// If they're unset, sourcemap upload is silently skipped and the app
// still builds/runs normally — error capturing itself doesn't depend on
// this, only the readability of stack traces in the Sentry dashboard.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true, // suppress Sentry's own build-time console output
  widenClientFileUpload: true,
  hideSourceMaps: true, // upload sourcemaps to Sentry but don't ship them publicly
  disableLogger: true,
});
