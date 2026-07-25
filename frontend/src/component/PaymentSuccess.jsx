// src/component/PaymentSuccess.jsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import Lottie from "lottie-react";
import { toPng } from "html-to-image";
import successAnimation from "../assets/anim/success.json";

const MODE_LABELS = {
  "pay-full": "Full Payment",
  "split-equal": "Equal Split",
  "split-items": "Item Split",
  "split-custom": "Custom Split",
};

export default function PaymentSuccess({ open, onClose, paymentData }) {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const lottieRef = useRef(null);
  const receiptRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Small delay so the slide-up animation triggers after mount
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      if (lottieRef.current) lottieRef.current.goToAndPlay(0);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 400);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted || !paymentData) return null;

  const amountPaid       = Number(paymentData.amountPaid || paymentData.totalPaid || 0);
  const paymentId        = String(paymentData.paymentId || paymentData.PaymentID || "—");
  const serviceFeeAmount = Number(paymentData.serviceFeeAmount || 0);
  const tipAmount        = Number(paymentData.tipAmount || 0);
  const billAmount       = paymentData.billAmount != null
    ? Number(paymentData.billAmount)
    : amountPaid - serviceFeeAmount - tipAmount;
  const items      = Array.isArray(paymentData.items) ? paymentData.items : [];
  const splitInfo  = paymentData.splitInfo || null;
  const modeLabel  = MODE_LABELS[paymentData.mode] || null;
  const now        = new Date();
  const dateStr    = now.toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr    = now.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" });

  const handleViewMenu = () => { onClose(); navigate("/"); };
  const handleClose    = () => { onClose(); window.location.reload(); };

  const handleDownload = async () => {
    if (!receiptRef.current || downloading) return;
    setDownloading(true);
    // Wait two frames so the "capturing" layout (uncapped item list,
    // name+qty-only rows) is painted before toPng reads the DOM.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const dataUrl = await toPng(receiptRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `receipt-${paymentId !== "—" ? paymentId : Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Receipt download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-400 ${visible ? "opacity-100" : "opacity-0"}`}
      />

      {/* Sheet + below-sheet actions, stacked and moving together */}
      <div
        className={`
          relative w-full sm:max-w-sm flex flex-col items-stretch
          transition-all duration-400 ease-out
          ${visible ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-full opacity-0 sm:translate-y-0 sm:scale-95"}
        `}
      >
      <div
        className="
          relative bg-white flex flex-col
          rounded-t-[2rem] sm:rounded-[2rem]
          shadow-2xl ring-1 ring-black/5
          max-h-[85vh] sm:max-h-[80vh] overflow-hidden
        "
      >
        {/* Drag handle — mobile only */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div
          className="overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
        <div ref={receiptRef} className="bg-white">
          {/* ── Lottie + amount ───────────────────────────── */}
          <div className="px-6 pt-2 pb-4 flex flex-col items-center text-center">
            <div className="w-28 h-28">
              <Lottie
                lottieRef={lottieRef}
                animationData={successAnimation}
                loop={false}
                autoplay
                style={{ width: "100%", height: "100%" }}
              />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 -mt-1 mb-1 tracking-tight">
              Payment Complete
            </h2>
            <p className="text-sm text-gray-400">
              {paymentData.brand || "Thank you for dining with us"}
            </p>
            {(paymentData.tableLabel || modeLabel) && (
              <p className="text-xs text-gray-400 mt-0.5">
                {[paymentData.tableLabel, modeLabel].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {/* ── Receipt card ──────────────────────────────── */}
          <div className="mx-5 mb-5">
            {/* Torn-edge top */}
            <div
              className="h-3 bg-gray-50 border border-b-0 border-gray-100 rounded-t-xl"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% -1px, white 6px, transparent 7px)",
                backgroundSize: "18px 12px",
                backgroundRepeat: "repeat-x",
              }}
            />

            <div className="bg-gray-50 border-x border-gray-100 px-5 py-4 space-y-3">
              {/* Itemized list — compact scroll panel on screen; during
                  download it's swapped to an uncapped, name+qty-only list
                  so the exported receipt stays small regardless of item count. */}
              {items.length > 0 && (
                <>
                  <div
                    className={
                      downloading
                        ? "space-y-1"
                        : "space-y-2 max-h-40 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                    }
                  >
                    {items.map((it, i) =>
                      downloading ? (
                        <div key={i} className="text-xs text-gray-700">
                          <span className="text-gray-400 mr-1">{Number(it.qty) || 1}×</span>
                          {it.name}
                        </div>
                      ) : (
                        <div key={i} className="flex items-start justify-between gap-3 text-xs">
                          <span className="text-gray-700 flex-1">
                            <span className="text-gray-400 mr-1">{Number(it.qty) || 1}×</span>
                            {it.name}
                          </span>
                          <span className="text-gray-900 font-medium tabular-nums shrink-0">
                            {Number(it.total || 0).toFixed(2)}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                  <div className="border-t border-dashed border-gray-200" />
                </>
              )}

              {splitInfo && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Split</span>
                    <span className="text-gray-700 font-medium">
                      Your share · 1 of {splitInfo.numberOfPeople}
                    </span>
                  </div>
                  <div className="border-t border-dashed border-gray-200" />
                </>
              )}

              {/* Bill / Fee / Tip breakdown */}
              {(items.length > 0 || serviceFeeAmount > 0 || tipAmount > 0) && (
                <>
                  <div className="space-y-1.5">
                    {billAmount > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Bill</span>
                        <span className="text-gray-700 tabular-nums">{billAmount.toFixed(2)} AED</span>
                      </div>
                    )}
                    {serviceFeeAmount > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Service Fee</span>
                        <span className="text-gray-700 tabular-nums">{serviceFeeAmount.toFixed(2)} AED</span>
                      </div>
                    )}
                    {tipAmount > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Tip</span>
                        <span className="text-gray-700 tabular-nums">{tipAmount.toFixed(2)} AED</span>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-dashed border-gray-200" />
                </>
              )}

              {/* Amount */}
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Amount Paid</span>
                <span className="text-2xl font-bold text-gray-900 tabular-nums">
                  {amountPaid.toFixed(2)}{" "}
                  <span className="text-sm font-semibold text-gray-400">AED</span>
                </span>
              </div>

              <div className="border-t border-dashed border-gray-200" />

              {/* Date / Time */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Date</span>
                <span className="text-gray-700 font-medium">{dateStr} · {timeStr}</span>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Status</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  Paid
                </span>
              </div>

              <div className="border-t border-dashed border-gray-200" />

              {/* Payment ID */}
              <div className="space-y-1">
                <span className="text-xs text-gray-400">Reference ID</span>
                <div
                  className="text-[11px] font-mono text-gray-500 break-all leading-relaxed bg-white rounded-lg px-3 py-2 border border-gray-100 select-all"
                >
                  {paymentId}
                </div>
              </div>
            </div>

            {/* Torn-edge bottom */}
            <div
              className="h-3 bg-gray-50 border border-t-0 border-gray-100 rounded-b-xl"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 13px, white 6px, transparent 7px)",
                backgroundSize: "18px 12px",
                backgroundRepeat: "repeat-x",
              }}
            />
          </div>
        </div>
        </div>

        {/* ── Actions — sticky footer, stays put while content scrolls ── */}
        <div className="shrink-0 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-2 border-t border-gray-100 bg-white">
          <button
            onClick={handleViewMenu}
            className="w-full h-12 rounded-xl bg-gray-900 text-white text-sm font-semibold tracking-wide hover:bg-gray-800 active:scale-[0.98] transition-all"
          >
            View Menu
          </button>
          <button
            onClick={handleClose}
            className="w-full h-11 rounded-xl text-gray-500 text-sm font-medium hover:text-gray-700 hover:bg-gray-100 active:scale-[0.98] transition-all"
          >
            Close
          </button>
        </div>
      </div>

        {/* ── Download Receipt — floats below the sheet, same width, moves with it ── */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="mt-3 mb-[max(1rem,env(safe-area-inset-bottom))] w-full h-11 rounded-xl bg-white/90 backdrop-blur-md text-gray-700 text-sm font-semibold shadow-lg border border-white/60 hover:bg-white active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          {downloading ? "Preparing…" : "Download Receipt"}
        </button>
      </div>
    </div>,
    document.body
  );
}
