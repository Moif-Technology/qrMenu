// src/components/FloatingCartButton.jsx
import { useEffect, useState, useRef } from "react";
import { useCart } from "../store/cartStore";
import { formatAED } from "../utils/currency";
import Icon from "./Icon";
import { useTranslation } from "react-i18next";

export default function FloatingCartButton({
  onClick,
  isOpen = false,         // ← pass your cart open state
  fadeInsteadOfRemove = false, // true = fade/disable; false = unmount
}) {
  const count = useCart((s) => s.items.reduce((n, x) => n + x.qty, 0));
  const total = useCart((s) => s.items.reduce((sum, x) => sum + x.price * x.qty, 0));
  const { t } = useTranslation();

  const [bump, setBump] = useState(false);
  const liveRef = useRef(null);

  useEffect(() => {
    if (count > 0) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 320);
      return () => clearTimeout(t);
    }
  }, [count]);

  useEffect(() => {
    if (liveRef.current) {
      liveRef.current.textContent = t("floating_cart.live", {
        count,
        total: formatAED(total),
      });
    }
  }, [count, total, t]);

  // Unmount entirely when open (recommended)
  if (!count || (!fadeInsteadOfRemove && isOpen)) return null;

  return (
    <>
      <button
        onClick={onClick}
        title={t("floating_cart.view")}
        aria-expanded={isOpen ? true : false}
        className={[
          "fixed z-50 bottom-6 left-1/2 -translate-x-1/2 safe-bottom",
          "rounded-full h-12 px-5 sm:px-6 shadow-xl ring-1 ring-black/5",
          "inline-flex items-center justify-center gap-3",
          "text-white font-medium",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
          "hover:shadow-2xl active:scale-[0.98] transition",
          bump ? "animate-bump" : "",
          // If fading instead of removing, disable interactions while open
          fadeInsteadOfRemove && isOpen ? "opacity-0 pointer-events-none scale-95" : "opacity-100",
        ].join(" ")}
        style={{ background: "linear-gradient(90deg,var(--grad-start),var(--grad-end))" }}
      >
        {/* Cart icon + count badge */}
        <span className="relative grid place-items-center h-9 w-9 rounded-full bg-white/15">
          <Icon name="cart" className="h-5 w-5" />
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-5 px-1 rounded-full
                       bg-white text-slate-900 text-[11px] font-bold
                       grid place-items-center shadow-sm"
            aria-hidden="true"
          >
            {count}
          </span>
        </span>

        {/* Centered label & total */}
        <div className="text-center leading-tight">
          <div className="text-[11px] opacity-90">{t("floating_cart.view")}</div>
          <div className="text-sm font-semibold">{formatAED(total)}</div>
        </div>
      </button>

      {/* a11y live region */}
      <span ref={liveRef} className="sr-only" aria-live="polite" />
    </>
  );
}
