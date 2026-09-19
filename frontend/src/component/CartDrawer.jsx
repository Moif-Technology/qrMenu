// src/components/CartDrawer.jsx
import { useMemo, useState } from "react";
import { submitOrder } from "../services/orders.service";
import { useCart } from "../store/cartStore";
import { useUI } from "../store/uiStore";
import { formatAED } from "../utils/currency";
import Icon from "./Icon";
import { useTranslation } from "react-i18next";
import ModifierModal from "./ModifierModal";
import PhoneInputWithCountry from "./reservation/PhoneInputWithCountry";
import { normalizePhoneForInput } from "../utils/phone";
import {
  getPhoneValidationMessage,
  validatePhoneForSelectedCountry,
} from "../utils/phoneRules";
import { createPortal } from "react-dom";

function isValidCustomerPhone(phone) {
  return validatePhoneForSelectedCountry(phone, "ae").valid;
}

function MobileNumberSheet({
  open,
  value,
  error,
  sending,
  onChange,
  onClose,
  onConfirm,
  onSkip,
}) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-number-title"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={sending ? undefined : onClose} />

      <div className="relative w-full overflow-hidden rounded-t-[28px] border border-white/70 bg-white shadow-[0_28px_70px_rgba(0,0,0,0.28)] sm:max-w-[390px] sm:rounded-[28px]">
        <div className="flex justify-center pb-1 pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={sending}
          aria-label="Close mobile number"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-800 disabled:opacity-50"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>

        <div className="px-5 pb-5 pt-7 sm:px-6 sm:pb-6">
          <div className="mb-5 flex items-start gap-3 pr-8">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#101828] text-white shadow-[0_10px_24px_rgba(16,24,40,0.18)]">
              <Icon name="phone-call" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--grad-end)]">
                One quick detail
              </div>
              <h2 id="mobile-number-title" className="text-xl font-bold leading-tight text-gray-950">
                Your mobile number
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">
                We use this to link the QR order to your table. It's optional -
                you can skip it.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
            <PhoneInputWithCountry
              value={normalizePhoneForInput(value || "", "ae")}
              onChange={onChange}
              defaultCountry="ae"
              placeholder="Enter mobile number"
              disabled={sending}
              hasError={!!error}
              pickerVariant="sheet"
            />

            <p className={`mt-2 min-h-[1.1rem] text-[12px] leading-snug ${error ? "text-red-600" : "text-gray-500"}`}>
              {error || "Tap the country code to change it."}
            </p>
          </div>

          <button
            type="button"
            onClick={onConfirm}
            disabled={sending}
            className="btn mt-5 h-12 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? (
              <>
                <Icon name="loader" className="mr-2 h-4 w-4 animate-spin" />
                Sending
              </>
            ) : (
              <>
                <Icon name="send" className="mr-2 h-4 w-4" />
                Continue
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onSkip}
            disabled={sending}
            className="mt-2 h-11 w-full rounded-xl text-sm font-semibold text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Skip and send order
          </button>
        </div>
        <div className="safe-bottom" />
      </div>
    </div>,
    document.body
  );
}

