// ─────────────────────────────────────────────────────────────────────────────
// vitest.config.mjs  —  Test runner configuration
//
// Tests live alongside the code they cover, in __tests__/ folders, rather
// than a separate top-level test directory — keeps a test close to what
// it's testing as the codebase grows.
//
// Only lib/ pure-logic modules are tested for now (calculateOrderTotals,
// CartContext's line-merging) — these are the highest-value targets since
// they're money math and cart-correctness logic with no UI/Firestore
// dependency, making them fast and reliable to test in isolation.
// Component/integration tests (React Testing Library + Firestore
// emulator) are a reasonable next step but a larger lift — intentionally
// out of scope for this first pass.
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.js"],
    exclude: ["node_modules", ".next", "functions/node_modules"],
  },
});
