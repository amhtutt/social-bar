"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/admin/FormField.jsx  —  Shared input building blocks
//
// Small consistent text input / textarea / checkbox wrappers used by both
// CategoryManager and ItemManager forms.
// ─────────────────────────────────────────────────────────────────────────────

import { theme } from "@/lib/theme";

export function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={styles.label}>{label}</label>
      {children}
      {hint && <p style={styles.hint}>{hint}</p>}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={styles.input}
    />
  );
}

export function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ ...styles.input, resize: "vertical", fontFamily: theme.font.body }}
    />
  );
}

export function Checkbox({ checked, onChange, label }) {
  return (
    <label style={styles.checkboxRow}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={styles.checkbox} />
      <span style={styles.checkboxLabel}>{label}</span>
    </label>
  );
}

const styles = {
  label: {
    display: "block",
    fontFamily: theme.font.display,
    fontSize: 11,
    fontWeight: 700,
    color: theme.color.textMuted,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  hint: {
    margin: "5px 0 0",
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textFaint,
  },
  input: {
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
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
  },
  checkbox: {
    width: 18,
    height: 18,
    accentColor: theme.color.accent,
    cursor: "pointer",
  },
  checkboxLabel: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textSecondary,
  },
};