export default function CartDrawer({ open, onClose }) {
  const {
    items,
    inc,
    dec,
    remove,
    subtotal,
    note,
    setNote,
    clear,
    tableId,
    tableAreaId,
    customerPhone,
    setCustomerPhone,
  } = useCart();
  const showSuccess = useUI((s) => s.showSuccess);
  const [sending, setSending] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [phoneError, setPhoneError] = useState("");
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const total = subtotal();
  const { t } = useTranslation();

  const closeModifierEditor = () => setEditingLine(null);

  const applyModifierEdit = (pickedMods) => {
    if (!editingLine) return;
    const product = {
      ...(editingLine.product || {}),
      id: editingLine.id,
      name: editingLine.name,
      price: editingLine.basePrice ?? editingLine.product?.price ?? editingLine.price,
    };
    useCart.getState().updateMods(editingLine._k, product, pickedMods || []);
    setEditingLine(null);
  };

  const orderPayload = useMemo(() => {
    const sendableItems = items.filter((x) => !x.isExistingOrder);
    // Resolve the KOTChild id for an already-sent line so the backend can skip
    // it (no re-insert, no reprint). New lines have no kotChildId.
    const existingChildId = (x) => {
      if (!x.isExistingOrder) return null;
      const fromProduct =
        x.product?.KotChildID ?? x.product?.kotChildID ?? x.product?.kotChildId;
      if (fromProduct != null) return fromProduct;
      const m = String(x._k || "").match(/existing::(\d+)/);
      return m ? Number(m[1]) : null;
    };
    // Send ALL lines (existing + new). Existing carry kotChildId; backend
    // inserts only the new ones. Mirrors Tablet Module saveKot.
    const lines = items.map((x) => {
      const full = x.product || x.raw || x.meta || x.item || x;
      return {
        key: x._k,
        kotChildId: existingChildId(x),
        qty: x.qty,
        unitPrice: x.price,
        lineTotal: Number((x.price * x.qty).toFixed(2)),
        mods: (x.mods || []).map((m) => ({
          id: m.id ?? m.modId ?? m.code ?? null,
          name: m.name ?? m.label ?? m.Modifier ?? m.raw?.Modifier ?? String(m),
          price: m.price ?? 0,
        })),
        product: full,
      };
    });

    return {
      header: {
        tableId: tableId || null,
        areaId: tableAreaId || null,
        note: note || "",
        customerPhone: String(customerPhone || "").trim(),
        subtotal: Number(total.toFixed(2)),
        currency: "AED",
        itemsCount: sendableItems.length,
      },
      items: lines,
    };
  }, [items, note, total, tableId, tableAreaId, customerPhone]);
  const hasSendableItems = orderPayload.items.some((l) => l.kotChildId == null);

  async function submitCurrentOrder({ skipPhone = false } = {}) {
    if (!hasSendableItems || sending) return;
    if (!tableId) {
      alert("Table ID is missing. Please scan the QR code on your table to continue.");
      return;
    }

    const cleanPhone = String(customerPhone || "").trim();
    if (!skipPhone && !isValidCustomerPhone(cleanPhone)) {
      setPhoneError(getPhoneValidationMessage(cleanPhone, "ae"));
      setShowMobileSheet(true);
      return;
    }

    // Skipping sends no number at all; the backend then files the KOT against
    // the house walk-in customer instead of creating a CustomerMaster row.
    const payload = skipPhone
      ? { ...orderPayload, header: { ...orderPayload.header, customerPhone: "" } }
      : orderPayload;

    try {
      setPhoneError("");
      setShowMobileSheet(false);
      setSending(true);
      const res = await submitOrder(payload);
      const kotId =
        res?.kotId ?? res?.id ?? res?.data?.kotId ?? res?.data?.id ?? null;
      const etaMin = res?.etaMin ?? res?.data?.etaMin ?? null;

      const variants = ["chef", "ticket", "bell"];
      const variant = variants[Math.floor(Math.random() * variants.length)];

      // Show success dialog with "add more items" options
      showSuccess({
        kotId,
        tableId: orderPayload.header.tableId,
        itemsCount: orderPayload.header.itemsCount,
        subtotal: orderPayload.header.subtotal,
        currency: orderPayload.header.currency,
        etaMin,
        variant,
      }, true); // Pass true to show add more items options

      clear();
      onClose?.();
    } catch (err) {
      console.error("❌ SUBMIT FAILED:");
      console.error("  - Error:", err);
      console.error("  - Error Message:", err?.message);
      console.error("  - Error Response:", err?.response);
      console.error("  - Error Data:", err?.response?.data);
      alert("Failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleSend() {
    if (!hasSendableItems || sending) return;
    if (!tableId) {
      alert("Table ID is missing. Please scan the QR code on your table to continue.");
      return;
    }
    if (!isValidCustomerPhone(customerPhone)) {
      setPhoneError(getPhoneValidationMessage(customerPhone, "ae"));
      setShowMobileSheet(true);
      return;
    }
    submitCurrentOrder();
  }

  return (
    <div className={`drawer ${open ? "" : "pointer-events-none"}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 backdrop ${open ? "opacity-100" : "opacity-0"} transition-opacity`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`drawer__panel ${open ? "translate-x-0" : "translate-x-full"} flex flex-col`}>
        
        {/* Header - Fixed */}
        <div className="flex-shrink-0 p-4 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-900">{t("cart.your_order")}</div>
            <div className="flex items-center gap-3">
              {items.length > 0 && (
                <span className="text-sm text-gray-500">
                  {t("cart.items_count", { count: items.length })}
                </span>
              )}
              <button 
                className="btn-ghost p-1 rounded-lg" 
                onClick={onClose} 
                disabled={sending}
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Items - This will scroll independently */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-3">
            {items.length === 0 ? (
              <div className="text-center py-8">
                <Icon name="shopping-cart" className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">{t("cart.empty")}</p>
              </div>
            ) : (
              items.map((x) => {
                const safeMods = (Array.isArray(x.mods) ? x.mods : []).map((m) => ({
                  id: m.id ?? m.modId ?? m.code ?? null,
                  name: m.name ?? m.label ?? m.Modifier ?? m.raw?.Modifier ?? String(m),
                  price: Number(m.price || 0),
                }));

                return (
                  <div
                    key={x._k}
                    className="bg-white border border-gray-100 rounded-lg p-3 hover:border-gray-200 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-medium text-gray-900 text-sm leading-tight flex-1">
                            {x.name}
                          </h3>
                          <div className="font-semibold text-gray-900 text-right whitespace-nowrap text-sm">
                            {formatAED(x.price * x.qty)}
                          </div>
                        </div>

                        {safeMods.length > 0 && (
                          <div className="mb-2">
                            <div className="flex flex-wrap gap-1">
                              {safeMods.slice(0, 2).map((mod, index) => (
                                <span
                                  key={index}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-gray-50 text-xs text-gray-600 border border-gray-200"
                                >
                                  {mod.name}
                                  {mod.price > 0 && (
                                    <span className="text-green-600 font-medium ml-1">
                                      +{formatAED(mod.price)}
                                    </span>
                                  )}
                                </span>
                              ))}
                              {safeMods.length > 2 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-gray-50 text-xs text-gray-500 border border-gray-200">
                                  +{safeMods.length - 2} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {!x.isExistingOrder && (
                          <button
                            type="button"
                            onClick={() => setEditingLine(x)}
                            disabled={sending}
                            className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-[rgba(201,26,77,0.22)] bg-[var(--grad-start-soft)] px-2 py-1 text-[11px] font-medium text-[var(--grad-end)] transition hover:border-[rgba(201,26,77,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
                            title={safeMods.length > 0 ? "Edit modifiers" : "Add modifiers"}
                          >
                            <Icon name="sliders" className="h-3.5 w-3.5" />
                            {safeMods.length > 0 ? "Edit modifiers" : "Add modifiers"}
                          </button>
                        )}

                        <div className="text-xs text-gray-500">
                          {t("cart.each", { price: formatAED(x.price) })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                      <div className="text-xs text-gray-600">
                        {t("cart.qty", { qty: x.qty })}
                        {x.isExistingOrder && (
                          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                            Already ordered
                          </span>
                        )}
                      </div>
                      {!x.isExistingOrder && (
                        <div className="flex items-center gap-1">
                          <button
                            className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-95 transition-all text-gray-500 hover:text-red-500"
                            onClick={() => remove(x._k)}
                            disabled={sending}
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </button>
                          
                          <div className="flex items-center gap-1 bg-gray-100 rounded-lg">
                            <button
                              className="p-1.5 rounded-lg hover:bg-white active:scale-95 transition-all disabled:opacity-30"
                              onClick={() => dec(x._k)}
                              disabled={sending || x.qty <= 1}
                            >
                              <Icon name="minus" className="h-3.5 w-3.5" />
                            </button>
                            
                            <span className="px-1 text-sm font-medium text-gray-900 min-w-[20px] text-center">
                              {x.qty}
                            </span>
                            
                            <button
                              className="p-1.5 rounded-lg hover:bg-white active:scale-95 transition-all disabled:opacity-30"
                              onClick={() => inc(x._k)}
                              disabled={sending}
                            >
                              <Icon name="plus" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer - Fixed at bottom */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-white safe-bottom">
          <div className="p-4 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Icon name="edit-3" className="h-3.5 w-3.5" />
                {t("cart.note_label")}
              </div>
              <div className="relative">
                <textarea
                  className="input h-12 text-sm resize-none pr-8"
                  placeholder={t("cart.note_placeholder")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={sending}
                  rows={1}
                />
                {note && (
                  <button
                    onClick={() => setNote("")}
                    className="absolute right-2 top-2 p-1 rounded hover:bg-gray-100"
                    disabled={sending}
                  >
                    <Icon name="x" className="h-3 w-3 text-gray-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Subtotal */}
            <div className="flex items-center justify-between py-2">
              <div className="text-gray-600 font-medium">{t("cart.subtotal")}</div>
              <div className="font-bold text-gray-900">{formatAED(total)}</div>
            </div>

            {/* Buttons */}
            <button
              className="btn w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSend}
              disabled={!hasSendableItems || sending}
            >
              {sending ? (
                <>
                  <Icon name="loader" className="h-4 w-4 mr-2 animate-spin" />
                  {t("cart.sending")}
                </>
              ) : (
                <>
                  <Icon name="send" className="h-4 w-4 mr-2" />
                  {t("cart.send")}
                </>
              )}
            </button>

            <button
              className="btn-ghost w-full py-2 text-sm text-gray-600 hover:text-red-600 border border-gray-200 rounded-xl flex items-center justify-center gap-1"
              onClick={clear}
              disabled={sending || !hasSendableItems}
            >
              <Icon name="trash-2" className="h-4 w-4" />
              {t("cart.clear")}
            </button>
          </div>
        </div>
      </div>

      <ModifierModal
        open={!!editingLine}
        item={
          editingLine
            ? {
                ...(editingLine.product || {}),
                id: editingLine.id,
                name: editingLine.name,
                price: editingLine.basePrice ?? editingLine.product?.price ?? editingLine.price,
              }
            : null
        }
        initialSelectedIds={
          editingLine?.mods?.map((m) => m.id ?? m.ModifierID ?? m.name).filter(Boolean) || []
        }
        initialSelectedMods={editingLine?.mods || []}
        onClose={closeModifierEditor}
        onApply={applyModifierEdit}
      />

      <MobileNumberSheet
        open={showMobileSheet}
        value={customerPhone}
        error={phoneError}
        sending={sending}
        onChange={(phone) => {
          setCustomerPhone(phone || "");
          if (phoneError) setPhoneError("");
        }}
        onClose={() => {
          if (!sending) setShowMobileSheet(false);
        }}
        onConfirm={() => submitCurrentOrder()}
        onSkip={() => {
          setCustomerPhone("");
          setPhoneError("");
          submitCurrentOrder({ skipPhone: true });
        }}
      />
    </div>
  );
}
