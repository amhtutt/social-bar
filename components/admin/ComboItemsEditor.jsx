"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/admin/ComboItemsEditor.jsx  —  Combo bundle builder
//
// Lets admin pick from EXISTING menu items and a quantity each, building
// the comboItems array on a combo item. Stores a name_en snapshot per
// entry so the combo listing still reads correctly even if the
// referenced item is later renamed.
// ─────────────────────────────────────────────────────────────────────────────

import { theme } from "@/lib/theme";

export default function ComboItemsEditor({ comboItems, allItems, currentItemId, onChange }) {
  const selectableItems = allItems.filter((i) => i.id !== currentItemId && !i.isCombo);

  const addComboItem = (itemId) => {
    const item = allItems.find((i) => i.id === itemId);
    if (!item) return;
    if (comboItems.some((c) => c.itemId === itemId)) return;
    onChange([...comboItems, { itemId, name_en: item.name_en, quantity: 1 }]);
  };

  const updateQuantity = (itemId, quantity) => {
    onChange(comboItems.map((c) => (c.itemId === itemId ? { ...c, quantity: Math.max(1, quantity) } : c)));
  };

  const removeComboItem = (itemId) => {
    onChange(comboItems.filter((c) => c.itemId !== itemId));
  };

  return (
    <div>
      {comboItems.length === 0 && (
        <p style={styles.emptyHint}>No items added yet. Pick from the menu below to build this combo.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {comboItems.map((c) => (
          <div key={c.itemId} style={styles.comboRow}>
            <span style={styles.comboName}>{c.name_en}</span>
            <input
              type="number"
              min={1}
              value={c.quantity}
              onChange={(e) => updateQuantity(c.itemId, Number(e.target.value) || 1)}
              style={styles.qtyInput}
            />
            <button onClick={() => removeComboItem(c.itemId)} style={styles.removeBtn}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <select
        value=""
        onChange={(e) => {
          if (e.target.value) addComboItem(e.target.value);
        }}
        style={styles.addSelect}
      >
        <option value="">+ Add item to combo…</option>
        {selectableItems.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name_en} (${item.price.toFixed(2)})
          </option>
        ))}
      </select>
    </div>
  );
}

const styles = {
  emptyHint: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textFaint,
    lineHeight: 1.6,
    marginBottom: 10,
  },
  comboRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.sm,
  },
  comboName: {
    flex: 1,
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textSecondary,
  },
  qtyInput: {
    width: 56,
    padding: "6px 8px",
    borderRadius: 6,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textPrimary,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    textAlign: "center",
    outline: "none",
  },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.02)",
    color: theme.color.textFaint,
    fontSize: 10,
    cursor: "pointer",
    flexShrink: 0,
  },
  addSelect: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: theme.radius.sm,
    border: `1.5px dashed ${theme.color.border}`,
    background: "transparent",
    color: theme.color.textMuted,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    outline: "none",
  },
};
