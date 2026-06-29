"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/admin/ItemManager.jsx  —  Admin: manage menu items
//
// List of all items with Edit/Delete, plus an "Add Item" button. Form
// includes category select, bilingual name/description, price, pasted
// image URL, availability, modifier groups (ModifierGroupsEditor),
// combo bundling (ComboItemsEditor, only shown when "Is a combo" is
// checked), and promotional/featured flags.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import {
  subscribeToCategories,
  subscribeToMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  restoreMenuItem,
  isValidImageUrl,
} from "@/lib/menuService";
import { logActivity } from "@/lib/activityLogService";
import { useAuth } from "@/lib/AuthContext";
import { theme } from "@/lib/theme";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { Field, TextInput, TextArea, Checkbox } from "./FormField";
import ModifierGroupsEditor from "./ModifierGroupsEditor";
import ComboItemsEditor from "./ComboItemsEditor";
import UndoToast from "@/components/UndoToast";

// Swallow logging errors so a failed audit-log write never blocks the
// actual menu mutation it's describing — same pattern as orderService.js.
async function safeLog(entry) {
  try {
    await logActivity(entry);
  } catch (err) {
    console.error("[ItemManager] Failed to write activity log entry:", err);
  }
}

/**
 * formatRelativeTime(date)
 * Short, human-scale "last updated" label for the item list — "2h ago"
 * reads faster than a full timestamp when scanning a long menu list.
 * Falls back to a real date once it's more than a few days old, since
 * "14d ago" is less useful than just seeing the actual date at that point.
 */
