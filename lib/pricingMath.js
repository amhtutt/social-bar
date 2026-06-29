// ─────────────────────────────────────────────────────────────────────────────
// lib/pricingMath.js  —  Pure tax/service charge calculation, zero Firebase
//
// This was split out of lib/venueConfig.js specifically so it has NO
// import chain back to lib/firebase.js. Before this split, importing
// calculateOrderTotals (even just for a unit test) transitively
// initialized Firebase Auth at module-load time, which crashes in any
// environment without real Firebase env vars configured (like a test
// runner with no .env.local). Pure money math should never have that
// dependency.
//
// lib/venueConfig.js re-exports calculateOrderTotals from here, so every
// existing `import { calculateOrderTotals } from "@/lib/venueConfig"`
// elsewhere in the app keeps working unchanged — this split is invisible
// to every other file except this comment.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PRICING = {
  taxRatePercent: 0,
  serviceChargeRatePercent: 0,
  taxInclusive: false,
};

/**
 * calculateOrderTotals(subtotal, pricing)
 * Single source of truth for the subtotal -> tax -> service charge ->
 * grand total math, used by the cart, the order write, every staff edit,
 * and the bill so all of them always agree.
 *
 * If pricing.taxInclusive is true, item prices already include tax —
 * taxAmount is still calculated and shown as a line (for transparency)
 * but is NOT added on top of the subtotal, since it's already baked in.
 * Service charge is never treated as inclusive — it's always additive.
 *
 * Defensive guards: `pricing` itself may be null/undefined (e.g. called
 * before the venue config subscription has resolved) — falls back to
 * DEFAULT_PRICING (0% / 0%) rather than throwing. `subtotal` is coerced
 * to a safe number — NaN or negative input produces a zeroed-out result
 * rather than NaN propagating into a displayed dollar amount.
 */
export function calculateOrderTotals(subtotal, pricing) {
  const safePricing = pricing ?? DEFAULT_PRICING;
  const safeSubtotal = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;

  const taxRate = (safePricing.taxRatePercent ?? 0) / 100;
  const serviceRate = (safePricing.serviceChargeRatePercent ?? 0) / 100;

  let taxAmount;

  if (safePricing.taxInclusive) {
    const divisor = 1 + taxRate;
    taxAmount = divisor !== 0 ? safeSubtotal - safeSubtotal / divisor : 0;
  } else {
    taxAmount = safeSubtotal * taxRate;
  }

  const serviceChargeAmount = safeSubtotal * serviceRate;

  const totalPrice = safePricing.taxInclusive
    ? safeSubtotal + serviceChargeAmount
    : safeSubtotal + taxAmount + serviceChargeAmount;

  return {
    subtotal: round2(safeSubtotal),
    taxAmount: round2(taxAmount),
    serviceChargeAmount: round2(serviceChargeAmount),
    totalPrice: round2(totalPrice),
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
