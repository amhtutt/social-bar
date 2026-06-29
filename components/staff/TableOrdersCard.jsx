"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/staff/TableOrdersCard.jsx  —  One table's orders, grouped
//
// Shows every order for a single table. Each item has +/- quantity
// controls and a remove button; each order has a "Void Order" button; the
// card header has an "+ Add Order" button that opens StaffOrderModal.
// Two banners can show above the orders: a bill request (calm, warning
// color) and a server call (urgent, pulsing, danger color) — calls are
// rendered above bill requests since they're typically more time-sensitive.
//
// Every mutating action goes through orderService/callServerService,
// which write their own activityLog entry — this component just supplies
// the actor (current staff member's email + role) and confirms
// destructive actions first.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  removeItemFromOrder,
  restoreRemovedItem,
  updateItemQuantity,
  voidOrder,
  restoreVoidedOrder,
  acknowledgeBillRequest,
  closeTab,
} from "@/lib/orderService";
import { acknowledgeServerCall } from "@/lib/callServerService";
import { theme } from "@/lib/theme";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import UndoToast from "@/components/UndoToast";
import StaffOrderModal from "./StaffOrderModal";

export default function TableOrdersCard({
  tableNumber,
  orders,
  billRequest,
  serverCall,
  isOccupied,
  flag,
  onToggleFlag,
  venueId,
  actor,
}) {
  const [removeTarget, setRemoveTarget] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [closeTabConfirmOpen, setCloseTabConfirmOpen] = useState(false);
  const [closingTab, setClosingTab] = useState(false);
  const [busy, setBusy] = useState(false);

  // Undo state for the two genuinely destructive actions on this card —
  // removing an item or voiding a whole order. Both delete real data
  // (unlike menu item/category delete, which is already a soft-delete),
  // so undo here means re-creating the order from a snapshot captured
  // right before the action ran.
  const [undoRemove, setUndoRemove] = useState(null); // { orderId, previousOrderSnapshot } | null
  const [undoVoid, setUndoVoid] = useState(null); // { orderId, voidedOrderSnapshot } | null

  const grandTotal = orders.reduce((sum, o) => sum + o.totalPrice, 0);
  const hasPendingBillRequest = billRequest?.status === "pending";
  const hasPendingServerCall = serverCall?.status === "pending";
  const isFlagged = !!flag;

  const handleQuantityChange = async (order, itemIndex, newQuantity) => {
    try {
      await updateItemQuantity(order.id, order, itemIndex, newQuantity, venueId, tableNumber, actor);
    } catch (err) {
      console.error("[TableOrdersCard] updateItemQuantity failed:", err);
    }
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    try {
      // Snapshot the FULL order before mutating it — this is what undo
      // restores to, not just the removed item in isolation.
      const previousOrderSnapshot = removeTarget.order;
      await removeItemFromOrder(
        removeTarget.orderId,
        removeTarget.order,
        removeTarget.index,
        venueId,
        tableNumber,
        actor
      );
      setUndoRemove({ orderId: removeTarget.orderId, previousOrderSnapshot });
      setRemoveTarget(null);
    } catch (err) {
      console.error("[TableOrdersCard] removeItemFromOrder failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleUndoRemove = async () => {
    if (!undoRemove) return;
    try {
      await restoreRemovedItem(undoRemove.orderId, undoRemove.previousOrderSnapshot, actor);
    } catch (err) {
      console.error("[TableOrdersCard] restoreRemovedItem failed:", err);
    } finally {
      setUndoRemove(null);
    }
  };

  const handleConfirmVoid = async () => {
    if (!voidTarget) return;
    setBusy(true);
    try {
      const voidedOrderSnapshot = voidTarget.order;
      await voidOrder(voidTarget.orderId, venueId, tableNumber, actor, voidTarget.summary);
      setUndoVoid({ orderId: voidTarget.orderId, voidedOrderSnapshot });
      setVoidTarget(null);
    } catch (err) {
      console.error("[TableOrdersCard] voidOrder failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleUndoVoid = async () => {
    if (!undoVoid) return;
    try {
      await restoreVoidedOrder(undoVoid.orderId, undoVoid.voidedOrderSnapshot, actor);
    } catch (err) {
      console.error("[TableOrdersCard] restoreVoidedOrder failed:", err);
    } finally {
      setUndoVoid(null);
    }
  };

  const handleAcknowledgeBill = async () => {
    if (!billRequest) return;
    try {
      await acknowledgeBillRequest(billRequest.id, venueId, tableNumber, actor);
    } catch (err) {
      console.error("[TableOrdersCard] acknowledgeBillRequest failed:", err);
    }
  };

  const handleAcknowledgeCall = async () => {
    if (!serverCall) return;
    try {
      await acknowledgeServerCall(serverCall.id, venueId, tableNumber, actor);
    } catch (err) {
      console.error("[TableOrdersCard] acknowledgeServerCall failed:", err);
    }
  };

  const handleConfirmCloseTab = async () => {
    setClosingTab(true);
    try {
      await closeTab({ venueId, tableNumber, actor });
      setCloseTabConfirmOpen(false);
    } catch (err) {
      console.error("[TableOrdersCard] closeTab failed:", err);
    } finally {
      setClosingTab(false);
    }
  };

  return (
    <div
      style={{
        ...styles.card,
        ...(hasPendingServerCall ? styles.cardUrgent : {}),
        ...(isFlagged && !hasPendingServerCall ? styles.cardFlagged : {}),
      }}
    >
      <div style={styles.cardHeader}>
        <h3 style={styles.tableTitle}>Table {tableNumber}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onToggleFlag}
            style={{ ...styles.flagBtn, ...(isFlagged ? styles.flagBtnActive : {}) }}
            title={isFlagged ? "Remove flag" : "Flag this table"}
          >
            🚩
          </button>
          <span style={styles.grandTotal}>${grandTotal.toFixed(2)}</span>
          {orders.length > 0 && (
            <button onClick={() => setCloseTabConfirmOpen(true)} style={styles.closeTabBtn}>
              Close Tab
            </button>
          )}
          <button onClick={() => setAddOrderOpen(true)} style={styles.addOrderBtn}>
            + Add Order
          </button>
        </div>
      </div>

      {isFlagged && (
        <div style={styles.flagBanner}>
          <span style={styles.flagBannerText}>🚩 {flag.note ? flag.note : "Flagged"}</span>
        </div>
      )}

      {hasPendingServerCall && (
        <div style={styles.callBanner}>
          <span style={styles.callBannerDot} />
          <span style={styles.callBannerText}>Calling for staff</span>
          <button onClick={handleAcknowledgeCall} style={styles.callAcknowledgeBtn}>
            I'm On It
          </button>
        </div>
      )}

      {hasPendingBillRequest && (
        <div style={styles.billRequestBanner}>
          <span style={styles.billRequestText}>Requested bill — wants to settle up</span>
          <button onClick={handleAcknowledgeBill} style={styles.acknowledgeBtn}>
            Mark Handled
          </button>
        </div>
      )}

      {orders.length === 0 && isOccupied && (
        <div style={styles.occupiedEmptyState}>
          <span style={{ fontSize: 13 }}>👋</span>
          <span style={styles.occupiedEmptyText}>Seated, no orders yet</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {orders.map((order) => {
          const timeLabel = order.createdAt
            ? order.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "—";
          const sourceLabel = order.source === "staff" ? "Added by staff" : order.tabletSlot;

          return (
            <div key={order.id} style={styles.orderBlock}>
              <div style={styles.orderHeader}>
                <span style={styles.orderTime}>
                  {order.orderNumber && <span style={styles.orderNumber}>#{order.orderNumber}</span>} {timeLabel} · {sourceLabel}
                </span>
                <button
                  onClick={() =>
                    setVoidTarget({
                      orderId: order.id,
                      order,
                      summary: `${order.items.length} item${order.items.length === 1 ? "" : "s"}, $${order.totalPrice.toFixed(2)}`,
                    })
                  }
                  style={styles.voidBtn}
                >
                  Void Order
                </button>
              </div>

              {order.items.map((item, idx) => (
                <div key={idx} style={styles.itemRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={styles.itemName}>{item.name_en}</span>
                    {item.selectedModifiers?.length > 0 && (
                      <p style={styles.modifierLine}>{item.selectedModifiers.map((m) => m.optionName_en).join(", ")}</p>
                    )}
                    {item.specialInstructions && <p style={styles.instructionsLine}>&quot;{item.specialInstructions}&quot;</p>}
                  </div>

                  <div style={styles.qtyControls}>
                    <button onClick={() => handleQuantityChange(order, idx, item.quantity - 1)} style={styles.qtyBtn}>
                      −
                    </button>
                    <span style={styles.qtyValue}>{item.quantity}</span>
                    <button onClick={() => handleQuantityChange(order, idx, item.quantity + 1)} style={styles.qtyBtn}>
                      +
                    </button>
                  </div>

                  <span style={styles.itemPrice}>${(item.unitPrice * item.quantity).toFixed(2)}</span>

                  <button
                    onClick={() => setRemoveTarget({ orderId: order.id, order, index: idx, name: item.name_en })}
                    style={styles.removeItemBtn}
                    title="Remove this item"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <div style={styles.orderSubtotal}>Order total: ${order.totalPrice.toFixed(2)}</div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleConfirmRemove}
        confirming={busy}
        title="Remove Item"
        message={
          removeTarget
            ? `Remove "${removeTarget.name}" from this order? This updates the table's bill immediately and is logged. You'll have a few seconds to undo right after.`
            : ""
        }
      />

      <ConfirmDialog
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleConfirmVoid}
        confirming={busy}
        title="Void Order"
        message="Void this entire order? It will be removed from the table's bill immediately and logged. You'll have a few seconds to undo right after."
      />

      <ConfirmDialog
        open={closeTabConfirmOpen}
        onClose={() => setCloseTabConfirmOpen(false)}
        onConfirm={handleConfirmCloseTab}
        confirming={closingTab}
        title="Close Tab"
        message={`Confirm you've collected payment of $${grandTotal.toFixed(2)} for Table ${tableNumber}. This closes out all ${orders.length} order${orders.length === 1 ? "" : "s"} and resets the table's bill for the next round.`}
      />

      <StaffOrderModal
        open={addOrderOpen}
        onClose={() => setAddOrderOpen(false)}
        venueId={venueId}
        tableNumber={tableNumber}
        actor={actor}
      />

      {undoRemove && (
        <UndoToast message="Item removed" onUndo={handleUndoRemove} onExpire={() => setUndoRemove(null)} />
      )}

      {undoVoid && <UndoToast message="Order voided" onUndo={handleUndoVoid} onExpire={() => setUndoVoid(null)} />}
    </div>
  );
}

const styles = {
  card: {
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.lg,
    padding: 18,
    transition: "border-color 0.3s ease, box-shadow 0.3s ease",
  },
  cardUrgent: {
    border: `1px solid ${theme.color.danger}60`,
    boxShadow: `0 0 0 1px ${theme.color.danger}20, 0 8px 24px rgba(239,68,68,0.08)`,
  },
  cardFlagged: {
    border: `1px solid ${theme.color.warning}60`,
    boxShadow: `0 0 0 1px ${theme.color.warning}20`,
  },
  flagBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.5,
    flexShrink: 0,
  },
  flagBtnActive: {
    border: `1px solid ${theme.color.warning}`,
    background: theme.color.warningBg,
    opacity: 1,
  },
  flagBanner: {
    background: theme.color.warningBg,
    border: `1px solid ${theme.color.warning}40`,
    borderRadius: theme.radius.sm,
    padding: "8px 12px",
    marginBottom: 10,
  },
  flagBannerText: {
    fontFamily: theme.font.body,
    fontSize: 12,
    fontWeight: 700,
    color: theme.color.warning,
  },
  occupiedEmptyState: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 14px",
    background: "rgba(255,255,255,0.02)",
    border: `1px dashed ${theme.color.border}`,
    borderRadius: theme.radius.sm,
    marginBottom: 4,
  },
  occupiedEmptyText: {
    fontFamily: theme.font.body,
    fontSize: 12,
    color: theme.color.textFaint,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 8,
  },
  tableTitle: {
    margin: 0,
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 18,
    color: theme.color.textPrimary,
  },
  grandTotal: {
    fontFamily: theme.font.display,
    fontWeight: 800,
    fontSize: 18,
    color: theme.color.accent,
  },
  addOrderBtn: {
    padding: "6px 12px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  closeTabBtn: {
    padding: "6px 12px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.color.borderStrong}`,
    background: "rgba(255,255,255,0.04)",
    color: theme.color.textPrimary,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  callBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: theme.color.dangerBg,
    border: `1px solid ${theme.color.danger}50`,
    borderRadius: theme.radius.sm,
    padding: "8px 12px",
    marginBottom: 10,
  },
  callBannerDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: theme.color.danger,
    boxShadow: `0 0 8px ${theme.color.danger}`,
    flexShrink: 0,
    animation: "ping 1.4s ease-out infinite",
  },
  callBannerText: {
    flex: 1,
    fontFamily: theme.font.body,
    fontSize: 12,
    fontWeight: 700,
    color: theme.color.danger,
  },
  callAcknowledgeBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: `1px solid ${theme.color.danger}60`,
    background: "rgba(239,68,68,0.15)",
    color: theme.color.danger,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  billRequestBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    background: theme.color.warningBg,
    border: `1px solid ${theme.color.warning}40`,
    borderRadius: theme.radius.sm,
    padding: "8px 12px",
    marginBottom: 12,
  },
  billRequestText: {
    fontFamily: theme.font.body,
    fontSize: 12,
    fontWeight: 700,
    color: theme.color.warning,
  },
  acknowledgeBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: `1px solid ${theme.color.warning}60`,
    background: "rgba(251,191,36,0.12)",
    color: theme.color.warning,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
    flexShrink: 0,
  },
  orderBlock: {
    background: "rgba(255,255,255,0.02)",
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.radius.sm,
    padding: 12,
  },
  orderHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  orderTime: {
    fontFamily: theme.font.body,
    fontSize: 11,
    color: theme.color.textFaint,
  },
  orderNumber: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    color: theme.color.textSecondary,
    marginRight: 2,
  },
  voidBtn: {
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${theme.color.danger}50`,
    background: theme.color.dangerBg,
    color: theme.color.danger,
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 10,
    cursor: "pointer",
  },
  itemRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "5px 0",
  },
  itemName: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textSecondary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "block",
  },
  modifierLine: {
    margin: "2px 0 0",
    fontFamily: theme.font.body,
    fontSize: 10,
    color: theme.color.accent,
  },
  instructionsLine: {
    margin: "2px 0 0",
    fontFamily: theme.font.body,
    fontSize: 10,
    fontStyle: "italic",
    color: theme.color.textFaint,
  },
  qtyControls: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    marginTop: 2,
  },
  qtyBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: `1px solid ${theme.color.accentBorder}`,
    background: theme.color.accentBg,
    color: theme.color.accent,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
  },
  qtyValue: {
    fontFamily: theme.font.display,
    fontWeight: 700,
    fontSize: 12,
    color: theme.color.textPrimary,
    minWidth: 16,
    textAlign: "center",
  },
  itemPrice: {
    fontFamily: theme.font.body,
    fontSize: 13,
    color: theme.color.textSecondary,
    flexShrink: 0,
    minWidth: 50,
    textAlign: "right",
    marginTop: 2,
  },
  removeItemBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: `1px solid ${theme.color.border}`,
    background: "rgba(255,255,255,0.03)",
    color: theme.color.textFaint,
    fontSize: 11,
    cursor: "pointer",
    flexShrink: 0,
    lineHeight: 1,
    marginTop: 1,
  },
  orderSubtotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: `1px solid ${theme.color.border}`,
    fontFamily: theme.font.display,
    fontSize: 11,
    fontWeight: 700,
    color: theme.color.textMuted,
    textAlign: "right",
  },
};