function formatRelativeTime(date) {
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 4) return `${diffDays}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

const EMPTY_FORM = {
  categoryId: "",
  name_en: "",
  name_mm: "",
  description_en: "",
  description_mm: "",
  price: "",
  imageUrl: "",
  available: true,
  sortOrder: 0,
  modifierGroups: [],
  isCombo: false,
  comboItems: [],
  isPromotional: false,
  isFeatured: false,
};

export default function ItemManager() {
  const { venueId, profile } = useAuth();
  const [categories, setCategories] = useState(null);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("add");
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk availability toggle — selectedIds is a Set, cleared whenever
  // the underlying item list changes shape in a way that could leave it
  // pointing at stale ids (e.g. after a bulk action completes).
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleSelected = (itemId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  /**
   * handleBulkSetAvailability(makeAvailable)
   * Updates every selected item's `available` flag in one pass. Logs ONE
   * activityLog entry summarizing the whole batch (not one per item) —
   * "set 8 items unavailable" is a more useful audit line than 8
   * separate near-identical entries clogging the feed.
   */
  const handleBulkSetAvailability = async (makeAvailable) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const targetItems = (items ?? []).filter((i) => selectedIds.has(i.id));
      await Promise.all(targetItems.map((item) => updateMenuItem(item.id, { available: makeAvailable })));

      await safeLog({
        venueId,
        actorEmail: profile?.email,
        actorRole: profile?.role,
        action: makeAvailable ? "menu_items_bulk_available" : "menu_items_bulk_unavailable",
        tableNumber: null,
        details: `${makeAvailable ? "Marked available" : "Marked unavailable"}: ${targetItems
          .map((i) => i.name_en)
          .join(", ")}`,
      });

      clearSelection();
    } catch (err) {
      console.error("[ItemManager] Bulk availability update failed:", err);
    } finally {
      setBulkBusy(false);
    }
  };

  useEffect(() => {
    if (!venueId) return;
    const unsubCategories = subscribeToCategories(venueId, ({ data, error }) => {
      if (error) console.error("[ItemManager] subscribeToCategories error:", error);
      setCategories(data);
    });
    const unsubItems = subscribeToMenuItems(venueId, ({ data, error }) => {
      if (error) console.error("[ItemManager] subscribeToMenuItems error:", error);
      setError(!!error);
      setItems(error ? [] : data);
    });
    return () => {
      unsubCategories();
      unsubItems();
    };
  }, [venueId]);

  const categoryLookup = useMemo(() => {
    const map = {};
    (categories ?? []).forEach((c) => (map[c.id] = c));
    return map;
  }, [categories]);

  const openAddForm = () => {
    setFormMode("add");
    setFormData({ ...EMPTY_FORM, categoryId: categories?.[0]?.id ?? "" });
    setEditingId(null);
    setSaveError(null);
    setFormOpen(true);
  };

  const openEditForm = (item) => {
    setFormMode("edit");
    setFormData({
      categoryId: item.categoryId ?? "",
      name_en: item.name_en,
      name_mm: item.name_mm,
      description_en: item.description_en,
      description_mm: item.description_mm,
      price: String(item.price),
      imageUrl: item.imageUrl ?? "",
      available: item.available,
      sortOrder: item.sortOrder,
      modifierGroups: item.modifierGroups ?? [],
      isCombo: item.isCombo ?? false,
      comboItems: item.comboItems ?? [],
      isPromotional: item.isPromotional ?? false,
      isFeatured: item.isFeatured ?? false,
    });
    setEditingId(item.id);
    setSaveError(null);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name_en.trim()) {
      setSaveError("English name is required.");
      return;
    }
    if (!formData.categoryId) {
      setSaveError("Please select a category.");
      return;
    }
    const priceNum = Number(formData.price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      setSaveError("Price must be a valid number.");
      return;
    }
    if (formData.imageUrl && !isValidImageUrl(formData.imageUrl)) {
      setSaveError("Image URL must be a valid http(s) link, or leave it blank.");
      return;
    }
    for (const group of formData.modifierGroups) {
      if (!group.name_en.trim()) {
        setSaveError("Every modifier group needs a name.");
        return;
      }
      if (group.options.length === 0) {
        setSaveError(`"${group.name_en}" needs at least one option.`);
        return;
      }
    }
    if (formData.isCombo && formData.comboItems.length === 0) {
      setSaveError('Add at least one item to this combo, or uncheck "Is a combo".');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload = { ...formData, price: priceNum, imageUrl: formData.imageUrl || null };

      if (formMode === "add") {
        await createMenuItem(venueId, payload);
        await safeLog({
          venueId,
          actorEmail: profile?.email,
          actorRole: profile?.role,
          action: "menu_item_created",
          tableNumber: null,
          details: `Created "${payload.name_en}" — $${priceNum.toFixed(2)}`,
        });
      } else {
        const previousItem = items?.find((i) => i.id === editingId);
        await updateMenuItem(editingId, payload);

        if (previousItem && previousItem.price !== priceNum) {
          await safeLog({
            venueId,
            actorEmail: profile?.email,
            actorRole: profile?.role,
            action: "menu_item_price_changed",
            tableNumber: null,
            details: `"${payload.name_en}": $${previousItem.price.toFixed(2)} → $${priceNum.toFixed(2)}`,
          });
        } else {
          await safeLog({
            venueId,
            actorEmail: profile?.email,
            actorRole: profile?.role,
            action: "menu_item_updated",
            tableNumber: null,
            details: `Updated "${payload.name_en}"`,
          });
        }
      }

      setFormOpen(false);
    } catch (err) {
      console.error("[ItemManager] save failed:", err);
      setSaveError("Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const [undoTarget, setUndoTarget] = useState(null); // { id, name_en } | null

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMenuItem(deleteTarget.id);
      await safeLog({
        venueId,
        actorEmail: profile?.email,
        actorRole: profile?.role,
        action: "menu_item_deleted",
        tableNumber: null,
        details: `Deleted "${deleteTarget.name_en}"`,
      });
      // Show an undo toast rather than treating this as instantly final
      // — deleteMenuItem() is already a soft-delete, so "undo" is just
      // clearing deletedAt again within this grace window.
      setUndoTarget({ id: deleteTarget.id, name_en: deleteTarget.name_en });
      setDeleteTarget(null);
    } catch (err) {
      console.error("[ItemManager] delete failed:", err);
    } finally {
      setDeleting(false);
    }
  };

  const handleUndoDelete = async () => {
    if (!undoTarget) return;
    try {
      await restoreMenuItem(undoTarget.id);
      await safeLog({
        venueId,
        actorEmail: profile?.email,
        actorRole: profile?.role,
        action: "menu_item_updated",
        tableNumber: null,
        details: `Restored "${undoTarget.name_en}" after delete`,
      });
    } catch (err) {
      console.error("[ItemManager] restore failed:", err);
    } finally {
      setUndoTarget(null);
    }
  };

  const isLoading = items === null || categories === null;

  return (
    <div>
      <div style={styles.toolbar}>
        <p style={styles.count}>{isLoading ? "Loading…" : `${items.length} items`}</p>
        <button onClick={openAddForm} disabled={isLoading || categories.length === 0} style={styles.addBtn}>
          + Add Item
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div style={styles.bulkBar}>
          <span style={styles.bulkCount}>{selectedIds.size} selected</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => handleBulkSetAvailability(true)}
              disabled={bulkBusy}
              style={{ ...styles.bulkBtnAvailable, opacity: bulkBusy ? 0.6 : 1 }}
            >
              Mark Available
            </button>
            <button
              onClick={() => handleBulkSetAvailability(false)}
              disabled={bulkBusy}
              style={{ ...styles.bulkBtnUnavailable, opacity: bulkBusy ? 0.6 : 1 }}
            >
              Mark Unavailable
            </button>
            <button onClick={clearSelection} disabled={bulkBusy} style={styles.bulkBtnCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!isLoading && categories.length === 0 && (
        <div style={styles.warnBox}>
          <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.warning, margin: 0 }}>
            Create a category first before adding items.
          </p>
        </div>
      )}

      {error && (
        <div style={styles.errorBox}>
          <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.danger, margin: 0 }}>
            Could not load items.
          </p>
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div style={styles.emptyState}>
          <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.textMuted }}>No items yet.</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!isLoading &&
          items.map((item) => (
            <div key={item.id} style={{ ...styles.row, opacity: item.available ? 1 : 0.55 }}>
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggleSelected(item.id)}
                style={styles.rowCheckbox}
              />

              <div
                style={{
                  ...styles.thumb,
                  background: item.imageUrl ? `center / cover no-repeat url(${item.imageUrl})` : "rgba(255,255,255,0.04)",
                }}
              >
                {!item.imageUrl && <span style={{ fontSize: 18, opacity: 0.4 }}>🍽️</span>}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={styles.rowName}>
                  {item.name_en}
                  {!item.available && <span style={styles.unavailableTag}>UNAVAILABLE</span>}
                  {item.modifierGroups?.length > 0 && <span style={styles.modifierTag}>MODIFIERS</span>}
                  {item.isCombo && <span style={styles.comboTag}>COMBO</span>}
                  {item.isPromotional && <span style={styles.promoTag}>PROMO</span>}
                  {item.isFeatured && <span style={styles.featuredTag}>★ POPULAR</span>}
                </p>
                <p style={styles.rowSubname}>
                  {categoryLookup[item.categoryId]?.name_en ?? "No category"} · ${item.price.toFixed(2)}
                  {(item.updatedAt || item.createdAt) && (
                    <span style={styles.lastUpdated}>
                      {" "}
                      · updated {formatRelativeTime(item.updatedAt ?? item.createdAt)}
                    </span>
                  )}
                </p>
              </div>

              <button onClick={() => openEditForm(item)} style={styles.editBtn}>
                Edit
              </button>
              <button onClick={() => setDeleteTarget(item)} style={styles.deleteBtn}>
                Delete
              </button>
            </div>
          ))}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={formMode === "add" ? "Add Item" : "Edit Item"} maxWidth={620}>
        <Field label="Category">
          <select
            value={formData.categoryId}
            onChange={(e) => setFormData((f) => ({ ...f, categoryId: e.target.value }))}
            style={styles.select}
          >
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name_en}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Name (English)">
          <TextInput value={formData.name_en} onChange={(v) => setFormData((f) => ({ ...f, name_en: v }))} placeholder="Emerald Fizz" />
        </Field>
        <Field label="Name (Burmese)" hint="Optional">
          <TextInput value={formData.name_mm} onChange={(v) => setFormData((f) => ({ ...f, name_mm: v }))} placeholder="မြရောင်လှုပ်စစ်ကော်တေး" />
        </Field>

        <Field label="Description (English)" hint="Optional">
          <TextArea value={formData.description_en} onChange={(v) => setFormData((f) => ({ ...f, description_en: v }))} placeholder="Botanical gin, electric mint, sparkling lime." />
        </Field>
        <Field label="Description (Burmese)" hint="Optional">
          <TextArea value={formData.description_mm} onChange={(v) => setFormData((f) => ({ ...f, description_mm: v }))} />
        </Field>

        <Field label="Price (USD)" hint={formData.isCombo ? "This is the bundle price for the combo as a whole." : undefined}>
          <TextInput type="number" value={formData.price} onChange={(v) => setFormData((f) => ({ ...f, price: v }))} placeholder="18" />
        </Field>

        <Field label="Image URL" hint="Paste a hosted image link (Imgur, Google Drive public link, etc.) — leave blank for a placeholder icon">
          <TextInput value={formData.imageUrl} onChange={(v) => setFormData((f) => ({ ...f, imageUrl: v }))} placeholder="https://..." />
        </Field>

        <Field label="">
          <Checkbox
            checked={formData.available}
            onChange={(v) => setFormData((f) => ({ ...f, available: v }))}
            label="Available — customers can add this to their cart"
          />
        </Field>

        <Field label="">
          <Checkbox
            checked={formData.isPromotional}
            onChange={(v) => setFormData((f) => ({ ...f, isPromotional: v }))}
            label="Promotional — show under the Promotions tab on the customer menu"
          />
        </Field>

        <Field label="">
          <Checkbox
            checked={formData.isFeatured}
            onChange={(v) => setFormData((f) => ({ ...f, isFeatured: v }))}
            label="Featured — show under Most Popular on the customer menu"
          />
        </Field>

        <div style={styles.divider} />

        <Field label="Modifier Groups" hint="Sizes, add-ons, spice levels, or any other choices customers pick before ordering this item.">
          <ModifierGroupsEditor
            groups={formData.modifierGroups}
            onChange={(groups) => setFormData((f) => ({ ...f, modifierGroups: groups }))}
          />
        </Field>

        <div style={styles.divider} />

        <Field label="">
          <Checkbox
            checked={formData.isCombo}
            onChange={(v) => setFormData((f) => ({ ...f, isCombo: v }))}
            label="Is a combo — bundles other menu items together at this item's price"
          />
        </Field>

        {formData.isCombo && (
          <Field label="Combo Contents">
            <ComboItemsEditor
              comboItems={formData.comboItems}
              allItems={items ?? []}
              currentItemId={editingId}
              onChange={(comboItems) => setFormData((f) => ({ ...f, comboItems }))}
            />
          </Field>
        )}

        {saveError && <p style={styles.formError}>{saveError}</p>}

        <button onClick={handleSave} disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save Item"}
        </button>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirming={deleting}
        title="Delete Item"
        message={deleteTarget ? `Delete "${deleteTarget.name_en}"? You'll have a few seconds to undo right after.` : ""}
      />

      {undoTarget && (
        <UndoToast
          message={`Deleted "${undoTarget.name_en}"`}
          onUndo={handleUndoDelete}
          onExpire={() => setUndoTarget(null)}
        />
      )}
    </div>
  );
}

