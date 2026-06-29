"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/admin/PricingSettings.jsx  —  Admin: tax / service charge config
//
// Lets Admin set the venue's tax rate, service charge rate, and whether
// menu prices already include tax (tax-inclusive pricing). Writes
// directly to venues/{venueId}.config.pricing via updateDoc.
//
// No tipping fields exist here or anywhere — tips are cash, handled
// directly between customer and server.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeToVenueConfig } from "@/lib/venueConfig";
import { useAuth } from "@/lib/AuthContext";
import { theme } from "@/lib/theme";
import { Field, TextInput, Checkbox } from "./FormField";

export default function PricingSettings() {
  const { venueId } = useAuth();
  const [pricing, setPricing] = useState(null);
  const [taxRateInput, setTaxRateInput] = useState("0");
  const [serviceRateInput, setServiceRateInput] = useState("0");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [staffPinInput, setStaffPinInput] = useState("0000");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedRecently, setSavedRecently] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    const unsub = subscribeToVenueConfig(venueId, ({ pricing, staffPin }) => {
      setPricing(pricing);
      setTaxRateInput(String(pricing.taxRatePercent ?? 0));
      setServiceRateInput(String(pricing.serviceChargeRatePercent ?? 0));
      setTaxInclusive(pricing.taxInclusive ?? false);
      setStaffPinInput(staffPin ?? "0000");
    });
    return () => unsub();
  }, [venueId]);

  const handleSave = async () => {
    const taxRatePercent = Number(taxRateInput);
    const serviceChargeRatePercent = Number(serviceRateInput);

    if (Number.isNaN(taxRatePercent) || taxRatePercent < 0) {
      setSaveError("Tax rate must be a number 0 or higher.");
      return;
    }
    if (Number.isNaN(serviceChargeRatePercent) || serviceChargeRatePercent < 0) {
      setSaveError("Service charge rate must be a number 0 or higher.");
      return;
    }
    if (!staffPinInput.trim()) {
      setSaveError("Staff PIN cannot be blank.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await updateDoc(doc(db, "venues", venueId), {
        "config.pricing": { taxRatePercent, serviceChargeRatePercent, taxInclusive },
        "config.staffPin": staffPinInput.trim(),
      });
      setSavedRecently(true);
      setTimeout(() => setSavedRecently(false), 2500);
    } catch (err) {
      console.error("[PricingSettings] save failed:", err);
      setSaveError("Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (pricing === null) {
    return <p style={{ fontFamily: theme.font.body, fontSize: 13, color: theme.color.textMuted }}>Loading…</p>;
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <p style={styles.intro}>
        These rates apply to every order placed at this venue going forward. Past orders keep the rate that was in
        effect when they were placed, so changing this never alters historical bills. There is no tipping field
        anywhere in this app — tips are handled directly between customers and staff, in cash.
      </p>

      <Field label="Tax Rate" hint="As a percentage, e.g. 5 for 5%. Use 0 if tax doesn't apply.">
        <div style={styles.percentRow}>
          <TextInput type="number" value={taxRateInput} onChange={setTaxRateInput} placeholder="0" />
          <span style={styles.percentSign}>%</span>
        </div>
      </Field>

      <Field label="Service Charge Rate" hint="As a percentage, e.g. 10 for 10%. Use 0 if there's no service charge.">
        <div style={styles.percentRow}>
          <TextInput type="number" value={serviceRateInput} onChange={setServiceRateInput} placeholder="0" />
          <span style={styles.percentSign}>%</span>
        </div>
      </Field>

      <Field
        label=""
        hint="If checked, the prices shown on the menu already include tax — the bill will show tax as a breakdown line for transparency, but won't add it on top of the subtotal."
      >
        <Checkbox checked={taxInclusive} onChange={setTaxInclusive} label="Menu prices already include tax" />
      </Field>

      <div style={styles.divider} />

      <Field label="Staff PIN" hint="A simple shared PIN staff use on any tablet to view table status and reset a tablet's setup. Not tied to individual staff accounts.">
        <TextInput value={staffPinInput} onChange={setStaffPinInput} placeholder="0000" />
      </Field>

      {saveError && <p style={styles.errorText}>{saveError}</p>}
      {savedRecently && <p style={styles.successText}>Saved.</p>}

      <button onClick={handleSave} disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}>
        {saving ? "Saving…" : "Save Pricing"}
      </button>
    </div>
  );
}

const styles = {
  intro: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textMuted,
    lineHeight: 1.7,
    marginBottom: 22,
  },
  percentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  percentSign: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 16,
    color: theme.color.textMuted,
  },
  divider: {
    height: 1,
    background: theme.color.border,
    margin: "20px 0",
  },
  errorText: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.danger,
    margin: "0 0 14px",
  },
  successText: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.accent,
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
