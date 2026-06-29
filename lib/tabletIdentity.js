// ─────────────────────────────────────────────────────────────────────────────
// lib/tabletIdentity.js  —  Tablet identity persistence (localStorage)
//
// CHANGED for multi-tenant: identity now includes venueId alongside table
// + slot. A tablet has no login of its own, so it learns its venueId from
// a URL query param the FIRST time it's opened (e.g.
// yourapp.com/?venue=abc123), then remembers it in localStorage forever
// after — same pattern as table/slot. Staff bookmark/pin that URL once per
// tablet during physical setup at the venue.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "bar_tablet_identity";

/**
 * saveIdentity({ table, slot, venueId })
 */
export function saveIdentity(identity) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // localStorage may be unavailable (private browsing, quota) — fail
    // silently, the tablet will just re-prompt setup on next load
  }
}

/**
 * loadIdentity()
 * Returns { table, slot, venueId } or null. Validates shape before
 * trusting it — a corrupt/partial value (including a missing venueId from
 * before multi-tenant existed) is treated the same as no identity at all,
 * so the tablet re-runs setup and picks up a venueId cleanly.
 */
export function loadIdentity() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.table && parsed.slot && parsed.venueId) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * clearIdentity()
 */
export function clearIdentity() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * getVenueIdFromUrl()
 * Reads ?venue=xxx from the current URL's query string, if present.
 * Used during Setup to capture which venue this tablet belongs to.
 */
export function getVenueIdFromUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("venue");
}
