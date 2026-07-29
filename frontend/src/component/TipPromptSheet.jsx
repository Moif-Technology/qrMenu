import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { POPULAR_TIP, TIP_PRESETS } from "../lib/tipOptions";

const fmt = (n) => Number(n || 0).toFixed(2);

// Slider snaps 10 → 100 in 10 AED steps
const SLIDER_MIN = 10;
const SLIDER_MAX = 100;
const SLIDER_STEP = 10;

/**
 * TipPromptSheet – last-chance tip prompt, shown only when the guest taps pay
 * without having chosen a tip on the summary screen. Cancel (backdrop / X)
 * aborts the payment entirely; "Not this time" pays with no tip.
 *
 * The service fee is charged on bill + tip (see telr.routes.js), so the fee —
 * and the total on the pay button — moves as the guest drags the slider. Fee
 * shown here is display-only; the backend recomputes it from the live DB rate.
 *
 * Props:
 *   billAmount     – raw bill for this leg, before fee and tip
 *   serviceFeeRate – fee rate as a fraction (0.031 = 3.1%)
 *   onCancel       – () => void, close without paying
 *   onSkip         – () => void, pay with zero tip
 *   onConfirm      – (tipAmount: number) => void, pay with this tip
 */
export default function TipPromptSheet({ billAmount = 0, serviceFeeRate = 0, currency = "AED", onCancel, onSkip, onConfirm }) {
  const [tip, setTip] = useState(POPULAR_TIP);
  const [customOpen, setCustomOpen] = useState(false);
  const [customTip, setCustomTip] = useState("");

  const value = customOpen ? Math.max(0, Number(customTip) || 0) : tip;
  const total = useMemo(() => {
    const bill = Number(billAmount) || 0;
    const fee = Math.round((bill + value) * (Number(serviceFeeRate) || 0) * 100) / 100;
    return Math.round((bill + fee + value) * 100) / 100;
  }, [billAmount, serviceFeeRate, value]);

  const pickPreset = (amt) => {
    setCustomOpen(false);
    setCustomTip("");
    setTip(amt);
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        <button
          onClick={onCancel}
          aria-label="Close"
          className="absolute top-3 right-3 w-7 h-7 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          ✕
        </button>

        <div className="px-6 pt-7 pb-5 text-center">
          <h3 className="text-[17px] font-semibold text-gray-900">✨ One Last Thought...</h3>
          <p className="mt-1 text-[13px] text-gray-500 leading-relaxed">
            A small gesture can make someone's day.
          </p>

          {/* Live tip amount - labelled so it is never read as the bill total,
              which lives on the pay button below (bill + fee + tip). */}
          <div className="mt-5">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
              Your tip
            </div>
            <div className="mt-1 flex items-baseline justify-center gap-1">
              <span
                className="text-[34px] font-semibold leading-none tabular-nums"
                style={{ color: value > 0 ? "var(--grad-end, #C91A4D)" : "#9CA3AF" }}
              >
                {fmt(value)}
              </span>
              <span className="text-[13px] font-medium text-gray-400">{currency}</span>
            </div>
          </div>

          {/* Slider */}
          <input
            type="range"
            list="tip-slider-ticks"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={SLIDER_STEP}
            value={Math.min(Math.max(value, SLIDER_MIN), SLIDER_MAX)}
            onChange={(e) => {
              setCustomOpen(false);
              setCustomTip("");
              setTip(Number(e.target.value));
            }}
            aria-label="Tip amount"
            className="mt-4 w-full h-2 cursor-pointer"
            style={{ accentColor: "var(--grad-end, #C91A4D)" }}
          />
          <datalist id="tip-slider-ticks">
            {Array.from({ length: (SLIDER_MAX - SLIDER_MIN) / SLIDER_STEP + 1 }, (_, i) => SLIDER_MIN + i * SLIDER_STEP).map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <div className="flex justify-between text-[10px] text-gray-400 px-[2px]">
            <span>{SLIDER_MIN} {currency}</span>
            <span>{SLIDER_MAX} {currency}</span>
          </div>

          {/* Presets */}
          <div className="mt-4 grid grid-cols-4 gap-2 pt-2">
            {TIP_PRESETS.map((amt) => {
              const active = !customOpen && tip === amt;
              const popular = amt === POPULAR_TIP;
              return (
                <button
                  key={amt}
                  onClick={() => pickPreset(amt)}
                  aria-pressed={active}
                  aria-label={popular ? `Tip ${amt} ${currency}, most loved` : `Tip ${amt} ${currency}`}
                  className={`relative h-9 rounded-xl text-[12px] font-medium border ${active ? "text-white border-transparent" : "bg-white text-gray-700"}`}
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
                  {amt}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setCustomOpen((v) => {
              // Leaving custom entry: fall back to the default preset so the
              // slider, chips and the amount on the pay button agree again.
              if (v) { setCustomTip(""); setTip(POPULAR_TIP); }
              return !v;
            })}
            aria-pressed={customOpen}
            className={`mt-2 w-full h-9 rounded-xl text-[12px] font-medium border ${customOpen ? "text-white border-transparent" : "bg-white text-gray-700"}`}
            style={customOpen
              ? { background: "linear-gradient(90deg, var(--grad-start, #7A0026), var(--grad-end, #C91A4D))" }
              : { borderColor: "var(--grad-end-soft)" }}
          >
            Custom amount
          </button>

          {customOpen && (
            <div
              className="mt-2 flex items-center rounded-xl border bg-white pl-4 pr-2 h-10 shadow-sm"
              style={{ borderColor: "var(--grad-end-soft)" }}
            >
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                autoFocus
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                placeholder="Enter tip amount"
                className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
              />
              <span className="text-[11px] font-semibold text-gray-500 shrink-0">{currency}</span>
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={() => (value > 0 ? onConfirm?.(value) : onSkip?.())}
            className="btn-pill w-full h-12 text-[15px] font-semibold"
          >
            Pay {fmt(total)} {currency}
          </button>
          <button
            onClick={onSkip}
            aria-label="Continue without a tip"
            className="mt-2 w-full h-11 flex items-center justify-center gap-2 rounded-full border bg-white text-[13px] font-medium text-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 hover:text-gray-900 active:scale-[0.98]"
            style={{ borderColor: "var(--grad-end-soft)" }}
          >
            <span aria-hidden="true" className="text-[15px] leading-none">
              👎
            </span>
            Not this time
          </button>
        </div>

        <div className="safe-bottom" />
      </div>
    </div>,
    document.body
  );
}
