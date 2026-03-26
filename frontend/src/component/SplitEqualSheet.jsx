import React, { useEffect, useState, useMemo } from "react";

const fmt = (n) => Number(n || 0).toFixed(2);

export default function SplitEqualSheet({ total = 0, currency = "AED", onClose, onConfirm, equalSplitInfo = null }) {
  const [count, setCount] = useState(2);
  const [shares, setShares] = useState([]);

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

            <div className="space-y-2">
              <button
                disabled={!ok}
                onClick={() => onConfirm(shares)}
                className="btn w-full h-12 rounded-xl disabled:opacity-50"
              >
                {equalSplitInfo
                  ? count === 1
                    ? `Pay ${fmt(shares[0]?.amount || 0)} ${currency}`
                    : `Pay my share · ${fmt(shares[0]?.amount || 0)} ${currency}`
                  : "Confirm equal split"}
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
