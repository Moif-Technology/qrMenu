// frontend/src/pages/payout/PaymentReport.jsx
// Settled-payment ledger for the admin payout console (the "Report" tab).
//
// Read-only by design: one row per payment leg, never per order. A split bill
// produces several legs, and grouping them under an order header would print a
// subtotal that silently excludes any sibling leg falling outside the date
// range. Flat rows plus a split badge tell the same story without the lie.
//
// Owns its own date range and restaurant filter. It deliberately does NOT read
// AdminDashboard's `filters` state: that object drives the paginated
// Transactions list, and sharing it would make changing the report's range
// refetch two unrelated endpoints.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight,
  Copy, FileDown, FileSpreadsheet, RefreshCw
} from "lucide-react";
import api from "../../lib/payoutApi.js";
import { exportPayoutsPdf, exportPayoutsExcel } from "../../lib/exportPayouts.js";

const CURRENCY = "AED";
const PAGE_SIZE = 50;
// Matches MAX_EXPORT_ROWS in backend/routes/payout/transactions.routes.js.
const ROW_CAP = 20000;

const fmt = (n) =>
  Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Backend timestamps are "wall clock tagged UTC" (see backend/utils/payoutDates.js) -
// timeZone: "UTC" reads those digits literally instead of shifting them again.
const fmtDateTime = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "-" : dt.toLocaleString("en-AE", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  });
};

// "2026-08-14 13:45" - the one datetime shape Excel and Sheets both parse
// without asking. Reads the same UTC-literal digits as fmtDateTime.
const sheetDateTime = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}`;
};

// A real JS number, not a formatted string. Thousands separators make Excel
// store the cell as text, which is what breaks summing after a paste.
const money2 = (v) => Number((Number(v || 0)).toFixed(2));

// Tabs and newlines inside a value would invent columns and rows.
const tsvCell = (v) => (v === null || v === undefined ? "" : String(v).replace(/[\t\r\n]+/g, " "));

const escHtml = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Build the ISO day from LOCAL parts. toISOString() would give the UTC day,
// which between 00:00 and 04:00 Dubai is yesterday - so "Today" would quietly
// report the wrong day for anyone working late.
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function presetRange(key) {
  const now = new Date();
  if (key === "today") return { from: toISODate(now), to: toISODate(now) };
  if (key === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: toISODate(start), to: toISODate(now) };
  }
  // "month" - first of the current month to today.
  return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISODate(now) };
}

// Money arrives as SQL `money` decoded to a JS float, so adding the raw values
// accumulates binary drift (12345.674999...). Summing whole fils and dividing
// once at the end keeps the footer exact.
function sumFils(rows, pick) {
  return rows.reduce((acc, r) => acc + Math.round(Number(pick(r) || 0) * 100), 0) / 100;
}

// One column spec, three consumers: the clipboard, the Excel sheet and the PDF.
// `text` is for human documents, `raw` is the real value (numbers stay numbers)
// for anything that will be summed. `excelType` drives the mso hint below:
// reference-style columns must paste as text or Excel eats leading zeros and
// turns long digit strings into scientific notation.
const FIELDS = [
  { header: "Charged", text: (r) => fmtDateTime(r.createdAt), raw: (r) => sheetDateTime(r.createdAt), excelType: "text" },
  { header: "Restaurant", text: (r) => r.restaurantName || "-", raw: (r) => r.restaurantName || "", excelType: "text" },
  { header: "Order (KOT)", text: (r) => r.kotMasterId ?? "-", raw: (r) => r.kotMasterId ?? "", excelType: "text" },
  { header: "Bill no", text: (r) => r.billNo ?? "-", raw: (r) => r.billNo ?? "", excelType: "text" },
  { header: "Table", text: (r) => (r.tableId != null ? `T${r.tableId}` : "-"), raw: (r) => r.tableId ?? "", excelType: "text" },
  { header: "Method", text: (r) => r.methodName || "-", raw: (r) => r.methodName || "", excelType: "text" },
  { header: "Split", text: (r) => (r.isSplitLeg ? `${r.splitLegIndex}/${r.splitLegCount}` : "-"), raw: (r) => (r.isSplitLeg ? `${r.splitLegIndex}/${r.splitLegCount}` : ""), excelType: "text" },
  { header: "Telr ref", text: (r) => r.tranRef || "-", raw: (r) => r.tranRef || "", excelType: "text" },
  { header: "Bill paid", text: (r) => fmt(r.paidBillAmount), raw: (r) => money2(r.paidBillAmount), align: "right", excelType: "money" },
  { header: "Tip", text: (r) => fmt(r.tipAmount), raw: (r) => money2(r.tipAmount), align: "right", excelType: "money" },
  { header: "Service charge", text: (r) => fmt(r.serviceFeeAmount), raw: (r) => money2(r.serviceFeeAmount), align: "right", excelType: "money" },
  { header: "Paid", text: (r) => fmt(r.paidAmount), raw: (r) => money2(r.paidAmount), align: "right", excelType: "money" }
];

const MSO_FORMAT = { text: "\\@", money: "0.00" };

const SORTS = {
  date: (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
  paid: (a, b) => Number(a.paidAmount || 0) - Number(b.paidAmount || 0),
  bill: (a, b) => Number(a.paidBillAmount || 0) - Number(b.paidBillAmount || 0)
};

function SortTh({ label, k, sort, onSort, align = "left" }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-2.5 font-medium whitespace-nowrap ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-zinc-600 transition ${active ? "text-zinc-600" : ""}`}
      >
        {label} <Icon className="w-3 h-3" />
      </button>
    </th>
  );
}

