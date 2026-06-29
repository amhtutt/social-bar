"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/ItemCustomizationModal.jsx  —  Modifier + special instructions picker
//
// Opens when an item has modifierGroups (size, add-ons, etc.) — items
// without any modifier groups skip this entirely and add straight to
// cart, so simple bar items stay one tap.
//
// Validates required groups before allowing "Add to Cart". Computes the
// running unit price live as the customer picks options.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { theme } from "@/lib/theme";

export default function ItemCustomizationModal({ item, lang, onClose, onConfirm }) {
  const [selections, setSelections] = useState({});
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [validationError, setValidationError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const name = lang === "mm" && item.name_mm ? item.name_mm : item.name_en;

  const toggleSingle = (groupId, optionId) => {
    setSelections((prev) => ({ ...prev, [groupId]: optionId }));
    setValidationError(null);
  };

  const toggleMultiple = (groupId, optionId) => {
    setSelections((prev) => {
      const current = prev[groupId] instanceof Set ? new Set(prev[groupId]) : new Set();
      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        current.add(optionId);
      }
      return { ...prev, [groupId]: current };
    });
  };

  const selectedModifiers = useMemo(() => {
    const result = [];
    for (const group of item.modifierGroups) {
      const sel = selections[group.id];
      if (!sel) continue;

      const optionIds = group.selectionType === "multiple" ? Array.from(sel) : [sel];
      for (const optId of optionIds) {
        const opt = group.options.find((o) => o.id === optId);
        if (!opt) continue;
        result.push({
          groupId: group.id,
          groupName_en: group.name_en,
          optionId: opt.id,
          optionName_en: opt.name_en,
          optionName_mm: opt.name_mm,
          priceDelta: opt.priceDelta ?? 0,
        });
      }
    }
    return result;
  }, [selections, item.modifierGroups]);

  const unitPrice = item.price + selectedModifiers.reduce((sum, m) => sum + m.priceDelta, 0);

  const handleConfirm = () => {
    for (const group of item.modifierGroups) {
      if (!group.required) continue;
      const sel = selections[group.id];
      const isAnswered = group.selectionType === "multiple" ? sel instanceof Set && sel.size > 0 : !!sel;
      if (!isAnswered) {
        const groupName = lang === "mm" && group.name_mm ? group.name_mm : group.name_en;
        setValidationError(`Please choose ${groupName.toLowerCase()}.`);
        return;
      }
    }

    // onConfirm() itself is synchronous (a local cart update, not a
    // network call) — but closing the modal instantly gave no visible
    // sign the tap registered, especially after scrolling through
    // several modifier groups. This brief "Added" state gives that
    // feedback before the modal actually closes.
    setConfirming(true);
    onConfirm({
      itemId: item.id,
      name_en: item.name_en,
      name_mm: item.name_mm,
      basePrice: item.price,
      selectedModifiers,
      specialInstructions,
      quantity,
    });
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={styles.title}>{name}</h2>
            {item.description_en && (
              <p style={styles.description}>
                {lang === "mm" && item.description_mm ? item.description_mm : item.description_en}
              </p>
            )}
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            ✕
          </button>
        </div>

        <div style={styles.body}>
          {item.modifierGroups.map((group) => {
            const groupName = lang === "mm" && group.name_mm ? group.name_mm : group.name_en;
            return (
              <div key={group.id} style={styles.group}>
                <div style={styles.groupHeader}>
                  <span style={styles.groupName}>{groupName}</span>
                  {group.required && <span style={styles.requiredTag}>Required</span>}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {group.options.map((opt) => {
                    const optName = lang === "mm" && opt.name_mm ? opt.name_mm : opt.name_en;
                    const isSelected =
                      group.selectionType === "multiple"
                        ? selections[group.id] instanceof Set && selections[group.id].has(opt.id)
                        : selections[group.id] === opt.id;
                    const isRadio = group.selectionType === "single";

                    return (
                      <button
                        key={opt.id}
                        onClick={() =>
                          group.selectionType === "multiple"
                            ? toggleMultiple(group.id, opt.id)
                            : toggleSingle(group.id, opt.id)
                        }
                        style={{ ...styles.optionRow, ...(isSelected ? styles.optionRowSelected : {}) }}
                      >
                        <span
                          style={{
                            ...styles.optionCheck,
                            ...(isRadio ? styles.optionCheckRadio : {}),
                            ...(isSelected ? styles.optionCheckSelected : {}),
                          }}
                        >
                          {isSelected && (isRadio ? <span style={styles.radioDot} /> : "✓")}
                        </span>
                        <span style={styles.optionName}>{optName}</span>
                        <span style={{ ...styles.optionPrice, ...(opt.priceDelta === 0 ? styles.optionPriceFree : {}) }}>
                          {opt.priceDelta === 0 ? "Free" : `${opt.priceDelta > 0 ? "+" : ""}$${opt.priceDelta.toFixed(2)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div style={styles.group}>
            <div style={styles.groupHeader}>
              <span style={styles.groupName}>Special instructions</span>
              <span style={styles.optionalTag}>Optional</span>
            </div>
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="e.g. no ice, allergic to peanuts, extra spicy"
              rows={2}
              style={styles.textarea}
            />
          </div>

          {validationError && <p style={styles.errorText}>{validationError}</p>}
        </div>

        <div style={styles.footer}>
          <div style={styles.qtyRow}>
            <span style={styles.qtyLabel}>Quantity</span>
            <div style={styles.qtyControls}>
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={confirming} style={styles.qtyBtn}>
                −
              </button>
              <span style={styles.qtyValue}>{quantity}</span>
              <button onClick={() => setQuantity((q) => q + 1)} disabled={confirming} style={styles.qtyBtn}>
                +
              </button>
            </div>
          </div>

          <button
            onClick={handleConfirm}
            disabled={confirming}
            style={{ ...styles.confirmBtn, ...(confirming ? styles.confirmBtnConfirming : {}) }}
          >
            {confirming ? "✓ Added" : `Add to Cart · $${(unitPrice * quantity).toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 150,
    animation: "fadeUp 0.2s ease both",
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "85vh",
    background: "#13161c",
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    border: `1px solid ${theme.color.border}`,
    borderBottom: "none",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "20px 20px 16px",
    borderBottom: `1px solid ${theme.color.border}`,
  },
  title: {
    margin: 0,
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 19,
    color: theme.color.textPrimary,
  },
  description: {
    margin: "4px 0 0",
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textMuted,
    lineHeight: 1.5,
  },
  closeBtn: {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 8,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textSecondary,
    fontSize: 13,
    cursor: "pointer",
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 20px",
  },
  group: {
    marginBottom: 22,
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  groupName: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 14,
    color: theme.color.textPrimary,
  },
  requiredTag: {
    fontFamily: theme.font.display,
    fontSize: 10,
    fontWeight: 700,
    color: theme.color.warning,
    background: theme.color.warningBg,
    border: `1px solid ${theme.color.warning}40`,
    borderRadius: 5,
    padding: "2px 7px",
    letterSpacing: "0.03em",
  },
  optionalTag: {
    fontFamily: theme.font.display,
    fontSize: 10,
    fontWeight: 700,
    color: theme.color.textFaint,
    letterSpacing: "0.03em",
  },
  optionRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: theme.radius.sm,
    border: `1.5px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.02)",
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
    transition: "all 0.15s ease",
  },
  optionRowSelected: {
    border: `1.5px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
  },
  optionCheck: {
    width: 20,
    height: 20,
    flexShrink: 0,
    borderRadius: 6,
    border: `2px solid ${theme.color.borderStrong}`,
    background: "rgba(255,255,255,0.04)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 800,
    color: theme.color.bg,
    transition: "all 0.15s ease",
  },
  optionCheckRadio: {
    borderRadius: "50%",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: theme.color.bg,
  },
  optionCheckSelected: {
    border: `2px solid ${theme.color.accent}`,
    background: theme.color.accent,
    boxShadow: `0 0 0 3px ${theme.color.accentBg}`,
  },
  optionName: {
    flex: 1,
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textSecondary,
  },
  optionPrice: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    color: theme.color.accent,
    flexShrink: 0,
  },
  optionPriceFree: {
    color: theme.color.textFaint,
    fontWeight: 600,
  },
  textarea: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textPrimary,
    fontFamily: theme.font.body,
    fontSize: 13,
    resize: "vertical",
    outline: "none",
  },
  errorText: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.danger,
    margin: 0,
  },
  footer: {
    padding: "16px 20px 20px",
    borderTop: `1px solid ${theme.color.border}`,
  },
  qtyRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  qtyLabel: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 13,
    color: theme.color.textMuted,
  },
  qtyControls: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
    fontSize: 17,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
  },
  qtyValue: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 16,
    color: theme.color.textPrimary,
    minWidth: 20,
    textAlign: "center",
  },
  confirmBtn: {
    width: "100%",
    padding: "16px",
    borderRadius: theme.radius.md,
    border: "none",
    background: `linear-gradient(135deg, ${theme.color.accent} 0%, #00c87a 100%)`,
    color: theme.color.bg,
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(0,255,170,0.25)",
    transition: "all 0.15s ease",
  },
  confirmBtnConfirming: {
    opacity: 0.85,
    cursor: "default",
  },
};