const styles = {
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  count: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
    margin: 0,
  },
  addBtn: {
    padding: "10px 18px",
    borderRadius: theme.radius.sm,
    border: "none",
    background: `linear-gradient(135deg, ${theme.color.accent} 0%, #00c87a 100%)`,
    color: theme.color.bg,
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
  },
  bulkBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 16px",
    background: theme.color.accentBg,
    border: `1px solid ${theme.color.accentBorder}`,
    borderRadius: theme.radius.md,
    marginBottom: 16,
  },
  bulkCount: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    color: theme.color.accent,
  },
  bulkBtnAvailable: {
    padding: "7px 14px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  bulkBtnUnavailable: {
    padding: "7px 14px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textSecondary,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  bulkBtnCancel: {
    padding: "7px 14px",
    borderRadius: theme.radius.sm,
    border: "none",
    background: "transparent",
    color: theme.color.textFaint,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  rowCheckbox: {
    width: 18,
    height: 18,
    accentColor: theme.color.accent,
    cursor: "pointer",
    flexShrink: 0,
  },
  warnBox: {
    padding: 16,
    background: theme.color.warningBg,
    border: `1px solid ${theme.color.warning}30`,
    borderRadius: theme.radius.md,
    marginBottom: 16,
  },
  errorBox: {
    padding: 16,
    background: theme.color.dangerBg,
    border: `1px solid ${theme.color.danger}30`,
    borderRadius: theme.radius.md,
    marginBottom: 16,
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.md,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: {
    margin: 0,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 14,
    color: theme.color.textPrimary,
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  unavailableTag: {
    fontSize: 9,
    fontWeight: 700,
    color: theme.color.danger,
    background: theme.color.dangerBg,
    border: `1px solid ${theme.color.danger}40`,
    borderRadius: 4,
    padding: "2px 6px",
    letterSpacing: "0.03em",
  },
  modifierTag: {
    fontSize: 9,
    fontWeight: 700,
    color: theme.color.textSecondary,
    background: "rgba(255,255,255,0.06)",
    border: `1px solid ${theme.color.border}`,
    borderRadius: 4,
    padding: "2px 6px",
    letterSpacing: "0.03em",
  },
  comboTag: {
    fontSize: 9,
    fontWeight: 700,
    color: theme.color.info,
    background: theme.color.infoBg,
    border: `1px solid ${theme.color.info}40`,
    borderRadius: 4,
    padding: "2px 6px",
    letterSpacing: "0.03em",
  },
  promoTag: {
    fontSize: 9,
    fontWeight: 700,
    color: theme.color.warning,
    background: theme.color.warningBg,
    border: `1px solid ${theme.color.warning}40`,
    borderRadius: 4,
    padding: "2px 6px",
    letterSpacing: "0.03em",
  },
  featuredTag: {
    fontSize: 9,
    fontWeight: 700,
    color: theme.color.accent,
    background: theme.color.accentBg,
    border: `1px solid ${theme.color.accentBorder}`,
    borderRadius: 4,
    padding: "2px 6px",
    letterSpacing: "0.03em",
  },
  rowSubname: {
    margin: "2px 0 0",
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textMuted,
  },
  lastUpdated: {
    color: theme.color.textFaint,
  },
  editBtn: {
    padding: "7px 14px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
  },
  deleteBtn: {
    padding: "7px 14px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.02)",
    color: theme.color.textMuted,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    flexShrink: 0,
  },
  select: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textPrimary,
    fontFamily: theme.font.body,
    fontSize: 14,
    outline: "none",
  },
  divider: {
    height: 1,
    background: theme.color.border,
    margin: "18px 0",
  },
  formError: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.danger,
    margin: "0 0 14px",
  },
  saveBtn: {
    width: "100%",
    padding: "13px",
    borderRadius: theme.radius.sm,
    border: "none",
    background: `linear-gradient(135deg, ${theme.color.accent} 0%, #00c87a 100%)`,
    color: theme.color.bg,
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
  },
};
