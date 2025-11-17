import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { useTranslation } from "react-i18next";

export default function SearchBar({ value, onChange, variant = "default" }) {
  const { t } = useTranslation();
  const hints = useMemo(() => t("search.examples", { returnObjects: true }), [t]);
  const trending = useMemo(() => (Array.isArray(hints) ? hints.slice(0, 4) : []), [hints]);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!Array.isArray(hints) || hints.length === 0) return () => {};
    const id = setInterval(() => setI((p) => (p + 1) % hints.length), 2800);
    return () => clearInterval(id);
  }, [hints]);

  const inputRef = useRef(null);

  const hero = variant === "hero";
  const placeholderText = t("search.placeholder", {
    example: Array.isArray(hints) && hints.length > 0 ? hints[i] : "",
  });
  const [recent, setRecent] = useState([]);

  const handleKeyDown = (event) => {
    if (event.key !== "Enter") return;
    const term = value.trim();
    if (!term) {
      inputRef.current?.blur();
      return;
    }
    setRecent((prev) => {
      const deduped = prev.filter((item) => item.toLowerCase() !== term.toLowerCase());
      return [term, ...deduped].slice(0, 5);
    });
    window.requestAnimationFrame(() => {
      inputRef.current?.blur();
    });
  };

  const containerClasses = hero
    ? "relative px-4 sm:px-6 pb-1 pt-4 flex justify-center"
    : "py-3 px-4 flex justify-center";

  const shellClasses = hero
    ? "relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/60 bg-white/90 backdrop-blur-xl shadow-[0_22px_50px_rgba(122,0,38,0.14)]"
    : "relative w-full max-w-xl";

  const inputClasses = hero
    ? "w-full h-[52px] sm:h-[58px] pl-14 pr-16 rounded-full bg-white ring-1 ring-white/70 shadow-sm outline-none text-sm sm:text-base focus:ring-2 focus:ring-[var(--grad-end)] placeholder:text-gray-500"
    : "w-full h-12 pl-11 pr-12 rounded-full bg-white ring-1 ring-gray-200 shadow-sm outline-none focus:ring-2 focus:ring-blue-500/50 text-sm placeholder:text-gray-400";

  const iconClasses = hero
    ? "left-5 h-[22px] w-[22px] text-[var(--grad-start)]"
    : "left-4 h-[20px] w-[20px] text-gray-500/80";

  const clearButtonClasses = hero ? "right-4 p-2 hover:bg-white/80" : "right-3 p-1.5 hover:bg-gray-100";

  return (
    <div className={containerClasses}>
      {hero && (
        <div
          className="pointer-events-none absolute inset-x-4 sm:inset-x-6 top-0 h-full rounded-[32px] bg-[radial-gradient(120%_120%_at_50%_-35%,rgba(201,26,77,0.18),transparent_68%)]"
          aria-hidden
        />
      )}

      <div className={shellClasses} role="search">
        <div className="relative z-10 px-4 pt-5 pb-4 sm:px-6 sm:pt-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.32em] text-gray-400"
                style={{ letterSpacing: "0.32em" }}
              >
                {t("search.trending_label")}
              </p>
              <h2 className="mt-1 text-xl sm:text-2xl font-semibold leading-tight text-slate-900">
                {t("search.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500">{t("search.subtitle")}</p>
            </div>
            <div className="hidden sm:flex">
              <div className="rounded-full bg-[var(--grad-start-soft)] p-3 text-[var(--grad-start)] shadow-inner">
                <Icon name="sparkles" className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="relative mt-3">
            <input
              aria-label="Search menu"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholderText}
              className={inputClasses}
              ref={inputRef}
            />

            <Icon
              name="search"
              strokeWidth={2.2}
              absoluteStrokeWidth
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${iconClasses} transition`}
            />

            {value && (
              <button
                onClick={() => onChange("")}
                aria-label="Clear search"
                className={`absolute top-1/2 -translate-y-1/2 rounded-full text-gray-400 hover:text-gray-700 ${clearButtonClasses}`}
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            )}
          </div>

          {hero && trending.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {trending.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => onChange(hint)}
                  className="rounded-full border border-[rgba(201,26,77,0.22)] bg-white/85 px-3.5 py-1.5 text-xs font-semibold text-[var(--grad-start)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  #{hint}
                </button>
              ))}
            </div>
          )}
        </div>

        {hero && recent.length > 0 && (
          <div className="border-t border-white/70 bg-white/80 px-4 sm:px-6 pt-3 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-[13px] text-gray-500">
              <span className="font-medium uppercase tracking-[0.22em] text-[var(--grad-start)]" style={{ letterSpacing: "0.22em" }}>
                {t("search.recent")}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {recent.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => onChange(term)}
                    className="rounded-full border border-white/60 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--grad-end)] shadow-sm transition hover:shadow"
                  >
                    #{term}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
