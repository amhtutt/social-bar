"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/MenuView.jsx  —  Customer-facing Menu Browsing screen
//
// Sidebar category list + card grid. Two VIRTUAL categories are
// synthesized client-side and pinned to the top of the sidebar when
// relevant items exist:
//   "Most Popular" — every item with isFeatured = true
//   "Promotions"    — every item with isPromotional = true
// These aren't real Firestore categories; selecting one just filters
// items by flag instead of categoryId. A real category can also be
// pinned via isFeaturedCategory.
//
// Items with modifierGroups open ItemCustomizationModal on tap; items
// without any modifiers add straight to cart. Quantity selection lives
// ONLY in the cart/modal — tapping Add again on the same item with the
// same modifiers/instructions just increments that line.
//
// Price typography: bar-appropriate middle ground — visible and confident,
// not whisper-quiet fine-dining, not screaming neon either.
// Bilingual: Burmese script gets extra line-height since its glyphs run
// taller than Latin and looked cramped at the old setting.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import { subscribeToCategories, subscribeToMenuItems } from "@/lib/menuService";
import { useCartOptional } from "@/lib/CartContext";
import { theme } from "@/lib/theme";
import ItemCustomizationModal from "./ItemCustomizationModal";

const LANG_STORAGE_KEY = "bar_menu_lang";
const FEATURED_CATEGORY_ID = "__featured__";
const PROMO_CATEGORY_ID = "__promo__";

function loadLang() {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) === "mm" ? "mm" : "en";
  } catch {
    return "en";
  }
}
function saveLang(lang) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

function textLineHeight(lang) {
  return lang === "mm" ? 1.8 : 1.4;
}

function Shimmer() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
        animation: "shimmerSweep 1.6s ease-in-out infinite",
      }}
    />
  );
}

function CategorySkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            height: 48,
            borderRadius: 12,
            background: theme.color.surface,
            border: `1px solid ${theme.color.border}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Shimmer />
        </div>
      ))}
    </div>
  );
}

function ItemCardSkeleton() {
  return (
    <div
      style={{
        borderRadius: 16,
        overflow: "hidden",
        background: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
      }}
    >
      <div style={{ height: 160, background: "rgba(255,255,255,0.04)", position: "relative", overflow: "hidden" }}>
        <Shimmer />
      </div>
      <div style={{ padding: 16 }}>
        <div
          style={{
            height: 18,
            width: "70%",
            borderRadius: 6,
            background: "rgba(255,255,255,0.06)",
            marginBottom: 8,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Shimmer />
        </div>
        <div
          style={{
            height: 12,
            width: "50%",
            borderRadius: 6,
            background: "rgba(255,255,255,0.04)",
            marginBottom: 14,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Shimmer />
        </div>
        <div style={{ height: 36, borderRadius: 10, background: "rgba(255,255,255,0.04)", position: "relative", overflow: "hidden" }}>
          <Shimmer />
        </div>
      </div>
    </div>
  );
}

function LangToggle({ lang, onChange }) {
  return (
    <div style={{ display: "flex", background: theme.color.surface, border: `1px solid ${theme.color.border}`, borderRadius: 10, padding: 3 }}>
      {["en", "mm"].map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "none",
            background: lang === l ? theme.color.accentBg : "transparent",
            color: lang === l ? theme.color.accent : theme.color.textMuted,
            fontFamily: theme.font.display,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.04em",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          {l === "en" ? "EN" : "MM"}
        </button>
      ))}
    </div>
  );
}

function CategoryButton({ category, active, lang, onClick }) {
  const label = lang === "mm" && category.name_mm ? category.name_mm : category.name_en;
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "13px 16px",
        borderRadius: 12,
        border: `1.5px solid ${active ? theme.color.accentBorder : theme.color.border}`,
        background: active ? theme.color.accentBg : "rgba(255,255,255,0.02)",
        color: active ? theme.color.accent : theme.color.textSecondary,
        fontFamily: theme.font.display,
        fontWeight: active ? 700 : 500,
        fontSize: 14,
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{category.icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: textLineHeight(lang) }}>
        {label}
      </span>
    </button>
  );
}

function MenuItemCard({ item, lang, onTapAdd }) {
  const name = lang === "mm" && item.name_mm ? item.name_mm : item.name_en;
  const description = lang === "mm" && item.description_mm ? item.description_mm : item.description_en;
  const isAvailable = item.available;
  const hasModifiers = item.modifierGroups && item.modifierGroups.length > 0;
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = () => {
    if (!isAvailable) return;
    if (hasModifiers) {
      onTapAdd(item);
      return;
    }
    onTapAdd(item, { skipModal: true });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 900);
  };

  return (
    <div
      style={{
        borderRadius: 16,
        overflow: "hidden",
        background: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
        opacity: isAvailable ? 1 : 0.5,
        transition: "opacity 0.3s ease",
        animation: "fadeUp 0.3s ease both",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 6, zIndex: 1 }}>
        {item.isPromotional && <span style={styles.promoBadge}>PROMO</span>}
        {item.isCombo && <span style={styles.comboBadge}>COMBO</span>}
        {item.isFeatured && <span style={styles.popularBadge}>★ POPULAR</span>}
      </div>

      <div
        style={{
          height: 160,
          background: item.imageUrl
            ? `center / cover no-repeat url(${item.imageUrl})`
            : "linear-gradient(135deg, rgba(0,255,170,0.08), rgba(80,80,255,0.05))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {!item.imageUrl && <span style={{ fontSize: 36, opacity: 0.3 }}>🍽️</span>}
        {!isAvailable && (
          <div style={styles.unavailableBadge}>
            <span style={{ fontFamily: theme.font.display, fontSize: 10, fontWeight: 700, color: theme.color.danger, letterSpacing: "0.04em" }}>
              UNAVAILABLE
            </span>
          </div>
        )}
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
          <p
            style={{
              margin: 0,
              fontFamily: theme.font.display,
              fontWeight: 700,
              fontSize: 15,
              color: theme.color.textPrimary,
              lineHeight: textLineHeight(lang),
            }}
          >
            {name}
          </p>
          <p style={{ margin: 0, fontFamily: theme.font.display, fontWeight: 700, fontSize: 14, color: theme.color.textPrimary, whiteSpace: "nowrap" }}>
            ${item.price.toFixed(2)}
          </p>
        </div>

        {item.isCombo && item.comboItems?.length > 0 && (
          <p style={styles.comboContents}>{item.comboItems.map((c) => `${c.quantity}× ${c.name_en}`).join(" + ")}</p>
        )}

        {description && (
          <p
            style={{
              margin: "0 0 14px",
              fontFamily: theme.font.body,
              fontSize: 12,
              color: theme.color.textMuted,
              lineHeight: textLineHeight(lang),
            }}
          >
            {description}
          </p>
        )}

        <button
          onClick={handleAdd}
          disabled={!isAvailable}
          style={{
            width: "100%",
            padding: "11px",
            borderRadius: 10,
            border: isAvailable ? `1.5px solid ${theme.color.accentBorder}` : `1.5px solid ${theme.color.border}`,
            background: justAdded ? theme.color.accent : isAvailable ? theme.color.accentBg : "rgba(255,255,255,0.02)",
            color: justAdded ? theme.color.bg : isAvailable ? theme.color.accent : theme.color.textFaint,
            fontFamily: theme.font.display,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.04em",
            cursor: isAvailable ? "pointer" : "not-allowed",
            transition: "all 0.2s ease",
          }}
        >
          {!isAvailable ? "CURRENTLY UNAVAILABLE" : justAdded ? "✓ ADDED" : hasModifiers ? "CUSTOMIZE & ADD" : "+ ADD TO CART"}
        </button>
      </div>
    </div>
  );
}

function EmptyMenuState() {
  return (
    <div style={styles.emptyWrap}>
      <span style={{ fontSize: 44 }}>🍃</span>
      <p style={styles.emptyTitle}>Nothing here yet</p>
      <p style={styles.emptyBody}>This category is still being set up. Try another tab, or ask your server.</p>
    </div>
  );
}

function MenuErrorState({ onRetry }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", background: theme.color.dangerBg, border: `1px solid ${theme.color.danger}30`, borderRadius: 14 }}>
      <p style={{ fontFamily: theme.font.body, fontSize: 14, color: theme.color.danger, margin: "0 0 14px" }}>
        Could not load the menu. Try again, or ask staff for help.
      </p>
      <button
        onClick={onRetry}
        style={{
          padding: "10px 20px",
          borderRadius: theme.radius.sm,
          border: `1px solid ${theme.color.danger}`,
          background: "transparent",
          color: theme.color.danger,
          fontFamily: theme.font.display,
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

export default function MenuView({ venueId, onAddToCart }) {
  const cart = useCartOptional();
  const handleAddRaw = onAddToCart ?? cart?.addToCart ?? (() => {});

  const [lang, setLang] = useState("en");
  const [categories, setCategories] = useState(null);
  const [categoriesError, setCatError] = useState(false);
  const [items, setItems] = useState(null);
  const [itemsError, setItemsError] = useState(false);
  const [activeCategoryId, setActiveCat] = useState(null);
  const [customizingItem, setCustomizingItem] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = () => {
    setCategories(null);
    setItems(null);
    setCatError(false);
    setItemsError(false);
    setRetryKey((k) => k + 1);
  };

  useEffect(() => {
    setLang(loadLang());

    if (!venueId) return;

    const unsubCategories = subscribeToCategories(venueId, ({ data, error }) => {
      setCatError(!!error);
      setCategories(error ? [] : data);
    });

    const unsubItems = subscribeToMenuItems(venueId, ({ data, error }) => {
      setItemsError(!!error);
      setItems(error ? [] : data);
    });

    return () => {
      unsubCategories();
      unsubItems();
    };
  }, [venueId, retryKey]);

  const handleLangChange = (newLang) => {
    setLang(newLang);
    saveLang(newLang);
  };

  const featuredItems = useMemo(() => (items ?? []).filter((i) => i.isFeatured), [items]);
  const promoItems = useMemo(() => (items ?? []).filter((i) => i.isPromotional), [items]);

  const sidebarCategories = useMemo(() => {
    const list = [];
    if (featuredItems.length > 0) {
      list.push({ id: FEATURED_CATEGORY_ID, name_en: "Most Popular", name_mm: "ရေပန်းစားဆုံး", icon: "⭐" });
    }
    if (promoItems.length > 0) {
      list.push({ id: PROMO_CATEGORY_ID, name_en: "Promotions", name_mm: "ပရိုမိုးရှင်း", icon: "🏷️" });
    }
    const realCategories = [...(categories ?? [])].sort((a, b) => {
      if (a.isFeaturedCategory !== b.isFeaturedCategory) return a.isFeaturedCategory ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });
    return [...list, ...realCategories];
  }, [categories, featuredItems.length, promoItems.length]);

  useEffect(() => {
    if (activeCategoryId === null && sidebarCategories.length > 0) {
      setActiveCat(sidebarCategories[0].id);
    }
  }, [sidebarCategories, activeCategoryId]);

  const visibleItems = useMemo(() => {
    if (!items || !activeCategoryId) return [];
    if (activeCategoryId === FEATURED_CATEGORY_ID) return featuredItems;
    if (activeCategoryId === PROMO_CATEGORY_ID) return promoItems;
    return items.filter((item) => item.categoryId === activeCategoryId);
  }, [items, activeCategoryId, featuredItems, promoItems]);

  const activeCategory = useMemo(
    () => sidebarCategories.find((c) => c.id === activeCategoryId) ?? null,
    [sidebarCategories, activeCategoryId]
  );

  const categoriesLoading = categories === null;
  const itemsLoading = items === null;

  const handleTapAdd = (item, opts = {}) => {
    if (opts.skipModal) {
      handleAddRaw({
        itemId: item.id,
        name_en: item.name_en,
        name_mm: item.name_mm,
        basePrice: item.price,
        selectedModifiers: [],
        specialInstructions: "",
        quantity: 1,
      });
      return;
    }
    setCustomizingItem(item);
  };

  const handleModalConfirm = (cartLine) => {
    handleAddRaw(cartLine);
    // Brief delay so ItemCustomizationModal's "✓ Added" confirming state
    // is actually visible for a moment before the modal unmounts —
    // otherwise the cart update is instant and the modal disappears
    // before the customer can register their tap worked.
    setTimeout(() => setCustomizingItem(null), 500);
  };

  return (
    <div style={{ display: "flex", gap: 20, width: "100%", flexWrap: "wrap" }}>
      <aside style={{ width: 220, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <p
            style={{
              margin: 0,
              fontFamily: theme.font.display,
              fontSize: 10,
              fontWeight: 700,
              color: theme.color.textMuted,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Categories
          </p>
          <LangToggle lang={lang} onChange={handleLangChange} />
        </div>

        {categoriesLoading && <CategorySkeleton />}
        {!categoriesLoading && categoriesError && <MenuErrorState onRetry={handleRetry} />}
        {!categoriesLoading && !categoriesError && sidebarCategories.length === 0 && (
          <p style={{ fontFamily: theme.font.body, fontSize: 12, color: theme.color.textMuted }}>No categories yet.</p>
        )}
        {!categoriesLoading && !categoriesError && sidebarCategories.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sidebarCategories.map((cat) => (
              <CategoryButton key={cat.id} category={cat} active={cat.id === activeCategoryId} lang={lang} onClick={() => setActiveCat(cat.id)} />
            ))}
          </div>
        )}
      </aside>

      <main style={{ flex: 1, minWidth: 280 }}>
        {activeCategory && (
          <div style={{ marginBottom: 20 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: theme.font.display,
                fontWeight: 800,
                fontSize: 22,
                color: theme.color.textPrimary,
                lineHeight: textLineHeight(lang),
              }}
            >
              {lang === "mm" && activeCategory.name_mm ? activeCategory.name_mm : activeCategory.name_en}
            </h2>
          </div>
        )}

        {itemsError && <MenuErrorState onRetry={handleRetry} />}

        {!itemsError && (itemsLoading || categoriesLoading) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <ItemCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!itemsError && !itemsLoading && !categoriesLoading && visibleItems.length === 0 && <EmptyMenuState />}

        {!itemsError && !itemsLoading && !categoriesLoading && visibleItems.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {visibleItems.map((item) => (
              <MenuItemCard key={item.id} item={item} lang={lang} onTapAdd={handleTapAdd} />
            ))}
          </div>
        )}
      </main>

      {customizingItem && (
        <ItemCustomizationModal item={customizingItem} lang={lang} onClose={() => setCustomizingItem(null)} onConfirm={handleModalConfirm} />
      )}
    </div>
  );
}

const styles = {
  promoBadge: {
    fontFamily: theme.font.display,
    fontSize: 9,
    fontWeight: 800,
    color: theme.color.bg,
    background: theme.color.warning,
    borderRadius: 5,
    padding: "3px 7px",
    letterSpacing: "0.04em",
  },
  comboBadge: {
    fontFamily: theme.font.display,
    fontSize: 9,
    fontWeight: 800,
    color: theme.color.bg,
    background: theme.color.info,
    borderRadius: 5,
    padding: "3px 7px",
    letterSpacing: "0.04em",
  },
  popularBadge: {
    fontFamily: theme.font.display,
    fontSize: 9,
    fontWeight: 800,
    color: theme.color.bg,
    background: theme.color.accent,
    borderRadius: 5,
    padding: "3px 7px",
    letterSpacing: "0.04em",
  },
  unavailableBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    background: "rgba(10,12,16,0.85)",
    border: `1px solid ${theme.color.danger}40`,
    borderRadius: 8,
    padding: "4px 10px",
  },
  comboContents: {
    margin: "0 0 6px",
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textFaint,
    fontStyle: "italic",
  },
  emptyWrap: {
    textAlign: "center",
    padding: "60px 20px",
  },
  emptyTitle: {
    margin: "12px 0 4px",
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 16,
    color: theme.color.textSecondary,
  },
  emptyBody: {
    margin: 0,
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
    maxWidth: 280,
    marginLeft: "auto",
    marginRight: "auto",
    lineHeight: 1.6,
  },
};
