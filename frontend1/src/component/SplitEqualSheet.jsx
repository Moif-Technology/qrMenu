import React, { useEffect, useState, useMemo } from "react";

const fmt = (n) => Number(n || 0).toFixed(2);

export default function SplitEqualSheet({ total = 0, currency = "AED", onClose, onConfirm, equalSplitInfo = null }) {
  const [count, setCount] = useState(2);
  const [shares, setShares] = useState([]);

  // If equal split is already in progress, use the existing split info
  useEffect(() => {
    if (equalSplitInfo && equalSplitInfo.amountPerPerson) {
      // Use existing equal split information
      const amountPerPerson = Number(equalSplitInfo.amountPerPerson);
      const numberOfPeople = equalSplitInfo.numberOfPeople || 2;
      setCount(numberOfPeople);
      const arr = Array.from({ length: numberOfPeople }, (_, i) => ({
        label: `Person ${i + 1}`,
        amount: i === numberOfPeople - 1 ? +(total - amountPerPerson * (numberOfPeople - 1)).toFixed(2) : amountPerPerson,
      }));
      setShares(arr);
    } else {
      // New equal split - calculate from total
      const eq = Math.round((total / Math.max(count, 1)) * 100) / 100;
      const arr = Array.from({ length: count }, (_, i) => ({
        label: `Person ${i + 1}`,
        amount: i === count - 1 ? +(total - eq * (count - 1)).toFixed(2) : eq,
      }));
      setShares(arr);
    }
  }, [count, total, equalSplitInfo]);

  const sum = useMemo(() => shares.reduce((a, s) => a + (+s.amount || 0), 0), [shares]);
  const diff = Math.round((total - sum) * 100) / 100;
  const ok = Math.abs(diff) < 0.01;

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
              {equalSplitInfo ? "Continue equal split" : "Divide the bill equally"}
            </h3>
            <button onClick={onClose} className="h-9 w-9 grid place-items-center rounded-full text-gray-500 hover:bg-gray-100">×</button>
          </div>
          
          {equalSplitInfo && (
            <div className="px-6 pb-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="text-sm text-blue-900 font-medium mb-1">Equal split in progress</div>
                <div className="text-xs text-blue-700">
                  {equalSplitInfo.numberOfPeople} people • {fmt(equalSplitInfo.amountPerPerson)} {currency} per person
                </div>
              </div>
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
                  <div className="text-sm text-gray-600">people</div>
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
                  <span className="font-medium text-gray-800">{s.label}</span>
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

            <div className="space-y-2">
              <button
                disabled={!ok}
                onClick={() => onConfirm(shares)}
                className="btn w-full h-12 rounded-xl disabled:opacity-50"
              >
                {equalSplitInfo ? "Continue with equal split" : "Confirm equal split"}
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
