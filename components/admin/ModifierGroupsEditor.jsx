"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/admin/ModifierGroupsEditor.jsx  —  Nested editor for item modifiers
//
// Lets admin build the modifierGroups array on a menu item: add/remove
// groups (e.g. "Size", "Add-ons"), toggle required + single/multiple per
// group, and add/remove options with a price delta each.
//
// Pure controlled component — receives groups and calls onChange with the
// updated array. No Firestore calls happen here; ItemManager owns the save.
// ─────────────────────────────────────────────────────────────────────────────

import { createEmptyModifierGroup, createEmptyModifierOption } from "@/lib/menuService";
import { theme } from "@/lib/theme";

export default function ModifierGroupsEditor({ groups, onChange }) {
  const addGroup = () => {
    onChange([...groups, createEmptyModifierGroup()]);
  };

  const updateGroup = (groupId, fields) => {
    onChange(groups.map((g) => (g.id === groupId ? { ...g, ...fields } : g)));
  };

  const removeGroup = (groupId) => {
    onChange(groups.filter((g) => g.id !== groupId));
  };

  const addOption = (groupId) => {
    onChange(groups.map((g) => (g.id === groupId ? { ...g, options: [...g.options, createEmptyModifierOption()] } : g)));
  };

  const updateOption = (groupId, optionId, fields) => {
    onChange(
      groups.map((g) =>
        g.id === groupId ? { ...g, options: g.options.map((o) => (o.id === optionId ? { ...o, ...fields } : o)) } : g
      )
    );
  };

  const removeOption = (groupId, optionId) => {
    onChange(groups.map((g) => (g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g)));
  };

  return (
    <div>
      {groups.length === 0 && (
        <p style={styles.emptyHint}>
          No modifier groups yet. Add one if this item has size options, add-ons, or other choices customers should
          pick before ordering.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {groups.map((group) => (
          <div key={group.id} style={styles.groupCard}>
            <div style={styles.groupTopRow}>
              <input
                type="text"
                value={group.name_en}
                onChange={(e) => updateGroup(group.id, { name_en: e.target.value })}
                placeholder="Group name, e.g. Size"
                style={styles.groupNameInput}
              />
              <button onClick={() => removeGroup(group.id)} style={styles.removeGroupBtn}>
                Remove
              </button>
            </div>

            <input
              type="text"
              value={group.name_mm}
              onChange={(e) => updateGroup(group.id, { name_mm: e.target.value })}
              placeholder="Burmese name (optional)"
              style={styles.groupNameMmInput}
            />

            <div style={styles.groupSettingsRow}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={group.required}
                  onChange={(e) => updateGroup(group.id, { required: e.target.checked })}
                />
                Required
              </label>

              <select
                value={group.selectionType}
                onChange={(e) => updateGroup(group.id, { selectionType: e.target.value })}
                style={styles.selectionTypeSelect}
              >
                <option value="single">Single choice (radio)</option>
                <option value="multiple">Multiple choice (checkbox)</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {group.options.map((opt) => (
                <div key={opt.id} style={styles.optionRow}>
                  <input
                    type="text"
                    value={opt.name_en}
                    onChange={(e) => updateOption(group.id, opt.id, { name_en: e.target.value })}
                    placeholder="Option name"
                    style={styles.optionNameInput}
                  />
                  <input
                    type="number"
                    value={opt.priceDelta}
                    onChange={(e) => updateOption(group.id, opt.id, { priceDelta: Number(e.target.value) || 0 })}
                    placeholder="+0.00"
                    step="0.01"
                    style={styles.optionPriceInput}
                  />
                  <button onClick={() => removeOption(group.id, opt.id)} style={styles.removeOptionBtn}>
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button onClick={() => addOption(group.id)} style={styles.addOptionBtn}>
              + Add Option
            </button>
          </div>
        ))}
      </div>

      <button onClick={addGroup} style={styles.addGroupBtn}>
        + Add Modifier Group
      </button>
    </div>
  );
}

const styles = {
  emptyHint: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textFaint,
    lineHeight: 1.6,
    marginBottom: 12,
  },
  groupCard: {
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.sm,
    padding: 14,
  },
  groupTopRow: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
  },
  groupNameInput: {
    flex: 1,
    padding: "9px 12px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textPrimary,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    outline: "none",
  },
  groupNameMmInput: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.02)",
    color: theme.color.textSecondary,
    fontFamily: theme.font.body,
    fontSize: 12,
    outline: "none",
    marginBottom: 10,
  },
  removeGroupBtn: {
    padding: "8px 12px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.danger}40`,
    background: theme.color.dangerBg,
    color: theme.color.danger,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
    flexShrink: 0,
  },
  groupSettingsRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textSecondary,
    cursor: "pointer",
  },
  selectionTypeSelect: {
    padding: "6px 10px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textSecondary,
    fontFamily: theme.font.body,
    fontSize: 12,
    outline: "none",
  },
  optionRow: {
    display: "flex",
    gap: 6,
    alignItems: "center",
  },
  optionNameInput: {
    flex: 1,
    padding: "8px 10px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textPrimary,
    fontFamily: theme.font.body,
    fontSize: 12,
    outline: "none",
  },
  optionPriceInput: {
    width: 80,
    padding: "8px 10px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.accent,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    outline: "none",
  },
  removeOptionBtn: {
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.02)",
    color: theme.color.textFaint,
    fontSize: 11,
    cursor: "pointer",
  },
  addOptionBtn: {
    marginTop: 8,
    padding: "7px 12px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
  },
  addGroupBtn: {
    marginTop: 12,
    width: "100%",
    padding: "10px",
    borderRadius: theme.radius.sm,
    border: `1.5px dashed ${theme.color.border}`,
    background: "transparent",
    color: theme.color.textMuted,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
};
