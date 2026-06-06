import { useState } from "react";
import { FileDown, Loader2, Check } from "lucide-react";
import { getAllReservations } from "../../services/reservation.service";
import { formatLocalDate } from "../../utils/date";
import {
  EXPORT_REPORT_TYPES,
  EXPORT_STATUS_OPTIONS,
  buildReportWorkbook,
  filterExportRows,
  normalizeExportConfig,
} from "../../lib/reservationReport";

export default function AdminReports() {
  const [config, setConfig] = useState({
    reportType: "detailed",
    dateMode: "single",
    selectedDate: formatLocalDate(),
    startDate: formatLocalDate(),
    endDate: formatLocalDate(),
    status: "all_active",
    search: "",
    sortBy: "time",
    sortOrder: "asc",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const set = (patch) => setConfig((prev) => ({ ...prev, ...patch }));

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const active = normalizeExportConfig(config);
      const filters = active.dateMode === "single"
        ? { date: active.selectedDate }
        : { fromDate: active.startDate, toDate: active.endDate };
      const response = await getAllReservations(filters);
      const sourceRows = Array.isArray(response) ? response : response?.reservations || [];
      const rows = filterExportRows(sourceRows, active);
      const result = buildReportWorkbook(rows, active);
      setInfo(`Exported ${result.count} record${result.count === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Failed to export report.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-xl bg-[var(--paper)] border border-[var(--line)] px-4 py-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--brass)] focus:ring-2 focus:ring-[var(--brass-soft)] transition";

  const selectedType = EXPORT_REPORT_TYPES.find((t) => t.value === config.reportType);
  const selectedStatus = EXPORT_STATUS_OPTIONS.find((o) => o.value === config.status);
  const periodText = config.dateMode === "single"
    ? config.selectedDate
    : `${config.startDate} → ${config.endDate}`;

  return (
    <div className="space-y-8">
      <div>
        <p className="admin-eyebrow">Archive</p>
        <h1 className="font-display text-[40px] sm:text-[48px] leading-[0.95] text-[var(--ink)] mt-1">
          Reports &amp; export
        </h1>
        <p className="text-[15px] text-[var(--ink-faint)] mt-3 max-w-lg">
          Compose a reservation report and download it as a formatted Excel workbook.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Config */}
        <div className="xl:col-span-2 admin-card p-6 sm:p-7 space-y-7 admin-rise">
          {/* Report type */}
          <div>
            <p className="admin-eyebrow mb-3">Report type</p>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {EXPORT_REPORT_TYPES.map((type) => {
                const isActive = config.reportType === type.value;
                return (
                  <button
                    key={type.value}
                    onClick={() => set({ reportType: type.value })}
                    className={`relative text-left rounded-2xl border p-4 transition ${
                      isActive
                        ? "border-[var(--brass)] bg-[var(--brass-soft)]"
                        : "border-[var(--line)] bg-[var(--paper)] hover:border-[var(--brass)]"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute top-3 right-3 h-5 w-5 rounded-full bg-[var(--brass)] flex items-center justify-center">
                        <Check className="h-3 w-3 text-[var(--cream)]" />
                      </span>
                    )}
                    <p className="font-display text-[17px] text-[var(--ink)] pr-6">{type.label}</p>
                    <p className="text-[12.5px] text-[var(--ink-faint)] mt-1 leading-snug">{type.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="admin-rule" />

          {/* Date */}
          <div>
            <p className="admin-eyebrow mb-3">Period</p>
            <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--paper)] p-1 mb-4">
              {[{ value: "single", label: "Single date" }, { value: "range", label: "Date range" }].map((m) => (
                <button
                  key={m.value}
                  onClick={() => set({ dateMode: m.value })}
                  className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
                    config.dateMode === m.value ? "bg-[var(--ink)] text-[var(--cream)]" : "text-[var(--ink-soft)]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {config.dateMode === "single" ? (
              <input type="date" value={config.selectedDate} onChange={(e) => set({ selectedDate: e.target.value })} className={`${inputCls} max-w-xs`} />
            ) : (
              <div className="flex flex-wrap gap-3">
                <input type="date" value={config.startDate} max={config.endDate} onChange={(e) => set({ startDate: e.target.value })} className={`${inputCls} max-w-[200px]`} />
                <span className="self-center text-[var(--ink-faint)]">—</span>
                <input type="date" value={config.endDate} min={config.startDate} onChange={(e) => set({ endDate: e.target.value })} className={`${inputCls} max-w-[200px]`} />
              </div>
            )}
          </div>

          {/* Status + search */}
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <p className="admin-eyebrow mb-3">Status filter</p>
              <select value={config.status} onChange={(e) => set({ status: e.target.value })} className={inputCls}>
                {EXPORT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="admin-eyebrow mb-3">Search</p>
              <input type="text" value={config.search} onChange={(e) => set({ search: e.target.value })} placeholder="Name, phone or table" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Summary rail */}
        <div className="admin-card p-6 admin-rise self-start" style={{ animationDelay: "120ms" }}>
          <h3 className="font-display text-[20px] text-[var(--ink)]">Your report</h3>
          <dl className="mt-4 divide-y divide-[var(--line)]">
            {[
              { k: "Type", v: selectedType?.label || config.reportType },
              { k: "Period", v: periodText },
              { k: "Status", v: selectedStatus?.label || config.status },
              { k: "Search", v: config.search || "—" },
            ].map((row) => (
              <div key={row.k} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-[13px] text-[var(--ink-faint)] shrink-0">{row.k}</dt>
                <dd className="text-[14px] font-semibold text-[var(--ink)] text-right truncate">{row.v}</dd>
              </div>
            ))}
          </dl>

          {selectedType?.hint && (
            <p className="mt-3 text-[12.5px] text-[var(--ink-faint)] leading-snug">{selectedType.hint}</p>
          )}

          {error && <div className="mt-4 rounded-xl bg-[#F6E7E2] border border-[#E3C4BB] text-[var(--danger)] text-sm px-4 py-2.5">{error}</div>}
          {info && <div className="mt-4 rounded-xl bg-[var(--brass-soft)] border border-[var(--line)] text-[var(--brass-2)] text-sm px-4 py-2.5">{info}</div>}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="admin-btn-brass mt-5 w-full flex items-center justify-center gap-2 py-3.5 font-bold text-[15px] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Generate workbook
          </button>
          <p className="mt-3 text-center text-[11.5px] text-[var(--ink-faint)]">Downloads an .xlsx to this device.</p>
        </div>
      </div>
    </div>
  );
}
