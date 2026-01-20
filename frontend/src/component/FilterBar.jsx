import { useTranslation } from "react-i18next";

export default function FilterBar({ sort, onSort }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      <div className="flex flex-col gap-3 rounded-[20px] border border-white/70 bg-white/85 px-4 py-3 shadow-[0_12px_28px_rgba(58,46,46,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="text-xs font-semibold uppercase tracking-[0.28em]" style={{ letterSpacing: "0.28em", color: 'var(--text-secondary)' }}>
          {t("menu.service_standard")}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            {t("menu.sort_by")}
          </span>
          <div className="relative">
      <select
              className="appearance-none rounded-full border border-white/70 bg-white/90 py-2 pl-4 pr-9 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--grad-end)]"
        value={sort}
        onChange={(e) => onSort(e.target.value)}
      >
              <option value="pop">{t("menu.sort_popular")}</option>
              <option value="priceAsc">{t("menu.sort_price_asc")}</option>
              <option value="priceDesc">{t("menu.sort_price_desc")}</option>
      </select>
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--grad-end)]"
            >
              ▾
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