function Stat({ label, value, tone = "default", sub }) {
  const valueCls =
    tone === "emerald" ? "text-emerald-400"
      : tone === "sky" ? "text-sky-300"
        : tone === "zinc" ? "text-zinc-300"
          : "text-white";
  return (
    <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
      <p className="text-[10px] sm:text-xs text-zinc-400 truncate">{label}</p>
      <p className={`num text-[15px] sm:text-xl font-semibold mt-0.5 sm:mt-1 leading-tight ${valueCls}`}>{value}</p>
      {sub && <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

export default function PaymentReport({ restaurants = [], onRowClick }) {
  const [range, setRange] = useState(() => presetRange("month"));
  const [shopId, setShopId] = useState("");
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, truncated: false, appliedFrom: null, appliedTo: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [exporting, setExporting] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    // The range is applied as the user types, so a slow wide-range query can
    // still be in flight when a newer one starts. Drop the older one rather
    // than letting whichever finishes last win.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/transactions/export", {
        signal: controller.signal,
        params: {
          status: "PAID",
          from: range.from || undefined,
          to: range.to || undefined,
          shopId: shopId || undefined
        }
      });
      setRows(data.transactions || []);
      setMeta({
        total: Number(data.total || 0),
        truncated: Boolean(data.truncated),
        appliedFrom: data.appliedFrom || null,
        appliedTo: data.appliedTo || null
      });
      setPage(1);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err.response?.data?.error || "Could not load the report.");
      setRows([]);
      setMeta({ total: 0, truncated: false, appliedFrom: null, appliedTo: null });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [range.from, range.to, shopId]);

  // Date inputs fire on partial values, so a typed year would otherwise launch
  // a full unpaginated scan per keystroke. Same debounce the console already
  // uses for its search and amount filters.
  useEffect(() => {
    const t = setTimeout(load, 500);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const sorted = useMemo(() => {
    const cmp = SORTS[sort.key] || SORTS.date;
    const out = [...rows].sort(cmp);
    return sort.dir === "desc" ? out.reverse() : out;
  }, [rows, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page]
  );

  // Totals cover the whole fetched range, not the visible page. They are
  // withheld entirely when the result was capped: a partial total on a money
  // screen gets quoted to a restaurant no matter how it is labelled.
  const totals = useMemo(() => {
    if (meta.truncated) return null;
    return {
      billPaid: sumFils(rows, (r) => r.paidBillAmount),
      tip: sumFils(rows, (r) => r.tipAmount),
      serviceFee: sumFils(rows, (r) => r.serviceFeeAmount),
      paid: sumFils(rows, (r) => r.paidAmount),
      count: rows.length
    };
  }, [rows, meta.truncated]);

  // The four money columns are written from one another at payment time, so
  // they normally foot by construction. A row that does not foot is a genuine
  // data fault worth surfacing rather than hiding.
  const varianceCount = useMemo(
    () => rows.filter((r) => Math.abs(
      Number(r.paidBillAmount || 0) + Number(r.tipAmount || 0) +
      Number(r.serviceFeeAmount || 0) - Number(r.paidAmount || 0)
    ) > 0.01).length,
    [rows]
  );

  function toggleSort(k) {
    setPage(1);
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }));
  }

  function applyPreset(key) {
    setRange(presetRange(key));
  }

  function runExport(kind) {
    if (!rows.length) return;
    setExporting(kind);
    try {
      const shopName = shopId
        ? restaurants.find((r) => String(r.RestaurantID) === String(shopId))?.Name
        : null;
      const args = {
        title: shopName ? `${shopName} - Settled Payments` : "Settled Payments Report",
        fromDate: range.from,
        toDate: range.to,
        rows: sorted,
        fileName: `settled-payments-${range.from || "all"}-to-${range.to || "all"}`
      };
      if (kind === "pdf") {
        // A PDF is read, not summed - formatted strings are right here.
        exportPayoutsPdf({
          ...args,
          columns: FIELDS.map((f) => ({
            header: f.excelType === "money" ? `${f.header} (${CURRENCY})` : f.header,
            key: f.text,
            align: f.align
          })),
          footerNote:
            "Successful = settled through Telr or marked paid. Dates are the QR charge time, not the bank settlement date."
        });
      } else {
        // Raw values so XLSX writes real numbers. Handing it fmt() strings put
        // "1,234.56" in the cell as text, which will not sum in Excel.
        exportPayoutsExcel({
          ...args,
          columns: FIELDS.map((f) => ({
            header: f.excelType === "money" ? `${f.header} (${CURRENCY})` : f.header,
            key: f.raw,
            align: f.align
          }))
        });
      }
    } catch (err) {
      console.error("Report export failed:", err.message);
      setError("Export failed. Try a narrower date range.");
    } finally {
      setExporting("");
    }
  }

  // Copy one row, ready to paste across a line of spreadsheet cells. The whole
  // range is the Excel button's job; this is for pulling a single payment out
  // to drop into an email, a ticket or an existing sheet.
  //
  // Two clipboard flavours are written at once: tab-separated text (the
  // universal fallback) and HTML carrying mso-number-format hints, so Excel
  // keeps the Telr ref and bill number as text rather than mangling them into
  // scientific notation, and still treats the money columns as numbers.
  async function copyRow(row) {
    const tsv = FIELDS.map((f) => tsvCell(f.raw(row))).join("\t");
    const html =
      `<table><tr>${FIELDS.map(
        (f) => `<td style="mso-number-format:'${MSO_FORMAT[f.excelType]}'">${escHtml(f.raw(row))}</td>`
      ).join("")}</tr></table>`;

    try {
      if (navigator.clipboard?.write && typeof window.ClipboardItem === "function") {
        await navigator.clipboard.write([
          new window.ClipboardItem({
            "text/plain": new Blob([tsv], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" })
          })
        ]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tsv);
      } else {
        // Non-secure origins get neither Clipboard API branch.
        const ta = document.createElement("textarea");
        ta.value = tsv;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(row.paymentId);
      setTimeout(() => setCopiedId((id) => (id === row.paymentId ? null : id)), 1500);
    } catch (err) {
      console.error("Copy failed:", err.message);
      setError("Could not copy to the clipboard. Use the Excel export instead.");
    }
  }

  const inputCls =
    "w-full rounded-xl bg-white border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition";

  return (
    <div className="space-y-4">
      {/* Range-scoped money position. The page-level stat block is all-time, so
          it is hidden on this tab - two totals on one screen that never
          reconcile is worse than one. */}
      <section className="rounded-2xl bg-ink-950 shadow-sm overflow-hidden">
        <div className="px-3 pt-3 sm:px-5 sm:pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Selected range
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y divide-ink-700">
          {loading && !rows.length ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="px-3 py-3 sm:px-5 sm:py-4">
                <div className="h-3 w-20 rounded bg-ink-800 animate-pulse" />
                <div className="h-6 w-28 rounded bg-ink-800 animate-pulse mt-2" />
              </div>
            ))
          ) : (
            <>
              <Stat
                label="Bill paid"
                value={totals ? `${CURRENCY} ${fmt(totals.billPaid)}` : "-"}
                sub={totals ? `${totals.count} payments` : "Range too large"}
              />
              <Stat
                label="Tip"
                value={totals ? `${CURRENCY} ${fmt(totals.tip)}` : "-"}
                tone="emerald"
              />
              <Stat
                label="Service charge"
                value={totals ? `${CURRENCY} ${fmt(totals.serviceFee)}` : "-"}
                tone="sky"
              />
              <Stat
                label="Paid (total charged)"
                value={totals ? `${CURRENCY} ${fmt(totals.paid)}` : "-"}
              />
            </>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-100">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-800">
                Settled payments{" "}
                <span className="num text-zinc-400 font-normal">({meta.total})</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                One row per payment. A split bill appears as several rows sharing an order number.
                Successful means settled through Telr or marked paid; dates are the QR charge time,
                not the bank settlement date.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={load}
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 border border-zinc-200 transition"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => runExport("pdf")}
                disabled={!!exporting || loading || !rows.length}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 transition"
              >
                <FileDown className="w-3.5 h-3.5" /> PDF
              </button>
              <button
                onClick={() => runExport("excel")}
                disabled={!!exporting || loading || !rows.length}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </button>
            </div>
          </div>

          {/* Range controls live here, not in the page filter bar: that bar is
              scoped to the Transactions tab and its other controls (search,
              method, settlement, batch, amount) mean nothing for this report. */}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Charged from</label>
              <input
                type="date"
                value={range.from}
                max={range.to || undefined}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Charged to</label>
              <input
                type="date"
                value={range.to}
                min={range.from || undefined}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Restaurant</label>
              <select value={shopId} onChange={(e) => setShopId(e.target.value)} className={inputCls}>
                <option value="">All</option>
                {restaurants.map((r) => (
                  <option key={r.RestaurantID} value={r.RestaurantID}>{r.Name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5 pb-0.5">
              {[
                { key: "today", label: "Today" },
                { key: "7d", label: "Last 7 days" },
                { key: "month", label: "This month" }
              ].map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50 transition"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {meta.truncated && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                This range holds <span className="num font-semibold">{meta.total}</span> payments, above the{" "}
                <span className="num">{ROW_CAP}</span> row limit. Only the most recent{" "}
                <span className="num">{ROW_CAP}</span> were loaded, so the oldest part of the range is
                missing and totals are hidden. Narrow the dates to see totals.
              </p>
            </div>
          )}

          {varianceCount > 0 && (
            <p className="mt-2 text-xs text-amber-600">
              {varianceCount} payment{varianceCount === 1 ? "" : "s"} where bill + tip + service charge
              does not equal the amount paid. Worth checking.
            </p>
          )}
        </div>

        {error ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-zinc-600">{error}</p>
            <button
              onClick={load}
              className="mt-3 px-4 py-2 text-sm rounded-xl bg-ink-950 text-white font-semibold hover:bg-ink-800 transition"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="px-5 py-12 text-center text-zinc-400 text-sm">Loading report...</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-zinc-400 text-sm">
            No settled payments in this date range.
          </div>
        ) : (
          <>
            {/* One table at every width. A separate mobile card list would be a
                second place to render the same money, and this report is scoped
                to laptops and up. */}
            <p className="lg:hidden px-5 pt-3 text-xs text-zinc-400">
              Best viewed on a laptop - scroll sideways for all columns.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1260px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                    <SortTh label="Charged" k="date" sort={sort} onSort={toggleSort} />
                    <th className="px-4 py-2.5 font-medium">Restaurant</th>
                    <th className="px-4 py-2.5 font-medium">Order (KOT)</th>
                    <th className="px-4 py-2.5 font-medium whitespace-nowrap">Bill no</th>
                    <th className="px-4 py-2.5 font-medium">Method</th>
                    <th className="px-4 py-2.5 font-medium whitespace-nowrap">Telr ref</th>
                    <SortTh label="Bill paid" k="bill" sort={sort} onSort={toggleSort} align="right" />
                    <th className="px-4 py-2.5 font-medium text-right">Tip</th>
                    <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">Service charge</th>
                    <SortTh label="Paid" k="paid" sort={sort} onSort={toggleSort} align="right" />
                    <th className="px-3 py-2.5 w-10">
                      <span className="sr-only">Copy row</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t) => (
                    <tr
                      key={t.paymentId}
                      onClick={() => onRowClick?.(t)}
                      className={`border-b border-zinc-50 last:border-0 hover:bg-zinc-50 cursor-pointer transition ${t.isSplitLeg ? "bg-indigo-50/40" : ""}`}
                      title="Click for full details"
                    >
                      <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{fmtDateTime(t.createdAt)}</td>
                      <td className="px-4 py-3 text-zinc-800 font-medium">{t.restaurantName}</td>
                      <td className="num px-4 py-3 text-zinc-600 whitespace-nowrap">
                        {t.kotMasterId ?? "-"}
                        {t.tableId != null && <span className="text-zinc-400"> · T{t.tableId}</span>}
                      </td>
                      {/* BillNo only exists once the KOT has been settled into
                          SalesMaster, so a paid-but-still-open bill has none. */}
                      <td className="num px-4 py-3 text-zinc-600 whitespace-nowrap">
                        {t.billNo ?? <span className="text-zinc-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                        {t.methodName}
                        {t.isSplitLeg && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 border border-indigo-200 align-middle">
                            Split {t.splitLegIndex}/{t.splitLegCount}
                          </span>
                        )}
                      </td>
                      <td className="num px-4 py-3 text-xs whitespace-nowrap">
                        {t.tranRef || <span className="text-zinc-300">-</span>}
                      </td>
                      <td className="num px-4 py-3 text-right text-zinc-700">{fmt(t.paidBillAmount)}</td>
                      <td className="num px-4 py-3 text-right text-zinc-500">{fmt(t.tipAmount)}</td>
                      <td className="num px-4 py-3 text-right text-zinc-500">{fmt(t.serviceFeeAmount)}</td>
                      <td className="num px-4 py-3 text-right text-zinc-900 font-semibold">{fmt(t.paidAmount)}</td>
                      {/* stopPropagation: the row itself opens the detail modal. */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => copyRow(t)}
                          className={`p-1.5 rounded-lg border transition ${
                            copiedId === t.paymentId
                              ? "border-emerald-300 text-emerald-600 bg-emerald-50"
                              : "border-transparent text-zinc-300 hover:text-zinc-600 hover:border-zinc-200 hover:bg-white"
                          }`}
                          title="Copy this row for a spreadsheet"
                          aria-label={`Copy payment ${t.paymentId}`}
                        >
                          {copiedId === t.paymentId
                            ? <Check className="w-3.5 h-3.5" />
                            : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-200 bg-zinc-50/60 text-sm">
                    <td className="px-4 py-3 font-semibold text-zinc-700" colSpan={6}>
                      {totals
                        ? `Range total · ${totals.count} payment${totals.count === 1 ? "" : "s"}`
                        : "Totals hidden - narrow the date range"}
                    </td>
                    <td className="num px-4 py-3 text-right font-semibold text-zinc-900">
                      {totals ? fmt(totals.billPaid) : "-"}
                    </td>
                    <td className="num px-4 py-3 text-right text-zinc-700">
                      {totals ? fmt(totals.tip) : "-"}
                    </td>
                    <td className="num px-4 py-3 text-right text-zinc-700">
                      {totals ? fmt(totals.serviceFee) : "-"}
                    </td>
                    <td className="num px-4 py-3 text-right font-bold text-zinc-900">
                      {totals ? `${CURRENCY} ${fmt(totals.paid)}` : "-"}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-zinc-100">
              <p className="text-xs text-zinc-400">
                Showing{" "}
                <span className="num">{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, sorted.length)}</span>{" "}
                of <span className="num">{sorted.length}</span>
              </p>
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-1.5 rounded-lg border border-zinc-200 disabled:opacity-40 hover:bg-zinc-50 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="num">{page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded-lg border border-zinc-200 disabled:opacity-40 hover:bg-zinc-50 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
