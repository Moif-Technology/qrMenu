import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

const OPTIONS = [
  { value: "pop", labelKey: "menu.sort_popular" },
  { value: "priceAsc", labelKey: "menu.sort_price_asc" },
  { value: "priceDesc", labelKey: "menu.sort_price_desc" },
];

export default function FilterBar({ sort, onSort }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const containerRef = useRef(null);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    }
  };

  useEffect(() => {
    if (open) updatePosition();
  }, [open]);

  useEffect(() => {
    const handler = (e) => {
      if (
        containerRef.current?.contains(e.target) ||
        triggerRef.current?.contains(e.target)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = OPTIONS.find((o) => o.value === sort) || OPTIONS[0];

  const dropdownEl = open ? (
    <ul
      ref={containerRef}
      role="listbox"
      className="fixed py-1.5 rounded-xl bg-white shadow-xl border overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        zIndex: 99999,
        borderColor: "rgba(139,111,71,0.2)",
      }}
    >
      {OPTIONS.map((opt) => {
        const isSelected = sort === opt.value;
        return (
          <li key={opt.value} role="option" aria-selected={isSelected}>
            <button
              type="button"
              onClick={() => {
                onSort(opt.value);
                setOpen(false);
              }}
              className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors
                ${isSelected ? "text-white" : "text-gray-800 hover:bg-gray-50"}`}
              style={
                isSelected
                  ? {
                      background:
                        "linear-gradient(120deg, var(--grad-start), var(--grad-end))",
                    }
                  : {}
              }
            >
              {t(opt.labelKey)}
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      <div className="flex flex-col gap-3 rounded-[20px] border border-white/70 bg-white/85 px-4 py-3 shadow-[0_12px_28px_rgba(58,46,46,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div
          className="text-xs font-semibold uppercase tracking-[0.28em]"
          style={{ letterSpacing: "0.28em", color: "var(--text-secondary)" }}
        >
          {t("menu.service_standard")}
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("menu.sort_by")}
          </span>
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen(!open)}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={t("menu.sort_by")}
              className="flex items-center justify-between w-full min-w-[180px] min-h-[42px] pl-4 pr-10 py-2.5 rounded-xl
                border bg-white text-sm font-medium text-gray-800
                shadow-sm hover:shadow transition-shadow
                focus:outline-none focus:ring-2 focus:ring-[var(--grad-end)]/40 focus:border-[var(--grad-end)]
                cursor-pointer text-left"
              style={{ borderColor: "rgba(139,111,71,0.35)" }}
            >
              <span>{t(selected.labelKey)}</span>
              <ChevronDown
                className={`absolute right-3 w-4 h-4 text-[var(--grad-end)] transition-transform ${
                  open ? "rotate-180" : ""
                }`}
                strokeWidth={2.5}
                aria-hidden
              />
            </button>
          </div>
        </div>
      </div>
      {createPortal(dropdownEl, document.body)}
    </div>
  );
}
