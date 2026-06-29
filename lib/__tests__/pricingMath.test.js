// ─────────────────────────────────────────────────────────────────────────────
// lib/__tests__/venueConfig.test.js  —  Tax/service charge math
//
// This is the single most important function to test correctness for in
// this whole app: it's the money math used by the cart, order
// submission, every staff edit, and the bill. A bug here either
// overcharges or undercharges every single order at a venue.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { calculateOrderTotals } from "../pricingMath";

describe("calculateOrderTotals", () => {
  it("returns the subtotal unchanged with 0% tax and 0% service charge", () => {
    const result = calculateOrderTotals(100, { taxRatePercent: 0, serviceChargeRatePercent: 0, taxInclusive: false });
    expect(result).toEqual({ subtotal: 100, taxAmount: 0, serviceChargeAmount: 0, totalPrice: 100 });
  });

  it("applies a simple additive tax rate", () => {
    const result = calculateOrderTotals(100, { taxRatePercent: 5, serviceChargeRatePercent: 0, taxInclusive: false });
    expect(result.taxAmount).toBe(5);
    expect(result.totalPrice).toBe(105);
  });

  it("applies a simple additive service charge", () => {
    const result = calculateOrderTotals(100, { taxRatePercent: 0, serviceChargeRatePercent: 10, taxInclusive: false });
    expect(result.serviceChargeAmount).toBe(10);
    expect(result.totalPrice).toBe(110);
  });

  it("applies tax and service charge together, both additive", () => {
    const result = calculateOrderTotals(100, { taxRatePercent: 5, serviceChargeRatePercent: 10, taxInclusive: false });
    expect(result.taxAmount).toBe(5);
    expect(result.serviceChargeAmount).toBe(10);
    expect(result.totalPrice).toBe(115);
  });

  it("does not double-count tax when taxInclusive is true", () => {
    const result = calculateOrderTotals(105, { taxRatePercent: 5, serviceChargeRatePercent: 0, taxInclusive: true });
    expect(result.taxAmount).toBeCloseTo(5, 2);
    expect(result.totalPrice).toBe(105);
  });

  it("adds service charge on top even when tax is inclusive", () => {
    const result = calculateOrderTotals(105, { taxRatePercent: 5, serviceChargeRatePercent: 10, taxInclusive: true });
    expect(result.serviceChargeAmount).toBeCloseTo(10.5, 2);
    expect(result.totalPrice).toBeCloseTo(115.5, 2);
  });

  it("rounds every output to 2 decimal places", () => {
    const result = calculateOrderTotals(33.33, { taxRatePercent: 7, serviceChargeRatePercent: 0, taxInclusive: false });
    expect(result.taxAmount).toBe(2.33);
    expect(Number.isFinite(result.totalPrice)).toBe(true);
  });

  // Defensive guards added after the agency security/QA review

  it("falls back to DEFAULT_PRICING (0%/0%) when pricing is null", () => {
    const result = calculateOrderTotals(100, null);
    expect(result.taxAmount).toBe(0);
    expect(result.serviceChargeAmount).toBe(0);
    expect(result.totalPrice).toBe(100);
  });

  it("falls back to DEFAULT_PRICING when pricing is undefined", () => {
    const result = calculateOrderTotals(100, undefined);
    expect(result.totalPrice).toBe(100);
  });

  it("treats a NaN subtotal as 0 rather than propagating NaN", () => {
    const result = calculateOrderTotals(NaN, { taxRatePercent: 5, serviceChargeRatePercent: 10, taxInclusive: false });
    expect(result.subtotal).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.serviceChargeAmount).toBe(0);
    expect(result.totalPrice).toBe(0);
    expect(Number.isNaN(result.totalPrice)).toBe(false);
  });

  it("treats a negative subtotal as 0 rather than producing a negative total", () => {
    const result = calculateOrderTotals(-50, { taxRatePercent: 5, serviceChargeRatePercent: 0, taxInclusive: false });
    expect(result.subtotal).toBe(0);
    expect(result.totalPrice).toBe(0);
  });

  it("never divides by zero even with a -100% tax rate in taxInclusive mode", () => {
    const result = calculateOrderTotals(100, { taxRatePercent: -100, serviceChargeRatePercent: 0, taxInclusive: true });
    expect(Number.isFinite(result.taxAmount)).toBe(true);
    expect(Number.isNaN(result.taxAmount)).toBe(false);
  });

  it("handles a subtotal of exactly 0 cleanly", () => {
    const result = calculateOrderTotals(0, { taxRatePercent: 5, serviceChargeRatePercent: 10, taxInclusive: false });
    expect(result).toEqual({ subtotal: 0, taxAmount: 0, serviceChargeAmount: 0, totalPrice: 0 });
  });
});
