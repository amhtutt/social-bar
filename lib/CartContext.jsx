"use client";

// ─────────────────────────────────────────────────────────────────────────────
// lib/CartContext.jsx  —  Cart state (ephemeral, local — NOT Firestore)
//
// The cart is a local "draft" — it never touches Firestore until the
// customer taps "Place Order", at which point orderService.submitOrder()
// writes it as a permanent order document and the cart clears.
//
// Line item identity: two cart entries are only the SAME line if they
// share both itemId AND an identical set of selected modifiers (and the
// same special instructions text). "Burger, no cheese" and "Burger, extra
// cheese" stay as separate lines even though itemId matches — they have a
// different effective price and the kitchen needs to see them separately.
// buildLineKey() below builds a stable string for this comparison.
//
// Per product decision: quantity selection lives ONLY in the cart, not on
// the menu card. Tapping "Add to Cart" again on an item with the exact
// same modifiers/instructions just increments that line's quantity rather
// than opening a duplicate or asking again.
//
// PERSISTENCE: pass persistKey (e.g. "cart_{venueId}_{table}_{slot}") to
// survive a refresh or the tablet sleeping mid-order — a real risk on a
// shared tablet during service, and previously meant a lost cart with no
// warning. Omit persistKey (StaffOrderModal's usage) for a cart that's
// intentionally short-lived and never touches localStorage.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";

function loadPersistedCart(persistKey) {
  if (!persistKey || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(persistKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const CartContext = createContext(null);

/**
 * buildLineKey({ itemId, selectedModifiers, specialInstructions })
 * Selected modifiers are sorted by optionId before joining so selection
 * ORDER never affects the key — only WHICH options are selected.
 *
 * Exported (not just used internally) so it can be unit tested directly
 * — see lib/__tests__/CartContext.test.js — without needing to mount the
 * full CartProvider/React tree just to verify line-merge correctness.
 */
export function buildLineKey({ itemId, selectedModifiers = [], specialInstructions = "" }) {
  const modifierKey = [...selectedModifiers]
    .map((m) => m.optionId)
    .sort()
    .join(",");
  return `${itemId}::${modifierKey}::${specialInstructions.trim().toLowerCase()}`;
}

export function CartProvider({ children, persistKey }) {
  const [cartItems, setCartItems] = useState(() => loadPersistedCart(persistKey));
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    if (!persistKey || typeof window === "undefined") return;
    try {
      if (cartItems.length === 0) localStorage.removeItem(persistKey);
      else localStorage.setItem(persistKey, JSON.stringify(cartItems));
    } catch {
      // ignore — worst case the cart doesn't survive a reload
    }
  }, [cartItems, persistKey]);

  /**
   * addToCart(cartLine)
   * cartLine shape: {
   *   itemId, name_en, name_mm, basePrice,
   *   selectedModifiers: [{ groupId, groupName_en, optionId, optionName_en, priceDelta }],
   *   specialInstructions: "",
   *   quantity: 1,            // how many to add THIS call — defaults to 1
   * }
   * unitPrice is derived (basePrice + sum of modifier deltas), never
   * passed in directly, so it can't drift out of sync with the modifiers.
   */
  const addToCart = useCallback((cartLine) => {
    const key = buildLineKey(cartLine);
    const modifiersTotal = (cartLine.selectedModifiers ?? []).reduce((sum, m) => sum + (m.priceDelta ?? 0), 0);
    const unitPrice = (cartLine.basePrice ?? 0) + modifiersTotal;
    const addQuantity = cartLine.quantity ?? 1;

    setCartItems((prev) => {
      const existing = prev.find((c) => c.lineKey === key);
      if (existing) {
        return prev.map((c) => (c.lineKey === key ? { ...c, quantity: c.quantity + addQuantity } : c));
      }
      return [
        ...prev,
        {
          lineKey: key,
          itemId: cartLine.itemId,
          name_en: cartLine.name_en,
          name_mm: cartLine.name_mm,
          basePrice: cartLine.basePrice ?? 0,
          selectedModifiers: cartLine.selectedModifiers ?? [],
          specialInstructions: cartLine.specialInstructions ?? "",
          unitPrice,
          quantity: addQuantity,
        },
      ];
    });
    setIsDrawerOpen(true);
  }, []);

  const incrementItem = useCallback((lineKey) => {
    setCartItems((prev) => prev.map((c) => (c.lineKey === lineKey ? { ...c, quantity: c.quantity + 1 } : c)));
  }, []);

  const decrementItem = useCallback((lineKey) => {
    setCartItems((prev) =>
      prev.map((c) => (c.lineKey === lineKey ? { ...c, quantity: c.quantity - 1 } : c)).filter((c) => c.quantity > 0)
    );
  }, []);

  const removeItem = useCallback((lineKey) => {
    setCartItems((prev) => prev.filter((c) => c.lineKey !== lineKey));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  const subtotal = useMemo(
    () => cartItems.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0),
    [cartItems]
  );

  const totalItemCount = useMemo(
    () => cartItems.reduce((sum, c) => sum + c.quantity, 0),
    [cartItems]
  );

  const value = {
    cartItems,
    isDrawerOpen,
    subtotal,
    totalItemCount,
    addToCart,
    incrementItem,
    decrementItem,
    removeItem,
    clearCart,
    openDrawer,
    closeDrawer,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart() must be used inside a <CartProvider>");
  }
  return ctx;
}

/**
 * useCartOptional()
 * Same as useCart(), but returns null instead of throwing when there's no
 * CartProvider in the tree. Needed by MenuView, which is reused in two
 * contexts: inside /table (wrapped in CartProvider, shared tablet cart)
 * and inside StaffOrderModal on /staff (no CartProvider — staff supply
 * their own onAddToCart override and manage a local cart instead).
 */
export function useCartOptional() {
  return useContext(CartContext);
}
