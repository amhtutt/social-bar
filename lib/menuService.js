// ─────────────────────────────────────────────────────────────────────────────
// lib/menuService.js  —  Menu Module: data layer (venue-scoped)
//
// Collections:
//   menuCategories/  — { venueId, name_en, name_mm, icon, sortOrder,
//                        isFeaturedCategory }
//   menuItems/       — { venueId, categoryId, name_en, name_mm,
//                        description_en, description_mm, price, imageUrl,
//                        available, sortOrder, modifierGroups, isCombo,
//                        comboItems, isPromotional, isFeatured }
//
// Modifier groups let a single menu item represent something like "Burger"
// with required Size (Regular/Large, +$0/+$3) and optional Add-ons (Extra
// cheese +$1.50, Bacon +$2). Shape:
//
//   modifierGroups: [
//     {
//       id: "grp_size",                 // stable string id, used by cart/order
//       name_en: "Size", name_mm: "...",
//       required: true,                 // customer must pick something
//       selectionType: "single",        // "single" (radio) | "multiple" (checkbox)
//       options: [
//         { id: "opt_regular", name_en: "Regular", name_mm: "...", priceDelta: 0 },
//         { id: "opt_large",   name_en: "Large",   name_mm: "...", priceDelta: 3 },
//       ],
//     },
//     ...
//   ]
//
// Combos bundle existing items into one orderable unit at a (usually
// discounted) bundle price. comboItems just references other menuItems by
// id + a display name snapshot (so the combo listing still reads
// correctly even if the referenced item is later renamed) + quantity.
//
// isPromotional / isFeatured are independent flags an admin can set on any
// item: isPromotional surfaces it under a "Promotions" pinned category,
// isFeatured surfaces it under "Most Popular" / "Recommended". A category
// can also be pinned directly via isFeaturedCategory.
//
// Images: stored as a plain imageUrl string field — admin pastes a hosted
// image URL rather than uploading a file. This avoids requiring Firebase
// Storage (paid Blaze plan).
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Categories ───────────────────────────────────────────────────────────────

export function subscribeToCategories(venueId, callback) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  const q = query(
    collection(db, "menuCategories"),
    where("venueId", "==", venueId),
    orderBy("sortOrder", "asc")
  );

  return onSnapshot(
    q,
    // Soft-deleted categories (deletedAt set) are filtered out here,
    // client-side, rather than via a Firestore where() clause — at the
    // scale of a single venue's category list (tens of rows, not
    // thousands), this avoids needing yet another composite index for a
    // simple filter. See deleteCategory() below for why this exists.
    (snap) => callback({ data: snap.docs.map(categoryDocToEntry).filter((c) => !c.deletedAt), error: null }),
    (err) => callback({ data: [], error: err })
  );
}

function categoryDocToEntry(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    venueId: d.venueId,
    name_en: d.name_en ?? "",
    name_mm: d.name_mm ?? "",
    icon: d.icon ?? "🍽️",
    sortOrder: d.sortOrder ?? 0,
    isFeaturedCategory: d.isFeaturedCategory ?? false,
    deletedAt: d.deletedAt ?? null,
  };
}

export async function createCategory(
  venueId,
  { name_en, name_mm, icon = "🍽️", sortOrder = 0, isFeaturedCategory = false }
) {
  return addDoc(collection(db, "menuCategories"), {
    venueId,
    name_en,
    name_mm,
    icon,
    sortOrder,
    isFeaturedCategory,
    deletedAt: null,
    createdAt: serverTimestamp(),
  });
}

export async function updateCategory(categoryId, fields) {
  const ref = doc(db, "menuCategories", categoryId);
  return updateDoc(ref, { ...fields, updatedAt: serverTimestamp() });
}

