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
  const serviceParts = t("menu.service_standard")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const [primaryService, secondaryService] = serviceParts;

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
      className="fixed overflow-hidden rounded-xl border bg-[#fbfaf7] p-1.5 shadow-[0_22px_50px_-30px_rgba(48,36,28,0.82)]"
      style={{
        top: position.top + 4,
        left: position.left,
        width: position.width,
        zIndex: 99999,
        borderColor: "rgba(92,74,61,0.18)",
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
              className={`w-full rounded-lg px-4 py-3 text-left text-sm font-semibold transition duration-200
                ${isSelected ? "text-white" : "text-gray-800 hover:bg-[rgba(92,74,61,0.07)]"}`}
              style={
                isSelected
                  ? {
                      background: "#342825",
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
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(92,74,61,0.12)] pb-3">
        <div className="min-w-0 text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--text-primary)" }}>
          <span>{primaryService || t("menu.service_standard")}</span>
          {secondaryService && (
            <>
              <span className="mx-2 text-[rgba(92,74,61,0.42)]" aria-hidden="true">|</span>
              <span>{secondaryService}</span>
            </>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(!open)}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={t("menu.sort_by")}
            className="flex min-h-[34px] items-center gap-2 rounded-lg border border-[rgba(92,74,61,0.16)]
              bg-white/75 px-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-white
              focus:outline-none focus:ring-2 focus:ring-[var(--grad-end)]/30 cursor-pointer"
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
              {t("menu.sort_by")}
            </span>
            <span>{t(selected.labelKey)}</span>
            <ChevronDown
              className={`w-4 h-4 text-[var(--grad-end)] transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
              strokeWidth={2.5}
              aria-hidden
            />
          </button>
        </div>
      </div>
      {createPortal(dropdownEl, document.body)}
    </div>
  );
}
