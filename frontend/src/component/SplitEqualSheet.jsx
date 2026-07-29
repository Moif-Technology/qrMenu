import React, { useEffect, useState, useMemo } from "react";

import { POPULAR_TIP, TIP_PRESETS } from "../lib/tipOptions";

const fmt = (n) => Number(n || 0).toFixed(2);

export default function SplitEqualSheet({ total = 0, currency = "AED", onClose, onConfirm, equalSplitInfo = null, serviceFeeRate = 0 }) {
  const [count, setCount] = useState(2);
  const [shares, setShares] = useState([]);
  const [tipPreset, setTipPreset] = useState(null); // number | "custom" | null
  const [customTip, setCustomTip] = useState("");

  // Initialise count once on mount.
  // In continuation mode start at 1 so the current person decides how many
  // are splitting the REMAINING balance with them.
  useEffect(() => {
    if (equalSplitInfo?.numberOfPeople) {
      // Default to 1: one person (this screen's user) paying their share now.
      // They can tap + to split the remaining balance with more people.
      setCount(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalculate shares whenever count or total changes.
  // Always divides `total` evenly — never uses equalSplitInfo.amountPerPerson
  // so that continuation mode works correctly for any number of people.
  useEffect(() => {
    const n = Math.max(count, 1);
    const eq = Math.round((total / n) * 100) / 100;
    const arr = Array.from({ length: n }, (_, i) => ({
      label: `Person ${i + 1}`,
      amount: i === n - 1 ? +(total - eq * (n - 1)).toFixed(2) : eq,
    }));
    setShares(arr);
  }, [count, total]);

  const sum = useMemo(() => shares.reduce((a, s) => a + (+s.amount || 0), 0), [shares]);
  const diff = Math.round((total - sum) * 100) / 100;
  const ok = Math.abs(diff) < 0.01;

  // Fee + tip preview for THIS person's own share (shares[0] = "pays now").
  // Fee is display-only here — the backend always recomputes it from the live
  // DB rate at charge time, this is just so the guest sees the real total
  // before tapping pay.
  const myShare = Number(shares[0]?.amount || 0);
  const tipAmount = tipPreset === "custom"
    ? Math.max(0, Number(customTip) || 0)
    : Number(tipPreset) || 0;
  // Fee base is share + tip, same formula the backend charges on.
  const myFee = Math.round((myShare + tipAmount) * serviceFeeRate * 100) / 100;
  const baseDue = myShare + myFee;
  const totalToPay = baseDue + tipAmount;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto w-full max-w-md rounded-t-3xl bg-white shadow-2xl border-t"
             style={{ borderColor: "var(--grad-end-soft)" }}>
          <div className="pt-3">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-200" />
          </div>

          <div className="px-6 pt-3 pb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {equalSplitInfo ? "Split remaining balance" : "Divide the bill equally"}
            </h3>
            <button onClick={onClose} className="h-9 w-9 grid place-items-center rounded-full text-gray-500 hover:bg-gray-100">×</button>
          </div>

          {equalSplitInfo && (
            <div className="px-6 pb-3 space-y-2">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="text-sm text-blue-900 font-medium mb-1">Equal split in progress</div>
                <div className="text-xs text-blue-700 space-y-0.5">
                  <div>Original split: {equalSplitInfo.numberOfPeople} people · {fmt(equalSplitInfo.amountPerPerson)} {currency} per person</div>
                  <div>Remaining to pay: <span className="font-semibold">{fmt(total)} {currency}</span></div>
                </div>
              </div>
              <p className="text-xs text-gray-500 px-1">
                Choose how many people are splitting this remaining amount. Each person will pay their share one at a time.
              </p>
            </div>
          )}

          <div className="px-6 pb-4">
            {/* People Counter */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4 border" style={{ borderColor: "var(--grad-end-soft)" }}>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setCount(Math.max(1, count - 1))}
                  className="btn-pill-outline w-10 h-10 rounded-xl"
                >
                  −
                </button>
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">{count}</div>
                  <div className="text-sm text-gray-600">{count === 1 ? "person" : "people"}</div>
                </div>
                <button
                  onClick={() => setCount(Math.min(8, count + 1))}
                  className="btn-pill-outline w-10 h-10 rounded-xl"
                >
                  +
                </button>
              </div>
            </div>

            {/* Amounts */}
            <div className="grid gap-2 mb-3">
              {shares.map((s, i) => (
                <div key={i} className="flex items-center justify-between border rounded-xl p-2"
                     style={{ borderColor: "var(--grad-end-soft)" }}>
                  <div>
                    <span className="font-medium text-gray-800">{s.label}</span>
                    {i === 0 && equalSplitInfo && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">pays now</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={s.amount}
                      onChange={(e) => {
                        const next = shares.slice();
                        next[i] = { ...next[i], amount: +e.target.value || 0 };
                        setShares(next);
                      }}
                      className="w-24 input text-right"
                    />
                    <span className="text-xs text-gray-600">{currency}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Validation */}
            <div className={`p-3 rounded-lg text-center mb-3 ${ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {ok ? "✓ Amounts match perfectly" : `Difference: ${fmt(diff)} ${currency}`}
            </div>

            {/* Your share breakdown (fee always applies, tip optional) */}
            {ok && myShare > 0 && (
              <div className="rounded-xl border p-3 mb-3 space-y-1" style={{ borderColor: "var(--grad-end-soft)" }}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Your share</span>
                  <span className="text-gray-900">{fmt(myShare)} {currency}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Service fee</span>
                  <span className="text-gray-900">{fmt(myFee)} {currency}</span>
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

            {/* Tip (optional, applies to this person's share only) */}
            {ok && myShare > 0 && (
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
                        className={`relative h-9 rounded-xl text-[12px] font-medium border ${active ? "btn text-white" : "bg-white text-gray-700"}`}
                        style={
                          active
                            ? {}
                            : popular
                              ? { borderColor: "var(--grad-end)", background: "var(--grad-start-soft)" }
                              : { borderColor: "var(--grad-end-soft)" }
                        }
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
                  className={`mt-2 w-full h-9 rounded-xl text-[12px] font-medium border ${tipPreset === "custom" ? "btn text-white" : "bg-white text-gray-700"}`}
                  style={tipPreset === "custom" ? {} : { borderColor: "var(--grad-end-soft)" }}
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

            <div className="space-y-2">
              <button
                disabled={!ok}
                onClick={() => onConfirm(shares, tipAmount)}
                className="btn w-full h-12 rounded-xl disabled:opacity-50"
              >
                {equalSplitInfo
                  ? count === 1
                    ? `Pay ${fmt(totalToPay)} ${currency}`
                    : `Pay my share · ${fmt(totalToPay)} ${currency}`
                  : `Confirm equal split · Pay ${fmt(totalToPay)} ${currency}`}
              </button>

              {equalSplitInfo && (
                <button
                  onClick={onClose}
                  className="w-full btn-pill-outline h-10 rounded-xl text-sm"
                >
                  Use another payment method
                </button>
              )}
            </div>
          </div>

          <div className="h-3 safe-bottom" />
        </div>
      </div>
    </div>
  );
}
