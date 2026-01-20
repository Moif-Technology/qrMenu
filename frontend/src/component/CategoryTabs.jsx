import { useTranslation } from "react-i18next";

export default function CategoryTabs({ categories, activeId, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-[70px] sm:top-[74px] z-30">
      <div className="border-b border-white/60 bg-white/90 backdrop-blur-xl shadow-[0_18px_40px_rgba(58,46,46,0.08)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-3 pb-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold uppercase tracking-[0.32em]" style={{ color: 'var(--text-tertiary)' }}>
              <span className="inline-flex h-2 w-2 rounded-full" style={{ background: "linear-gradient(120deg, var(--grad-start), var(--grad-end))" }} />
              {t("menu.menu_journey")}
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span className="inline-flex h-1 w-8 rounded-full" style={{ background: "linear-gradient(120deg, var(--grad-start), var(--grad-end))" }} />
              {t("menu.swipe_hint")}
            </div>
          </div>

      <div className="relative">
        <div
              className="flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory"
          role="tablist"
          aria-label="Menu categories"
        >
          {categories.map((c) => {
            const active = activeId === c.id;
                const baseClasses =
                  "group relative snap-start px-4 sm:px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--grad-start)]";

                if (active) {
                  return (
              <button
                key={c.id}
                role="tab"
                aria-selected="true"
                onClick={() => onChange(c.id)}
                      className={`${baseClasses} text-white shadow-lg shadow-[rgba(58,46,46,0.20)]`}
                style={{
                  background:
                          "linear-gradient(120deg, var(--grad-start), var(--grad-end))",
                }}
              >
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-2 w-2 rounded-full bg-white/80" />
                {c.name}
                      </span>
              </button>
                  );
                }

                return (
              <button
                key={c.id}
                role="tab"
                aria-selected="false"
                onClick={() => onChange(c.id)}
                    className={`${baseClasses} text-slate-700 hover:text-slate-900`}
                style={{
                      background:
                        "linear-gradient(#fff,#fff) padding-box, linear-gradient(120deg, var(--grad-start), var(--grad-end)) border-box",
                  border: "1.5px solid transparent",
                }}
              >
                    <span className="flex items-center gap-2">
                      <span className="inline-flex h-2 w-2 rounded-full" style={{ background: "linear-gradient(120deg, var(--grad-start), var(--grad-end))" }} />
                {c.name}
                    </span>
              </button>
            );
          })}
        </div>

            <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white/90 via-white/50 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white/90 via-white/50 to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
}
