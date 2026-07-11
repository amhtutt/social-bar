"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/admin/StaffManager.jsx  —  Admin: create Staff/Kitchen accounts
//
// Lets a restaurant's Admin onboard their own staff without needing the
// platform owner to create accounts manually in the Firebase console.
// Uses userService.createStaffAccount(), which signs the new account up
// via a secondary, temporary Firebase Auth app instance so creating staff
// doesn't log the Admin out of their own session.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createStaffAccount, subscribeToVenueStaff } from "@/lib/userService";
import { theme } from "@/lib/theme";
import Modal from "./Modal";
import { Field, TextInput } from "./FormField";

const EMPTY_FORM = { email: "", password: "", role: "staff" };

export default function StaffManager() {
  const { venueId } = useAuth();
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [justCreated, setJustCreated] = useState(null);

  useEffect(() => {
    if (!venueId) return;
    const unsub = subscribeToVenueStaff(venueId, ({ data, error }) => {
      setError(!!error);
      setStaff(error ? [] : data);
    });
    return () => unsub();
  }, [venueId]);

  const openAddForm = () => {
    setFormData(EMPTY_FORM);
    setSaveError(null);
    setJustCreated(null);
    setFormOpen(true);
  };

  const handleCreate = async () => {
    if (!formData.email.trim() || !formData.password.trim()) {
      setSaveError("Email and password are required.");
      return;
    }
    if (formData.password.length < 6) {
      setSaveError("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await createStaffAccount({
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
        venueId,
      });
      setJustCreated(formData.email);
      setFormData(EMPTY_FORM);
    } catch (err) {
      console.error("[StaffManager] create failed:", err);
      setSaveError(err.message?.replace("Firebase: ", "") ?? "Could not create account.");
    } finally {
      setSaving(false);
    }
  };

  const isLoading = staff === null;

  return (
    <div>
      <div style={styles.toolbar}>
        <p style={styles.count}>{isLoading ? "Loading…" : `${staff.length} staff accounts`}</p>
        <button onClick={openAddForm} style={styles.addBtn}>
          + Add Staff
        </button>
      </div>

      <p style={styles.hint}>
        Staff accounts can manage orders and bills, but cannot edit the menu. Only Admin accounts have menu access.
      </p>

      {error && (
        <div style={styles.errorBox}>
          <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.danger, margin: 0 }}>
            Could not load staff accounts.
          </p>
        </div>
      )}

      {!isLoading && !error && staff.length === 0 && (
        <div style={styles.emptyState}>
          <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.textMuted }}>
            No staff accounts yet. Add a Staff or Kitchen account to get started.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!isLoading &&
          staff.map((member) => (
            <div key={member.uid} style={styles.row}>
              <span style={styles.roleBadge(member.role)}>{member.role.toUpperCase()}</span>
              <span style={styles.email}>{member.email}</span>
            </div>
          ))}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Add Staff Account">
        {justCreated && (
          <div style={styles.successBox}>
            <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.accent, margin: 0 }}>
              Account created for {justCreated}. Share the email and password with them directly — there is no
              automated invite email yet.
            </p>
          </div>
        )}

        <Field label="Role">
          <div style={{ display: "flex", gap: 8 }}>
            {["staff", "kitchen"].map((r) => (
              <button
                key={r}
                onClick={() => setFormData((f) => ({ ...f, role: r }))}
                style={{
                  ...styles.roleOption,
                  ...(formData.role === r ? styles.roleOptionActive : {}),
                }}
              >
                {r === "staff" ? "Staff" : "Kitchen"}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Email">
          <TextInput
            type="email"
            value={formData.email}
            onChange={(v) => setFormData((f) => ({ ...f, email: v }))}
            placeholder="staffmember@example.com"
          />
        </Field>

        <Field label="Temporary Password" hint="At least 6 characters. Share this with the staff member directly.">
          <TextInput
            type="text"
            value={formData.password}
            onChange={(v) => setFormData((f) => ({ ...f, password: v }))}
            placeholder="e.g. a random word plus numbers"
          />
        </Field>

        {saveError && <p style={styles.formError}>{saveError}</p>}

        <button onClick={handleCreate} disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Creating…" : "Create Account"}
        </button>
      </Modal>
    </div>
  );
}

const styles = {
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  count: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
    margin: 0,
  },
  hint: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textFaint,
    margin: "0 0 16px",
    lineHeight: 1.6,
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
  roleBadge: (role) => {
    const colorMap = {
      staff: theme.color.warning,
      kitchen: theme.color.info,
    };
    const bgMap = {
      staff: theme.color.warningBg,
      kitchen: theme.color.infoBg,
    };
    return {
      fontFamily: theme.font.display,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.05em",
      padding: "4px 9px",
      borderRadius: 6,
      color: colorMap[role] ?? theme.color.accent,
      background: bgMap[role] ?? theme.color.accentBg,
      flexShrink: 0,
    };
  },
  email: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textPrimary,
  },
  successBox: {
    padding: 14,
    background: theme.color.accentBg,
    border: `1px solid ${theme.color.accentBorder}`,
    borderRadius: theme.radius.sm,
    marginBottom: 16,
  },
  roleOption: {
    flex: 1,
    padding: "10px",
    borderRadius: theme.radius.sm,
    border: `1.5px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.02)",
    color: theme.color.textMuted,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  roleOptionActive: {
    border: `1.5px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
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
