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
          "fixed z-50 bottom-6 right-4 sm:right-6 safe-bottom",
          "h-14 rounded-2xl border border-[rgba(58,46,46,0.14)] bg-white/95 px-3.5",
          "inline-flex items-center justify-center gap-3 shadow-[0_14px_32px_rgba(58,46,46,0.18)] backdrop-blur",
          "text-[var(--text-primary)] font-medium",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--grad-end)]/40",
          "hover:shadow-[0_18px_36px_rgba(58,46,46,0.22)] active:scale-[0.98] transition",
          bump ? "animate-bump" : "",
          // If fading instead of removing, disable interactions while open
          fadeInsteadOfRemove && isOpen ? "opacity-0 pointer-events-none scale-95" : "opacity-100",
        ].join(" ")}
      >
        {/* Cart icon + count */}
        <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-[var(--text-primary)] text-white shadow-sm">
          <Icon name="cart" className="h-4 w-4" />
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-5 px-1 rounded-full
                       bg-[var(--grad-end)] text-white text-[11px] font-bold
                       grid place-items-center shadow-sm"
            aria-hidden="true"
          >
            {count}
          </span>
        </span>

        {/* Label & total */}
        <div className="text-left leading-tight">
          <div className="text-[11px] text-[var(--text-secondary)]">{t("floating_cart.view")}</div>
          <div className="text-sm font-semibold text-[var(--text-primary)]">{formatAED(total)}</div>
        </div>
      </button>

      {/* a11y live region */}
      <span ref={liveRef} className="sr-only" aria-live="polite" />
    </>
  );
}
