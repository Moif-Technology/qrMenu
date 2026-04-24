// src/components/CartDrawer.jsx
import { useMemo, useState } from "react";
import { submitOrder } from "../services/orders.service";
import { useCart } from "../store/cartStore";
import { useUI } from "../store/uiStore";
import { formatAED } from "../utils/currency";
import Icon from "./Icon";
import { useTranslation } from "react-i18next";

export default function CartDrawer({ open, onClose }) {
  const { items, inc, dec, remove, subtotal, note, setNote, clear, tableId, tableAreaId } = useCart();
  const showSuccess = useUI((s) => s.showSuccess);
  const [sending, setSending] = useState(false);
  const total = subtotal();
  const { t } = useTranslation();

  const orderPayload = useMemo(() => {
    const sendableItems = items.filter((x) => !x.isExistingOrder);
    const lines = sendableItems.map((x) => {
      const full = x.product || x.raw || x.meta || x.item || x;
      return {
        key: x._k,
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
        subtotal: Number(total.toFixed(2)),
        currency: "AED",
        itemsCount: sendableItems.length,
      },
      items: lines,
    };
  }, [items, note, total, tableId, tableAreaId]);
  const hasSendableItems = orderPayload.items.length > 0;

  async function handleSend() {
    if (!hasSendableItems || sending) return;
    if (!tableId) {
      alert("Table ID is missing. Please scan the QR code on your table to continue.");
      return;
    }
    try {
      setSending(true);
      const res = await submitOrder(orderPayload);
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

  function handlePreviewSuccess() {
    const variants = ["chef", "ticket", "bell"];
    showSuccess({
      kotId: `KOT${Math.floor(100000 + Math.random() * 900000)}`,
      tableId: orderPayload.header.tableId,
      itemsCount: orderPayload.header.itemsCount || 3,
      subtotal: orderPayload.header.subtotal || 42.5,
      currency: orderPayload.header.currency || "AED",
      etaMin: 12,
      variant: variants[Math.floor(Math.random() * variants.length)],
    });
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
            {/* Notes - Updated with better placeholder */}
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

            <div className="flex gap-2">
              <button 
                className="btn-outline flex-1 py-2 text-sm flex items-center justify-center gap-1"
                onClick={handlePreviewSuccess} 
                disabled={sending}
              >
                <Icon name="eye" className="h-4 w-4" />
                {t("cart.preview")}
              </button>
              <button 
                className="btn-ghost flex-1 py-2 text-sm text-gray-600 hover:text-red-600 border border-gray-200 rounded-xl flex items-center justify-center gap-1"
                onClick={clear}
                disabled={sending || !hasSendableItems}
              >
                <Icon name="trash-2" className="h-4 w-4" />
                {t("cart.clear")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}