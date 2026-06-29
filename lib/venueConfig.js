// ─────────────────────────────────────────────────────────────────────────────
// lib/venueConfig.js  —  Feature flags + pricing config (multi-tenant)
//
// Reads live from venues/{venueId} in Firestore, since each restaurant has
// its own feature flags AND its own tax/service charge setup. No tipping
// fields exist anywhere in this system — tips are cash, between the
// customer and server directly, and never touch the app per product
// decision (common practice in Yangon, where most payment is cash).
//
// Pricing shape on a venue document:
//   config.pricing = {
//     taxRatePercent: 5,            // e.g. 5 means 5%
//     serviceChargeRatePercent: 10, // e.g. 10 means 10%
//     taxInclusive: false,          // if true, `price` on items already
//                                   // includes tax — display only, no
//                                   // separate tax line added on top
//   }
//
// Both rates default to 0 (no tax, no service charge) so a venue that
// hasn't configured pricing yet doesn't silently start charging extra.
// ─────────────────────────────────────────────────────────────────────────────

import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_PRICING, calculateOrderTotals } from "./pricingMath";

// Re-exported so every existing `import { calculateOrderTotals } from
// "@/lib/venueConfig"` elsewhere in the app keeps working unchanged —
// the actual implementation now lives in lib/pricingMath.js, which has
// zero Firebase dependency (see that file's header comment for why).
export { calculateOrderTotals };

const DEFAULT_FEATURES = {
  games: false,
  menu: true,
  ordering: false,
  chat: false,
  callServer: false,
  bill: false,
};

const DEFAULT_STAFF_PIN = "0000";

/**
 * subscribeToVenueConfig(venueId, callback)
 * Real-time listener for a venue's feature flags + pricing config + name
 * + staffPin. callback receives { name, features, pricing, staffPin, error }.
 */
export function subscribeToVenueConfig(venueId, callback) {
  if (!venueId) {
    callback({ name: null, features: DEFAULT_FEATURES, pricing: DEFAULT_PRICING, staffPin: DEFAULT_STAFF_PIN, error: null });
    return () => {};
  }

  return onSnapshot(
    doc(db, "venues", venueId),
    (snap) => {
      if (!snap.exists()) {
        callback({ name: null, features: DEFAULT_FEATURES, pricing: DEFAULT_PRICING, staffPin: DEFAULT_STAFF_PIN, error: null });
        return;
      }
      const d = snap.data();
      callback({
        name: d.name ?? null,
        features: { ...DEFAULT_FEATURES, ...(d.config ?? {}) },
        pricing: { ...DEFAULT_PRICING, ...(d.config?.pricing ?? {}) },
        staffPin: d.config?.staffPin ?? DEFAULT_STAFF_PIN,
        error: null,
      });
    },
    (err) =>
      callback({ name: null, features: DEFAULT_FEATURES, pricing: DEFAULT_PRICING, staffPin: DEFAULT_STAFF_PIN, error: err })
  );
}
