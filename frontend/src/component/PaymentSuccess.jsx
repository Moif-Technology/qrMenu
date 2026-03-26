// src/component/PaymentSuccess.jsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import Lottie from "lottie-react";
import successAnimation from "../assets/anim/success.json";

export default function PaymentSuccess({ open, onClose, paymentData }) {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const lottieRef = useRef(null);

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

  const amountPaid = Number(paymentData.amountPaid || paymentData.totalPaid || 0);
  const paymentId  = String(paymentData.paymentId || paymentData.PaymentID || "—");
  const now        = new Date();
  const dateStr    = now.toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr    = now.toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" });

  const handleViewMenu = () => { onClose(); navigate("/"); };
  const handleClose    = () => { onClose(); window.location.reload(); };

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

      {/* Sheet */}
      <div
        className={`
          relative w-full sm:max-w-sm bg-white
          rounded-t-[2rem] sm:rounded-[2rem]
          shadow-2xl overflow-hidden
          transition-transform duration-400 ease-out
          ${visible ? "translate-y-0" : "translate-y-full sm:translate-y-8"}
        `}
      >
        {/* Drag handle — mobile only */}
        <div className="pt-3 flex justify-center sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

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
            Thank you for dining with us
          </p>
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

        {/* ── Actions ───────────────────────────────────── */}
        <div className="px-5 pb-6 space-y-2">
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

        {/* Safe area spacer for notched phones */}
        <div className="h-2" />
      </div>
    </div>,
    document.body
  );
}
