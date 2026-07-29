import { useEffect, useMemo, useState } from "react";

import { POPULAR_TIP, TIP_PRESETS } from "../lib/tipOptions";

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const fmt = (n) => Number(n || 0).toFixed(2);

export default function SplitCustomAmountSheet({
  total = 0,            // grand total the guest can pay up to
  currency = "AED",
  onClose,              // () => void
  onConfirm,            // (amountNumber, tipAmount) => void
  onRemoveSplit,        // optional: () => void
  serviceFeeRate = 0,
}) {
  const [amount, setAmount] = useState(0);
  const [tipPreset, setTipPreset] = useState(null); // number | "custom" | null
  const [customTip, setCustomTip] = useState("");

  useEffect(() => {
    // optional: prefill with 25%
    setAmount(Number((total * 0.25).toFixed(2)));
  }, [total]);

  const max = useMemo(() => Number(total) || 0, [total]);
  const step = useMemo(() => Math.max(0.01, max / 200), [max]);
  const valid = amount > 0 && amount <= max;

  const setVal = (v) => setAmount(clamp(Number(v || 0), 0, max));

  // Fee + tip preview — fee is display-only, backend always recomputes it
  // from the live DB rate at charge time.
  const tipAmount = tipPreset === "custom"
    ? Math.max(0, Number(customTip) || 0)
    : Number(tipPreset) || 0;
  // Fee base is the typed amount + tip, same formula the backend charges on.
  const feeAmt = Math.round((amount + tipAmount) * serviceFeeRate * 100) / 100;
  const baseDue = amount + feeAmt;
  const totalToPay = baseDue + tipAmount;

  const Chip = ({ label, val }) => (
    <button
      onClick={() => setVal(val)}
      className="px-3 py-1.5 rounded-full text-sm border bg-white hover:bg-gray-50"
      style={{ borderColor: "var(--grad-end-soft)" }}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[76]">
      {/* dim */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* sheet */}
      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto w-full max-w-md rounded-t-[28px] bg-white shadow-2xl">
          {/* header */}
          <div className="px-6 pt-4 pb-3 flex items-center justify-between">
            <h3 className="text-[20px] font-semibold text-gray-900">Pay a custom amount</h3>
            <button
              onClick={onClose}
              className="h-10 w-10 grid place-items-center rounded-full text-gray-600 hover:bg-gray-100"
              aria-label="close"
            >
              ×
            </button>
          </div>

          {/* body */}
          <div className="px-6 pb-2">
            {/* Big amount display */}
            <div className="text-center mb-4">
              <div className="text-[12px] text-gray-500 tracking-wide mb-1">ENTER AMOUNT</div>
              <div className="text-[38px] font-light text-gray-900">{fmt(amount)}</div>
              <div className="text-[12px] text-gray-500">{currency}</div>
            </div>

            {/* Text input */}
            <div className="mb-4">
              <label className="block text-[12px] text-gray-600 mb-1">Amount</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={max}
                  value={amount}
                  onChange={(e) => setVal(e.target.value)}
                  className="input text-right font-semibold"
                />
                <span className="text-sm text-gray-600">{currency}</span>
              </div>
            </div>

            {/* Slider */}
            <div className="mb-4">
              <input
                type="range"
                min="0"
                max={max}
                step={step}
                value={amount}
                onChange={(e) => setVal(e.target.value)}
                className="w-full"
              />
              <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                <span>0</span>
                <span>{fmt(max)} {currency}</span>
              </div>
            </div>

            {/* Quick picks */}
            <div className="flex flex-wrap gap-2 mb-2">
              <Chip label="25%" val={Number((max * 0.25).toFixed(2))} />
              <Chip label="33%" val={Number((max / 3).toFixed(2))} />
              <Chip label="50%" val={Number((max * 0.5).toFixed(2))} />
              <Chip label="Full" val={Number(max.toFixed(2))} />
              <Chip label="Round ₊5" val={Math.min(max, Math.round((amount + 5) / 5) * 5)} />
            </div>
          </div>

          {/* footer */}
          <div className="px-6 py-4 border-t bg-white rounded-b-[28px]"
               style={{ borderColor: "var(--grad-end-soft)" }}>
            {valid && (
              <div className="rounded-xl border p-3 mb-3 space-y-1" style={{ borderColor: "var(--grad-end-soft)" }}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Your share</span>
                  <span className="text-gray-900">{fmt(amount)} {currency}</span>
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

            {valid && (
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
                <div className="grid grid-cols-4 gap-2 pt-2">
                  {TIP_PRESETS.map((amt) => {
                    const active = tipPreset === amt;
                    const popular = amt === POPULAR_TIP;
                    return (
                      <button
                        key={amt}
                        onClick={() => setTipPreset(active ? null : amt)}
                        aria-label={popular ? `Tip ${amt} ${currency}, most loved` : `Tip ${amt} ${currency}`}
                        className={`relative h-9 rounded-xl text-[12px] font-medium border ${active ? "text-white" : "bg-white text-gray-700"}`}
                        style={active
                          ? { background: "linear-gradient(90deg, var(--grad-start, #7A0026), var(--grad-end, #C91A4D))" }
                          : popular
                            ? { borderColor: "var(--grad-end, #C91A4D)", background: "var(--grad-start-soft)" }
                            : { borderColor: "var(--grad-end-soft)" }}
                      >
                        {popular && (
                          <span
                            className="absolute -top-[9px] left-1/2 -translate-x-1/2 flex items-center gap-[2px] whitespace-nowrap rounded-full border bg-white px-1.5 py-[1px] text-[8px] font-semibold tracking-wide shadow-sm"
                            style={{ borderColor: "var(--grad-end-soft)", color: "var(--grad-end, #C91A4D)" }}
                          >
                            <span className="text-[8px] leading-none">❤️</span>
                            Most loved
                          </span>
                        )}
                        {amt} {currency}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setTipPreset(tipPreset === "custom" ? null : "custom")}
                  className={`mt-2 w-full h-9 rounded-xl text-[12px] font-medium border ${tipPreset === "custom" ? "text-white" : "bg-white text-gray-700"}`}
                  style={tipPreset === "custom"
                    ? { background: "linear-gradient(90deg, var(--grad-start, #7A0026), var(--grad-end, #C91A4D))" }
                    : { borderColor: "var(--grad-end-soft)" }}
                >
                  Custom
                </button>
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

            <div className="text-[12px] text-gray-500 mb-3">
              Inclusive of all taxes and charges
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setVal(0);
                  onRemoveSplit?.();
                }}
                className="flex-1 h-12 rounded-full bg-rose-50 text-rose-600 font-semibold"
              >
                Remove split
              </button>
              <button
                disabled={!valid}
                onClick={() => onConfirm(Number(amount.toFixed(2)), tipAmount)}
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
