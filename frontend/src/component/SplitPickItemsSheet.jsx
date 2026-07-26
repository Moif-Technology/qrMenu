import { useEffect, useMemo, useState } from "react";

const fmt = (n) => Number(n || 0).toFixed(2);

export default function SplitPickItemsSheet({
  items = [],          // array of bill lines
  paidKotChildIds = [], // array of paid kotChildIDs (items already paid)
  currency = "AED",
  onClose,             // () => void
  onConfirm,           // (payload, tipAmount) => void
  onRemoveSplit,       // optional: () => void
  serviceFeeRate = 0,
}) {
  // Selected count keyed by kotChildId (NOT array index) so a background
  // refresh of `items` can't lose or misalign the guest's selection.
  const [pick, setPick] = useState({}); // { [kotChildId]: count }
  const [tipPreset, setTipPreset] = useState(null); // number | "roundup" | "custom" | null
  const [customTip, setCustomTip] = useState("");

  // Stable per-line key. KOTChild rows always carry a KotChildID; index is only
  // a last-resort fallback for a row that somehow lacks one.
  const keyOf = (row, i) =>
    String(row?.KotChildID ?? row?.kotChildID ?? row?.kotChildId ?? `idx-${i}`);

  // Reconcile selection when items/paid change (e.g. the 10s auto-refresh, or
  // another guest paying an item). Preserve every still-present, unpaid pick -
  // clamped to the item's current Qty - and drop only items that vanished or
  // just got paid. Never blanket-reset, which would wipe an in-progress choice.
  useEffect(() => {
    setPick((prev) => {
      const next = {};
      items.forEach((row, i) => {
        const kotChildId = row.KotChildID || row.kotChildID || row.kotChildId || null;
        const isPaid = kotChildId && paidKotChildIds.includes(Number(kotChildId));
        if (isPaid) return; // drop paid items from selection
        const k = keyOf(row, i);
        const prevVal = Number(prev[k] || 0);
        if (prevVal > 0) {
          const max = Math.max(0, Number(row.Qty || 0));
          next[k] = Math.min(prevVal, max);
        }
      });
      return next;
    });
  }, [items, paidKotChildIds]);

  const setQty = (i, v) => {
    const row = items[i];
    const k = keyOf(row, i);
    const max = Math.max(0, Number(row?.Qty || 0));
    const val = Math.min(Math.max(0, v), max);
    setPick((p) => ({ ...p, [k]: val }));
  };

  // compute "Your share" from selected units (unit price + per-unit tax + per-unit service)
  const share = useMemo(() => {
    let total = 0;
    items.forEach((row, i) => {
      const sel = Number(pick[keyOf(row, i)] || 0);
      if (!sel) return;

      const q  = Number(row.Qty || 0) || 1;
      const up = Number(row.UnitPrice || 0);
      const tx = Number(row.Tax1AmountC || 0) / q;
      const sv = Number(row.ServiceFee || 0)   / q;

      total += sel * (up + tx + sv);
    });
    return total;
  }, [items, pick]);

  // Fee + tip preview — fee is display-only, backend always recomputes it
  // from the live DB rate at charge time.
  const feeAmt = Math.round(share * serviceFeeRate * 100) / 100;
  const baseDue = share + feeAmt;
  const roundUpRemainder = Math.ceil(baseDue / 5) * 5 - baseDue;
  const roundUpTip = roundUpRemainder < 0.01 ? 5 : roundUpRemainder;
  const tipAmount = tipPreset === "custom"
    ? Math.max(0, Number(customTip) || 0)
    : tipPreset === "roundup"
      ? roundUpTip
      : Number(tipPreset) || 0;
  const totalToPay = baseDue + tipAmount;

  const makePayload = () => {
    const out = [];
    items.forEach((row, i) => {
      const sel = Number(pick[keyOf(row, i)] || 0);
      if (!sel) return;
      
      // Skip if item is already paid
      const kotChildId = row.KotChildID || row.kotChildID || row.kotChildId || null;
      if (kotChildId && paidKotChildIds.includes(Number(kotChildId))) {
        return; // Skip paid items
      }

      const q  = Number(row.Qty || 0) || 1;
      const up = Number(row.UnitPrice || 0);
      const tx = (Number(row.Tax1AmountC || 0) / q) * sel;
      const sv = (Number(row.ServiceFee   || 0) / q) * sel;

      out.push({
        kotChildId: kotChildId,
        productId: row.ProductID ?? null,
        qty: sel,
        unitPrice: up,
        tax: tx,
        service: sv,
        lineTotal: sel * (up + tx/sel + sv/sel), // equals up + per-unit tx + per-unit sv times sel
        desc: row.ShortDescription,
        modifier: row.Modifier || null,
      });
    });
    return out;
  };

  const Row = ({ row, i }) => {
    const title = row.ShortDescription || `Item #${row.ProductID}`;
    const price = Number(row.UnitPrice || 0);
    const max   = Math.max(0, Number(row.Qty || 0));
    const sel   = Number(pick[keyOf(row, i)] || 0);
    
    // Check if this item is already paid
    const kotChildId = row.KotChildID || row.kotChildID || row.kotChildId || null;
    const isPaid = kotChildId && paidKotChildIds.includes(Number(kotChildId));

    return (
      <div className={`rounded-[28px] px-5 py-4 border flex items-center justify-between ${
        isPaid ? 'bg-gray-100 opacity-60' : 'bg-white'
      }`}
           style={{ borderColor: "var(--grad-end-soft)" }}>
        <div className="min-w-0">
          <div className="uppercase tracking-wide text-[15px] font-semibold text-gray-900 truncate flex items-center gap-2">
            {title}
            {isPaid && (
              <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-normal">
                PAID
              </span>
            )}
          </div>
          {row.Modifier && (
            <div className="text-[12px] text-gray-500 mt-1 truncate">{row.Modifier}</div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-gray-900 font-semibold">{fmt(price)} <span className="text-xs text-gray-400">{currency}</span></div>

          {/* Control: + (when 0)  OR  [-  n  +] (when >0) OR disabled if paid */}
          {isPaid ? (
            <div className="text-[12px] text-gray-500 font-medium">
              Already paid
            </div>
          ) : sel === 0 ? (
            <button
              onClick={() => setQty(i, 1)}
              className="h-10 w-10 rounded-full bg-gray-100 text-gray-700 grid place-items-center border"
              style={{ borderColor: "var(--grad-end-soft)" }}
              aria-label="add"
            >
              +
            </button>
          ) : (
            <div className="h-10 rounded-full bg-gray-100 border flex items-center gap-3 pl-2 pr-2"
                 style={{ borderColor: "var(--grad-end-soft)" }}>
              <button
                onClick={() => setQty(i, sel - 1)}
                className="h-8 w-8 rounded-full grid place-items-center text-gray-700"
                aria-label="decrease"
              >
                −
              </button>
              <div className="w-6 text-center font-semibold">{sel}</div>
              <button
                onClick={() => setQty(i, sel + 1)}
                disabled={sel >= max}
                className="h-8 w-8 rounded-full grid place-items-center text-gray-700 disabled:opacity-40"
                aria-label="increase"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[75]">
      {/* dim */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* bottom sheet */}
      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto w-full max-w-md rounded-t-[28px] bg-white shadow-2xl">
          {/* header */}
          <div className="px-6 pt-4 pb-3 flex items-center justify-between">
            <h3 className="text-[20px] font-semibold text-gray-900">Pay for your items</h3>
            <button
              onClick={onClose}
              className="h-10 w-10 grid place-items-center rounded-full text-gray-600 hover:bg-gray-100"
              aria-label="close"
            >
              ×
            </button>
          </div>

          {/* list */}
          <div className="px-4 pb-4 max-h-[54vh] overflow-y-auto space-y-3">
            {items.map((row, i) => (
              <Row key={row.KotChildID ?? i} row={row} i={i} />
            ))}
            {items.length === 0 && (
              <div className="text-center text-sm text-gray-500 py-10">No items</div>
            )}
          </div>

          {/* footer summary */}
          <div className="px-6 py-4 border-t bg-white rounded-b-[28px]"
               style={{ borderColor: "var(--grad-end-soft)" }}>
            {share > 0 && (
              <div className="rounded-xl border p-3 mb-3 space-y-1" style={{ borderColor: "var(--grad-end-soft)" }}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Your share</span>
                  <span className="text-gray-900">{fmt(share)} {currency}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Service fee</span>
                  <span className="text-gray-900">{fmt(feeAmt)} {currency}</span>
                </div>
                {tipAmount > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Tip</span>
                    <span className="text-gray-900">{fmt(tipAmount)} {currency}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t" style={{ borderColor: "var(--grad-end-soft)" }}>
                  <span>You pay</span>
                  <span>{fmt(totalToPay)} {currency}</span>
                </div>
              </div>
            )}

            {share > 0 && (
              <div className="mb-3">
                <div className="flex items-baseline justify-between mb-1.5 px-1">
                  <span className="text-[11px] font-medium tracking-wide text-gray-600">Add a tip</span>
                  {tipAmount > 0 ? (
                    <button onClick={() => { setTipPreset(null); setCustomTip(""); }} className="text-[11px] text-gray-400 hover:text-gray-600">
                      Remove
                    </button>
                  ) : (
                    <span className="text-[11px] text-gray-400">Optional</span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => setTipPreset(tipPreset === "roundup" ? null : "roundup")}
                    className={`h-9 rounded-xl text-[12px] font-medium border ${tipPreset === "roundup" ? "text-white" : "bg-white text-gray-700"}`}
                    style={tipPreset === "roundup"
                      ? { background: "linear-gradient(90deg, var(--grad-start, #7A0026), var(--grad-end, #C91A4D))" }
                      : { borderColor: "var(--grad-end-soft)" }}
                  >
                    +{fmt(roundUpTip)}
                  </button>
                  {[5, 10].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setTipPreset(tipPreset === amt ? null : amt)}
                      className={`h-9 rounded-xl text-[12px] font-medium border ${tipPreset === amt ? "text-white" : "bg-white text-gray-700"}`}
                      style={tipPreset === amt
                        ? { background: "linear-gradient(90deg, var(--grad-start, #7A0026), var(--grad-end, #C91A4D))" }
                        : { borderColor: "var(--grad-end-soft)" }}
                    >
                      {amt} {currency}
                    </button>
                  ))}
                  <button
                    onClick={() => setTipPreset(tipPreset === "custom" ? null : "custom")}
                    className={`h-9 rounded-xl text-[12px] font-medium border ${tipPreset === "custom" ? "text-white" : "bg-white text-gray-700"}`}
                    style={tipPreset === "custom"
                      ? { background: "linear-gradient(90deg, var(--grad-start, #7A0026), var(--grad-end, #C91A4D))" }
                      : { borderColor: "var(--grad-end-soft)" }}
                  >
                    Custom
                  </button>
                </div>
                {tipPreset === "custom" && (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={customTip}
                    onChange={(e) => setCustomTip(e.target.value)}
                    placeholder="Enter tip amount"
                    className="input mt-2 text-right"
                    autoFocus
                  />
                )}
              </div>
            )}

            <div className="text-[12px] text-gray-500 mb-3">Inclusive of all taxes and charges</div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (onRemoveSplit) onRemoveSplit();
                  setPick({});
                }}
                className="flex-1 h-12 rounded-full bg-rose-50 text-rose-600 font-semibold"
              >
                Remove split
              </button>
              <button
                disabled={share <= 0}
                onClick={() => onConfirm(makePayload(), tipAmount)}
                className="flex-1 h-12 rounded-full text-white font-semibold disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(90deg, var(--grad-start, #7A0026), var(--grad-end, #C91A4D))",
                }}
              >
                Confirm · Pay {fmt(totalToPay)} {currency}
              </button>
            </div>

            <div className="h-3 safe-bottom" />
          </div>
        </div>
      </div>
    </div>
  );
}