/**
 * deleteCategory(categoryId)
 * SOFT delete — sets deletedAt instead of removing the document. This
 * means a category that's referenced by historical orders (via items'
 * categoryId, if that's ever joined for reporting) never disappears from
 * underneath past data. subscribeToCategories() filters these out for
 * display, so the customer/admin experience is unchanged — the doc just
 * isn't actually gone.
 */
export async function deleteCategory(categoryId) {
  const ref = doc(db, "menuCategories", categoryId);
  return updateDoc(ref, { deletedAt: serverTimestamp() });
}

/**
 * restoreCategory(categoryId)
 * Undo for deleteCategory() — clears deletedAt within the brief undo
 * grace window (see components/UndoToast.jsx). Trivial precisely because
 * delete was already a soft-delete — nothing was actually removed.
 */
export async function restoreCategory(categoryId) {
  const ref = doc(db, "menuCategories", categoryId);
  return updateDoc(ref, { deletedAt: null });
}

// ─── Menu Items ───────────────────────────────────────────────────────────────

export function subscribeToMenuItems(venueId, callback) {
  if (!venueId) {
    callback({ data: [], error: null });
    return () => {};
  }

  const q = query(
    collection(db, "menuItems"),
    where("venueId", "==", venueId),
    orderBy("sortOrder", "asc")
  );

  return onSnapshot(
    q,
    // Same client-side soft-delete filter as subscribeToCategories — see
    // that function's comment for why this isn't a Firestore where() clause.
    (snap) => callback({ data: snap.docs.map(itemDocToEntry).filter((i) => !i.deletedAt), error: null }),
    (err) => callback({ data: [], error: err })
  );
}

function itemDocToEntry(docSnap) {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    venueId: d.venueId,
    categoryId: d.categoryId ?? null,
    name_en: d.name_en ?? "",
    name_mm: d.name_mm ?? "",
    description_en: d.description_en ?? "",
    description_mm: d.description_mm ?? "",
    price: d.price ?? 0,
    imageUrl: d.imageUrl ?? null,
    available: d.available !== false,
    sortOrder: d.sortOrder ?? 0,
    modifierGroups: d.modifierGroups ?? [],
    isCombo: d.isCombo ?? false,
    comboItems: d.comboItems ?? [],
    isPromotional: d.isPromotional ?? false,
    isFeatured: d.isFeatured ?? false,
    deletedAt: d.deletedAt ?? null,
    createdAt: d.createdAt?.toDate?.() ?? null,
    updatedAt: d.updatedAt?.toDate?.() ?? null,
  };
}

export async function createMenuItem(venueId, itemData) {
  return addDoc(collection(db, "menuItems"), {
    venueId,
    categoryId: itemData.categoryId ?? null,
    name_en: itemData.name_en ?? "",
    name_mm: itemData.name_mm ?? "",
    description_en: itemData.description_en ?? "",
    description_mm: itemData.description_mm ?? "",
    price: itemData.price ?? 0,
    imageUrl: itemData.imageUrl ?? null,
    available: itemData.available ?? true,
    sortOrder: itemData.sortOrder ?? 0,
    modifierGroups: itemData.modifierGroups ?? [],
    isCombo: itemData.isCombo ?? false,
    comboItems: itemData.comboItems ?? [],
    isPromotional: itemData.isPromotional ?? false,
    isFeatured: itemData.isFeatured ?? false,
    deletedAt: null,
    createdAt: serverTimestamp(),
  });
}

export async function updateMenuItem(itemId, fields) {
  const ref = doc(db, "menuItems", itemId);
  return updateDoc(ref, { ...fields, updatedAt: serverTimestamp() });
}

/**
 * deleteMenuItem(itemId)
 * SOFT delete — sets deletedAt instead of removing the document. Orders
 * already store their own name/price snapshot per line item, so this
 * isn't needed for bill correctness — it's mainly useful if a future
 * "most-ordered item" or "reorder" feature ever needs to look up an
 * item by id and finds it's been deleted: the document (and its
 * historical association) still exists, it's just hidden from the live
 * menu via subscribeToMenuItems()'s filter above.
 */
