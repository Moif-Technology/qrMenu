// src/component/OrderSuccess.jsx
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useCart } from "../store/cartStore";
import { useUI } from "../store/uiStore";

/** One detail row in the receipt card */
function DetailRow({ icon, label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-base">
          {icon}
        </span>
        <span className="text-sm font-semibold text-gray-500">{label}</span>
      </div>
      <span
        className={
          highlight
            ? "text-base font-extrabold text-emerald-700"
            : "text-base font-bold text-gray-900"
        }
      >
        {String(value)}
      </span>
    </div>
  );
}

export default function OrderSuccess() {
  const successOpen = useUI((s) => s.successOpen);
  const lastOrder = useUI((s) => s.lastOrder);
  const hideSuccess = useUI((s) => s.hideSuccess);
  const showAddMoreOptions = useUI((s) => s.showAddMoreOptions);
  const navigate = useNavigate();
  const { token } = useCart();

  // mount/unmount so we can play an exit transition
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let t;
    if (successOpen) {
      setMounted(true);
      // next frame -> trigger enter transition
      t = requestAnimationFrame(() => setShow(true));
      return () => cancelAnimationFrame(t);
    }
    if (mounted) {
      setShow(false);
      t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [successOpen, mounted]);

  if (!mounted) return null;

  const {
    kotId,
    tableId,
    itemsCount = 0,
    subtotal = 0,
    currency = "AED",
    etaMin,
  } = lastOrder || {};

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      {/* keyframes for the check draw + confetti */}
      <style>{`
        @keyframes os-pop { 0% { transform: scale(0); } 60% { transform: scale(1.12); } 100% { transform: scale(1); } }
        @keyframes os-draw { to { stroke-dashoffset: 0; } }
        @keyframes os-ring { 0% { transform: scale(.7); opacity: .6; } 100% { transform: scale(1.7); opacity: 0; } }
        @keyframes os-float { 0% { transform: translateY(8px) scale(.6); opacity: 0; } 40% { opacity: 1; } 100% { transform: translateY(-18px) scale(1); opacity: 1; } }
        .os-tick { stroke-dasharray: 30; stroke-dashoffset: 30; animation: os-draw .5s .25s ease forwards; }
      `}</style>

      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity duration-300 ${
          show ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl transition-all duration-300 sm:rounded-3xl ${
          show ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-6 opacity-0 sm:scale-95"
        }`}
      >
        {/* Header band */}
        <div className="relative bg-gradient-to-br from-emerald-500 to-teal-600 px-6 pb-10 pt-9 text-center">
          {/* confetti */}
          <span className="pointer-events-none absolute left-8 top-6 text-xl" style={{ animation: "os-float .9s .3s ease forwards", opacity: 0 }}>🎉</span>
          <span className="pointer-events-none absolute right-9 top-8 text-lg" style={{ animation: "os-float .9s .45s ease forwards", opacity: 0 }}>✨</span>
          <span className="pointer-events-none absolute right-12 top-16 text-base" style={{ animation: "os-float .9s .6s ease forwards", opacity: 0 }}>⭐</span>

          {/* check badge */}
          <div className="relative mx-auto grid h-20 w-20 place-items-center">
            <span className="absolute inset-0 rounded-full bg-white/40" style={{ animation: "os-ring 1.1s .2s ease-out forwards" }} />
            <div
              className="relative grid h-20 w-20 place-items-center rounded-full bg-white shadow-lg"
              style={{ animation: "os-pop .5s ease-out forwards" }}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-emerald-600">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="os-tick"
                />
              </svg>
            </div>
          </div>

          <h2 className="mt-4 text-2xl font-black text-white">Sent to Kitchen!</h2>
          <p className="mt-1 text-sm font-medium text-emerald-50">
            {etaMin ? `Ready in approx. ${etaMin} min` : "Your order is being prepared now."}
          </p>
        </div>

        {/* Receipt body — pulled up over the band */}
        <div className="relative -mt-5 rounded-t-3xl bg-white px-6 pb-6 pt-2">
          <div className="divide-y divide-gray-100">
            <DetailRow icon="📍" label="Table" value={tableId ? `Table ${tableId}` : "—"} />
            <DetailRow icon="📦" label="New items" value={itemsCount} />
            <DetailRow icon="💰" label="Total" value={`${currency} ${Number(subtotal).toFixed(2)}`} highlight />
            {kotId && <DetailRow icon="📋" label="Order ID" value={`#${kotId}`} />}
          </div>

          {/* Actions */}
          {showAddMoreOptions ? (
            <div className="mt-6 space-y-3">
              <p className="text-center text-sm font-semibold text-gray-500">
                Add more items to this order?
              </p>
              <button
                type="button"
                onClick={hideSuccess}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white shadow-md shadow-emerald-600/20 transition active:scale-[.98]"
              >
                Yes, add more items <span aria-hidden>→</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  hideSuccess();
                  if (token) {
                    navigate(`/r/${token}`);
                  } else {
                    alert("Payment page is not available. Please scan the QR code again to view your orders.");
                  }
                }}
                className="w-full rounded-2xl border-2 border-emerald-200 py-3.5 text-base font-bold text-emerald-700 transition active:scale-[.98]"
              >
                No, go to payment
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={hideSuccess}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white shadow-md shadow-emerald-600/20 transition active:scale-[.98]"
            >
              Got it! <span aria-hidden>→</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
