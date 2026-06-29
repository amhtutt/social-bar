"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/admin/CategoryManager.jsx  —  Admin: manage categories
//
// List of all categories with Edit/Delete, plus an "Add Category" button.
// Add/Edit uses the same modal form (formMode tracks "add" vs "edit").
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import {
  subscribeToCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  restoreCategory,
} from "@/lib/menuService";
import { useAuth } from "@/lib/AuthContext";
import { theme } from "@/lib/theme";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { Field, TextInput, Checkbox } from "./FormField";
import UndoToast from "@/components/UndoToast";

const EMPTY_FORM = { name_en: "", name_mm: "", icon: "🍽️", sortOrder: 0, isFeaturedCategory: false };

export default function CategoryManager() {
  const { venueId } = useAuth();
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("add");
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    const unsub = subscribeToCategories(venueId, ({ data, error }) => {
      if (error) console.error("[CategoryManager] subscribeToCategories error:", error);
      setError(!!error);
      setCategories(error ? [] : data);
    });
    return () => unsub();
  }, [venueId]);

  const openAddForm = () => {
    setFormMode("add");
    setFormData({ ...EMPTY_FORM, sortOrder: (categories?.length ?? 0) + 1 });
    setEditingId(null);
    setSaveError(null);
    setFormOpen(true);
  };

  const openEditForm = (category) => {
    setFormMode("edit");
    setFormData({
      name_en: category.name_en,
      name_mm: category.name_mm,
      icon: category.icon,
      sortOrder: category.sortOrder,
      isFeaturedCategory: category.isFeaturedCategory ?? false,
    });
    setEditingId(category.id);
    setSaveError(null);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name_en.trim()) {
      setSaveError("English name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (formMode === "add") {
        await createCategory(venueId, formData);
      } else {
        await updateCategory(editingId, formData);
      }
      setFormOpen(false);
    } catch (err) {
      console.error("[CategoryManager] save failed:", err);
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
      await deleteCategory(deleteTarget.id);
      setUndoTarget({ id: deleteTarget.id, name_en: deleteTarget.name_en });
      setDeleteTarget(null);
    } catch (err) {
      console.error("[CategoryManager] delete failed:", err);
    } finally {
      setDeleting(false);
    }
  };

  const handleUndoDelete = async () => {
    if (!undoTarget) return;
    try {
      await restoreCategory(undoTarget.id);
    } catch (err) {
      console.error("[CategoryManager] restore failed:", err);
    } finally {
      setUndoTarget(null);
    }
  };

  const isLoading = categories === null;

  return (
    <div>
      <div style={styles.toolbar}>
        <p style={styles.count}>{isLoading ? "Loading…" : `${categories.length} categories`}</p>
        <button onClick={openAddForm} style={styles.addBtn}>
          + Add Category
        </button>
      </div>

      {error && (
        <div style={styles.errorBox}>
          <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.danger, margin: 0 }}>
            Could not load categories.
          </p>
        </div>
      )}

      {!isLoading && !error && categories.length === 0 && (
        <div style={styles.emptyState}>
          <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.textMuted }}>
            No categories yet. Add one to get started.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!isLoading &&
          categories.map((cat) => (
            <div key={cat.id} style={styles.row}>
              <span style={styles.rowIcon}>{cat.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={styles.rowName}>{cat.name_en}</p>
                {cat.name_mm && <p style={styles.rowSubname}>{cat.name_mm}</p>}
              </div>
              <span style={styles.sortBadge}>#{cat.sortOrder}</span>
              <button onClick={() => openEditForm(cat)} style={styles.editBtn}>
                Edit
              </button>
              <button onClick={() => setDeleteTarget(cat)} style={styles.deleteBtn}>
                Delete
              </button>
            </div>
          ))}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={formMode === "add" ? "Add Category" : "Edit Category"}>
        <Field label="Name (English)">
          <TextInput value={formData.name_en} onChange={(v) => setFormData((f) => ({ ...f, name_en: v }))} placeholder="Cocktails" />
        </Field>
        <Field label="Name (Burmese)" hint="Optional — shown when customer switches to MM">
          <TextInput value={formData.name_mm} onChange={(v) => setFormData((f) => ({ ...f, name_mm: v }))} placeholder="ကော်တေးများ" />
        </Field>
        <Field label="Icon" hint="Any single emoji, e.g. cocktail glass, shrimp, plate">
          <TextInput value={formData.icon} onChange={(v) => setFormData((f) => ({ ...f, icon: v }))} placeholder="🍽️" />
        </Field>
        <Field label="Sort Order" hint="Lower numbers appear first in the customer's category list">
          <TextInput
            type="number"
            value={formData.sortOrder}
            onChange={(v) => setFormData((f) => ({ ...f, sortOrder: Number(v) || 0 }))}
          />
        </Field>

        <Field label="">
          <Checkbox
            checked={formData.isFeaturedCategory}
            onChange={(v) => setFormData((f) => ({ ...f, isFeaturedCategory: v }))}
            label="Pin to top — shown before other categories on the customer menu"
          />
        </Field>

        {saveError && <p style={styles.formError}>{saveError}</p>}

        <button onClick={handleSave} disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save Category"}
        </button>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirming={deleting}
        title="Delete Category"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name_en}"? Items already assigned to this category will remain, but won't be reachable from the customer menu until reassigned.`
            : ""
        }
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
    padding: "12px 16px",
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.md,
  },
  rowIcon: {
    fontSize: 22,
    flexShrink: 0,
  },
  rowName: {
    margin: 0,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 14,
    color: theme.color.textPrimary,
  },
  rowSubname: {
    margin: "2px 0 0",
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textMuted,
  },
  sortBadge: {
    fontFamily: theme.font.display,
    fontSize: 11,
    color: theme.color.textFaint,
    flexShrink: 0,
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