export async function deleteMenuItem(itemId) {
  const ref = doc(db, "menuItems", itemId);
  return updateDoc(ref, { deletedAt: serverTimestamp() });
}

/**
 * restoreMenuItem(itemId)
 * Undo for deleteMenuItem() — clears deletedAt within the brief undo
 * grace window.
 */
export async function restoreMenuItem(itemId) {
  const ref = doc(db, "menuItems", itemId);
  return updateDoc(ref, { deletedAt: null });
}

// ─── Modifier group helpers ────────────────────────────────────────────────────

export function createEmptyModifierGroup() {
  return {
    id: `grp_${Date.now()}`,
    name_en: "",
    name_mm: "",
    required: false,
    selectionType: "single",
    options: [],
  };
}

export function createEmptyModifierOption() {
  return {
    id: `opt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name_en: "",
    name_mm: "",
    priceDelta: 0,
  };
}

/**
 * calculateModifiersPriceDelta(selectedModifiers)
 * Sums priceDelta across every selected option — used by cart and order
 * total calculations. selectedModifiers shape:
 *   [{ groupId, groupName_en, optionId, optionName_en, priceDelta }]
 */
export function calculateModifiersPriceDelta(selectedModifiers = []) {
  return selectedModifiers.reduce((sum, m) => sum + (m.priceDelta ?? 0), 0);
}

// ─── Image URL helper ──────────────────────────────────────────────────────────

export function isValidImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Menu export ────────────────────────────────────────────────────────────

/**
 * exportMenuToJson(venueId)
 * One-time fetch (not a live subscription) of every category and item
 * for a venue, returned as a single JSON-serializable object. Used for
 * backup/portability purposes — admin can download this as a file and
 * keep it outside Firestore entirely.
 *
 * Deliberately includes soft-deleted categories/items too (unlike the
 * live subscriptions, which filter them out) — a backup should be a
 * complete snapshot of everything that exists, not just what's currently
 * visible to customers. Each entry's `deleted` flag tells you which ones
 * were soft-deleted at export time.
 *
 * Does NOT include Firestore document ids as the primary identifier for
 * re-import purposes — categories/items are exported with their CURRENT
 * doc id preserved as `id` for reference, but a hypothetical future
 * "import this JSON" feature would need its own id-remapping logic since
 * Firestore ids aren't meant to be reused across re-imports.
 */
export async function exportMenuToJson(venueId) {
  const categoriesSnap = await getDocs(query(collection(db, "menuCategories"), where("venueId", "==", venueId)));
  const itemsSnap = await getDocs(query(collection(db, "menuItems"), where("venueId", "==", venueId)));

  const categories = categoriesSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name_en: data.name_en ?? "",
      name_mm: data.name_mm ?? "",
      icon: data.icon ?? "",
      sortOrder: data.sortOrder ?? 0,
      isFeaturedCategory: data.isFeaturedCategory ?? false,
      deleted: !!data.deletedAt,
    };
  });

  const items = itemsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      categoryId: data.categoryId ?? null,
      name_en: data.name_en ?? "",
      name_mm: data.name_mm ?? "",
      description_en: data.description_en ?? "",
      description_mm: data.description_mm ?? "",
      price: data.price ?? 0,
      imageUrl: data.imageUrl ?? null,
      available: data.available !== false,
      sortOrder: data.sortOrder ?? 0,
      modifierGroups: data.modifierGroups ?? [],
      isCombo: data.isCombo ?? false,
      comboItems: data.comboItems ?? [],
      isPromotional: data.isPromotional ?? false,
      isFeatured: data.isFeatured ?? false,
      deleted: !!data.deletedAt,
    };
  });

  return {
    exportedAt: new Date().toISOString(),
    venueId,
    categoryCount: categories.length,
    itemCount: items.length,
    categories,
    items,
  };
}
