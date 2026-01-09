import { useEffect, useMemo, useState } from "react";

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const fmt = (n) => Number(n || 0).toFixed(2);

export default function SplitCustomAmountSheet({
  total = 0,            // grand total the guest can pay up to
  currency = "AED",
  onClose,              // () => void
  onConfirm,            // (amountNumber) => void
  onRemoveSplit,        // optional: () => void
}) {
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    // optional: prefill with 25%
    setAmount(Number((total * 0.25).toFixed(2)));
  }, [total]);

  const max = useMemo(() => Number(total) || 0, [total]);
  const step = useMemo(() => Math.max(0.01, max / 200), [max]);
  const valid = amount > 0 && amount <= max;

  const setVal = (v) => setAmount(clamp(Number(v || 0), 0, max));

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
            <div className="flex items-center justify-between mb-1">
              <div className="text-[15px] font-medium text-gray-900">Your share</div>
              <div className="text-[15px] font-bold text-gray-900">
                {fmt(amount)} {currency}
              </div>
            </div>
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
                onClick={() => onConfirm(Number(amount.toFixed(2)))}
                className="flex-1 h-12 rounded-full text-white font-semibold disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(90deg, var(--grad-start, #7A0026), var(--grad-end, #C91A4D))",
                }}
              >
                Confirm
              </button>
            </div>

            <div className="h-3 safe-bottom" />
          </div>
        </div>
      </div>
    </div>
  );
}
