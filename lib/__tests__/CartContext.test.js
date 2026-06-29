// ─────────────────────────────────────────────────────────────────────────────
// lib/__tests__/CartContext.test.js  —  Cart line-item identity / merging
//
// buildLineKey() decides whether two "Add to Cart" taps become ONE cart
// line (quantity +1) or TWO separate lines. Getting this wrong in either
// direction is a real customer-facing bug:
//   - Too permissive (merges things that should be separate): "Burger, no
//     cheese" and "Burger, extra cheese" collapse into one line, losing
//     the distinction the kitchen needs to see.
//   - Too strict (never merges): tapping "Add to Cart" twice on the exact
//     same item with the exact same modifiers creates two separate lines
//     instead of one, contradicting the explicit product decision that
//     repeat-adds should just increment quantity.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { buildLineKey } from "../CartContext";

describe("buildLineKey", () => {
  it("produces the same key for the same item with no modifiers, called twice", () => {
    const a = buildLineKey({ itemId: "burger", selectedModifiers: [], specialInstructions: "" });
    const b = buildLineKey({ itemId: "burger", selectedModifiers: [], specialInstructions: "" });
    expect(a).toBe(b);
  });

  it("produces different keys for different items", () => {
    const a = buildLineKey({ itemId: "burger", selectedModifiers: [], specialInstructions: "" });
    const b = buildLineKey({ itemId: "fries", selectedModifiers: [], specialInstructions: "" });
    expect(a).not.toBe(b);
  });

  it("produces different keys for the same item with different modifiers", () => {
    const noCheese = buildLineKey({ itemId: "burger", selectedModifiers: [], specialInstructions: "" });
    const extraCheese = buildLineKey({
      itemId: "burger",
      selectedModifiers: [{ groupId: "addons", optionId: "extra_cheese", priceDelta: 1.5 }],
      specialInstructions: "",
    });
    expect(noCheese).not.toBe(extraCheese);
  });

  it("produces the same key regardless of the ORDER modifiers were selected in", () => {
    const sizeFirstThenSpice = buildLineKey({
      itemId: "burger",
      selectedModifiers: [
        { groupId: "size", optionId: "large", priceDelta: 3 },
        { groupId: "spice", optionId: "hot", priceDelta: 0 },
      ],
      specialInstructions: "",
    });
    const spiceFirstThenSize = buildLineKey({
      itemId: "burger",
      selectedModifiers: [
        { groupId: "spice", optionId: "hot", priceDelta: 0 },
        { groupId: "size", optionId: "large", priceDelta: 3 },
      ],
      specialInstructions: "",
    });
    expect(sizeFirstThenSpice).toBe(spiceFirstThenSize);
  });

  it("produces different keys for different special instructions on the same item", () => {
    const noIce = buildLineKey({ itemId: "soda", selectedModifiers: [], specialInstructions: "no ice" });
    const extraIce = buildLineKey({ itemId: "soda", selectedModifiers: [], specialInstructions: "extra ice" });
    expect(noIce).not.toBe(extraIce);
  });

  it("treats special instructions case-insensitively and trims whitespace", () => {
    const a = buildLineKey({ itemId: "soda", selectedModifiers: [], specialInstructions: "No Ice" });
    const b = buildLineKey({ itemId: "soda", selectedModifiers: [], specialInstructions: "  no ice  " });
    expect(a).toBe(b);
  });

  it("treats no instructions and empty-string instructions as the same line", () => {
    const a = buildLineKey({ itemId: "soda", selectedModifiers: [] });
    const b = buildLineKey({ itemId: "soda", selectedModifiers: [], specialInstructions: "" });
    expect(a).toBe(b);
  });

  it("two burgers with identical modifier selection but different priceDelta metadata still merge", () => {
    // The key is built from optionId only, not priceDelta — if a menu
    // price changes between two adds of the "same" option, they should
    // still merge as the same line.
    const a = buildLineKey({
      itemId: "burger",
      selectedModifiers: [{ groupId: "size", optionId: "large", priceDelta: 3 }],
      specialInstructions: "",
    });
    const b = buildLineKey({
      itemId: "burger",
      selectedModifiers: [{ groupId: "size", optionId: "large", priceDelta: 3.5 }],
      specialInstructions: "",
    });
    expect(a).toBe(b);
  });

  it("multiple selected modifiers in a multi-choice group all factor into the key", () => {
    const onionOnly = buildLineKey({
      itemId: "burger",
      selectedModifiers: [{ groupId: "addons", optionId: "onion" }],
      specialInstructions: "",
    });
    const onionAndCheese = buildLineKey({
      itemId: "burger",
      selectedModifiers: [
        { groupId: "addons", optionId: "onion" },
        { groupId: "addons", optionId: "cheese" },
      ],
      specialInstructions: "",
    });
    expect(onionOnly).not.toBe(onionAndCheese);
  });
});
