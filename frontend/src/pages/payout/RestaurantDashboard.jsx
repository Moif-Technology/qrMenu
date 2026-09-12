import {
  AlertTriangle,
  ArrowUpDown,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  FileDown, FileSpreadsheet,
  KeyRound,
  LogOut,
  ReceiptText,
  RefreshCw,
  Store,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ChangePasswordModal from "../../component/payout/ChangePasswordModal.jsx";
import { exportPayoutsExcel, exportPayoutsPdf, exportSettlementStatementPdf, fmtDateTime } from "../../lib/exportPayouts.js";
import api, { clearSession, getStoredUser } from "../../lib/payoutApi.js";

const CURRENCY = "AED";

const PAYOUT_NOTICE = {
  title: "Payout update",
  scheduledDate: "2026-08-28T00:00:00.000Z",
  processingDate: "2026-08-31T00:00:00.000Z",
  expiresAt: "2026-09-01T00:00:00+04:00",
  message: "The payout batch scheduled for 28 Aug 2026 will be processed on 31 Aug 2026 due to the Rabi Al Awwal bank holiday."
};

const isPayoutNoticeActive = () => Date.now() < new Date(PAYOUT_NOTICE.expiresAt).getTime();

const isHolidayDelayedDate = (d) => {
  if (!d) return false;
  const dt = new Date(d);
  return (
    !Number.isNaN(dt.getTime()) &&
    dt.getUTCFullYear() === 2026 &&
    dt.getUTCMonth() === 7 &&
    dt.getUTCDate() === 28
  );
};

const fmt = (n) =>
  Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Round half-up to 2 decimals so a fee like 0.525 shows as 0.53, not 0.52
// (the EPSILON nudge fixes float repr where 0.525*100 lands just under 52.5).
const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

// CreatedAt comes from the backend as a "wall clock tagged UTC" ISO string
// (see backend/utils/payoutDates.js) - timeZone: "UTC" reads those digits
// back literally instead of re-converting them into the viewer's local time.
const fmtDate = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "-" : dt.toLocaleString("en-AE", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  });
};

// Next payout date comes from the earliest SCHEDULED payout the admin set
// (summary.nextScheduledDate) - there is no fixed weekly day.
const fmtPayoutDate = (d) => {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? "-"
    : dt.toLocaleDateString("en-AE", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

const fmtExportPayoutDate = (row) => {
  const date = row.payout?.transferDate || row.payout?.scheduledDate;
  if (!date) return "-";
  const dt = new Date(date);
  return Number.isNaN(dt.getTime())
    ? "-"
    : dt.toLocaleDateString("en-AE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

// Date-only (no time) for batch settlement rows, UTC-literal like fmtDate.
const fmtDay = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString("en-AE", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
  });
};

// A batch spans many transactions - collapse to a single day or a range.
const fmtTxnRange = (from, to) => {
  const s = fmtDay(from);
  const e = fmtDay(to);
  if (s === "-") return e;
  return s === e ? s : `${s} – ${e}`;
};

// Payout (value) date: real transfer date once paid, else the scheduled date.
const isHolidayDelayedBatch = (b) => {
  const batchNo = fmtBatchNo(b?.batchNo);
  return isHolidayDelayedDate(b?.scheduledDate) || batchNo === "28082026";
};

const fmtValueDay = (b) => fmtDay(b.transferDate || b.scheduledDate);

// A scheduled batch is numbered by its payout date as DDMMYYYY, stored in a
// bigint - so a single-digit day loses its leading zero (4 Aug 2026 -> 4082026).
// Pad it back so it reads as a date. Legacy sequence numbers are left alone.
const fmtBatchNo = (n) => {
  const s = String(n ?? "");
  return /^\d{7,8}$/.test(s) ? s.padStart(8, "0") : s;
};

const PAYOUT_BADGE = {
  TRANSFERRED: { label: "Paid to you", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  SCHEDULED: { label: "Scheduled", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  PROCESSING: { label: "Processing", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  PENDING: { label: "Awaiting payout", cls: "bg-amber-50 text-amber-700 border-amber-200" }
};

function PayoutBadge({ status }) {
  const b = PAYOUT_BADGE[status] || PAYOUT_BADGE.PENDING;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${b.cls}`}>
      {b.label}
    </span>
  );
}

const FILTER_CHIPS = [
  { key: "", label: "All" },
  { key: "PENDING", label: "Awaiting" },
  { key: "PROCESSING", label: "Processing" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "TRANSFERRED", label: "Paid out" }
];

const SORT_OPTIONS = [
  { v: "date:desc", label: "Date: newest first" },
  { v: "date:asc", label: "Date: oldest first" },
  { v: "paid:desc", label: "Amount: high to low" },
  { v: "paid:asc", label: "Amount: low to high" }
];

const PAGE_SIZE = 25;

const toISODate = (d) => {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

const DATE_PRESETS = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 }
];

function RangeField({ label, idPrefix, date, time, onDate, onTime }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/15 transition">
      <span className="block px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <div className="flex items-center divide-x divide-zinc-100">
        <input
          id={`${idPrefix}-date`}
          aria-label={`${label} date`}
          type="date"
          value={date}
          onChange={(e) => onDate(e.target.value)}
          className="flex-1 min-w-0 bg-transparent px-3 pb-2 pt-1 text-sm text-zinc-800 focus:outline-none"
        />
        <input
          id={`${idPrefix}-time`}
          aria-label={`${label} time`}
          type="time"
          value={time}
          onChange={(e) => onTime(e.target.value)}
          disabled={!date}
          className="w-32 shrink-0 bg-transparent px-3 pb-2 pt-1 text-sm text-zinc-800 disabled:opacity-40 focus:outline-none"
        />
      </div>
    </div>
  );
}

// Bottom sheet: a batch's full transaction list, restaurant-framed (gross =
// bill share + tip, platform fee shown, service fee never shown).
function BatchDetailSheet({ batch, onClose }) {
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState([]);

  useEffect(() => {
    let alive = true;
    // Opened from a settlement (a paid card): scope the list to that settlement's
    // own transactions, not every row that happens to share the batch number.
    // First page only - the header count above comes from the batch itself, so
    // a long batch reads honestly even though the list below is capped.
    const params = { batch: batch.batchNo, pageSize: 200 };
    if (batch.transferRef) {
      params.payoutStatus = "TRANSFERRED";
      params.transferRef = batch.transferRef;
    }
    api.get("/transactions", { params })
      .then(({ data }) => { if (alive) setTxns(data.transactions || []); })
      .catch(() => { if (alive) setTxns([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [batch.batchNo, batch.transferRef]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-t-3xl bg-white border-t border-zinc-200 shadow-2xl">
          <div className="pt-3 shrink-0">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-zinc-200" />
          </div>

          {/* Header: batch settlement summary */}
          <div className="px-5 pt-3 pb-4 border-b border-zinc-100 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-zinc-900">
                  {batch.transferRef ? "Settlement" : "Payout batch"}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {fmtTxnRange(batch.firstTxnAt, batch.lastTxnAt)} · <span className="num">{batch.txnCount}</span> transaction{batch.txnCount === 1 ? "" : "s"}
                </p>
                {!loading && txns.length < batch.txnCount && (
                  <p className="text-xs text-zinc-400 mt-0.5">Showing the first {txns.length}</p>
                )}
                {batch.transferRef && (
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Ref <span className="num text-zinc-600">{batch.transferRef}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {batch.status === "MIXED"
                  ? <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-zinc-100 text-zinc-600 border-zinc-200">Mixed</span>
                  : <PayoutBadge status={batch.status} />}
                <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-ink-950 px-4 py-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] text-zinc-400">Net payout</p>
                <p className="num text-xl font-semibold text-white mt-0.5">{CURRENCY} {fmt(batch.payoutAmount)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-zinc-500">Payout date</p>
                <p className="text-sm text-emerald-400 font-medium mt-0.5">{fmtValueDay(batch)}</p>
              </div>
            </div>
            {isPayoutNoticeActive() && isHolidayDelayedBatch(batch) && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm text-amber-800">{PAYOUT_NOTICE.message}</p>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-zinc-50 py-2">
                <p className="text-[10px] text-zinc-400">Gross</p>
                <p className="num text-sm text-zinc-800 mt-0.5">{fmt(batch.gross)}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 py-2">
                <p className="text-[10px] text-zinc-400">Platform fee</p>
                <p className="num text-sm text-zinc-600 mt-0.5">− {fmt(batch.fees)}</p>
              </div>
            </div>
          </div>

          {/* Transaction list */}
          <div className="overflow-y-auto flex-1 divide-y divide-zinc-100">
            {loading ? (
              <div className="px-5 py-10 text-center text-zinc-400 text-sm">Loading...</div>
            ) : txns.length === 0 ? (
              <div className="px-5 py-10 text-center text-zinc-400 text-sm">No transactions found</div>
            ) : (
              txns.map((t) => {
                const gross = Number(t.restaurantGrossAmount ?? ((Number(t.paidBillAmount ?? 0) + Number(t.tipAmount ?? 0))));
                return (
                  <div key={t.paymentId} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-800">
                          {t.billNo != null
                            ? <>Bill <span className="num">#{t.billNo}</span></>
                            : (t.kotMasterId != null ? <>Order <span className="num">#{t.kotMasterId}</span></> : "Payment")}
                          {t.tableId != null && <span className="text-zinc-400 font-normal"> · Table {t.tableId}</span>}
                        </p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {t.methodName}{fmtDate(t.createdAt) !== "-" && ` · ${fmtDate(t.createdAt)}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="num text-sm font-semibold text-zinc-900">{CURRENCY} {fmt(r2(t.restaurantPayoutAmount))}</p>
                        <p className="text-[10px] text-zinc-400">you receive</p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <span className="text-zinc-400">Gross <span className="num text-zinc-700">{fmt(gross)}</span></span>
                      <span className="text-center text-zinc-400">Fee <span className="num text-zinc-700">− {fmt(r2(t.platformFeeAmount))}</span></span>
                      <span className="text-right text-zinc-400">Tip <span className="num text-zinc-700">{fmt(t.tipAmount)}</span></span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="h-3 shrink-0" />
        </div>
      </div>
    </div>
  );
}

export default function RestaurantDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();

  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [payoutFilter, setPayoutFilter] = useState("");
  const [sortOpt, setSortOpt] = useState("date:desc");
  const [range, setRange] = useState({ fromDate: "", fromTime: "", toDate: "", toTime: "" });
  const [rangePreset, setRangePreset] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [exporting, setExporting] = useState("");
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchDetail, setBatchDetail] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [settlementsLoading, setSettlementsLoading] = useState(false);

  const exportParams = useCallback(() => {
    const params = {};
    if (payoutFilter) params.payoutStatus = payoutFilter;
    if (range.fromDate) params.from = range.fromTime ? `${range.fromDate}T${range.fromTime}` : range.fromDate;
    if (range.toDate) params.to = range.toTime ? `${range.toDate}T${range.toTime}` : range.toDate;
    return params;
  }, [payoutFilter, range]);

  const EXPORT_COLUMNS = useMemo(() => [
    { header: "Transaction date and time", key: (r) => fmtDateTime(r.createdAt) },
    { header: "Bill number", key: (r) => (r.billNo != null ? `#${r.billNo}` : (r.failed ? "-" : "Ongoing")) },
    { header: "Table", key: (r) => (r.tableNo ?? r.tableId) != null ? `T${r.tableNo ?? r.tableId}` : "-" },
    { header: "Method", key: "methodName" },
    { header: "Transaction amount", key: (r) => fmt(r.restaurantGrossAmount ?? ((Number(r.paidBillAmount ?? 0) + Number(r.tipAmount ?? 0)) || r.paidAmount)), align: "right" },
    { header: "Tip", key: (r) => fmt(r.tipAmount), align: "right" },
    { header: "Transaction fee", key: (r) => fmt(r.platformFeeAmount), align: "right" },
    { header: "Payout Amt", key: (r) => (r.failed ? "-" : fmt(r.restaurantPayoutAmount)), align: "right" },
    { header: "Payout Date", key: (r) => (r.failed ? "-" : fmtExportPayoutDate(r)) },
    { header: "Status", key: (r) => (r.failed ? "Failed" : (PAYOUT_BADGE[r.payout?.status || "PENDING"] || PAYOUT_BADGE.PENDING).label) }
  ], []);

  async function runExport(kind) {
    setExporting(kind);
    try {
      const { data } = await api.get("/transactions/export", { params: exportParams() });
      const rows = data.transactions || [];
      const fileName = `payouts-${user?.displayName || "restaurant"}-${toISODate(new Date())}`.replace(/\s+/g, "-");
      if (kind === "pdf") {
        exportPayoutsPdf({
          title: `${user?.displayName || "Restaurant"} - Payouts`,
          fromDate: range.fromDate, toDate: range.toDate,
          columns: EXPORT_COLUMNS, rows, fileName,
          footerNote: "Platform fee is deducted per transaction; tip stays with the restaurant."
        });
      } else {
        exportPayoutsExcel({
          title: `${user?.displayName || "Restaurant"} - Payouts`,
          fromDate: range.fromDate, toDate: range.toDate,
          columns: EXPORT_COLUMNS, rows, fileName
        });
      }
    } catch (err) {
      console.error("Export failed:", err.message);
      alert("Export failed. Please try again.");
    } finally {
      setExporting("");
    }
  }

  const load = useCallback(async (pageToLoad, append) => {
    setLoading(true);
    try {
      const [sortKey, sortDir] = (sortOpt || "date:desc").split(":");
      const params = { page: pageToLoad, pageSize: PAGE_SIZE, sort: sortKey, dir: sortDir };
      if (payoutFilter) params.payoutStatus = payoutFilter;
      // Date range; a time refines the boundary of its day (time alone is ignored)
      if (range.fromDate) {
        params.from = range.fromTime ? `${range.fromDate}T${range.fromTime}` : range.fromDate;
      }
      if (range.toDate) {
        params.to = range.toTime ? `${range.toDate}T${range.toTime}` : range.toDate;
      }

      const [txnRes, sumRes] = await Promise.all([
        api.get("/transactions", { params }),
        api.get("/transactions/summary")
      ]);
      setTransactions((prev) =>
        append ? [...prev, ...txnRes.data.transactions] : txnRes.data.transactions
      );
      setTotal(txnRes.data.total);
      setSummary(sumRes.data.totals);
    } catch (err) {
      console.error("Load failed:", err.message);
    } finally {
      setLoading(false);
    }
  }, [payoutFilter, sortOpt, range]);

  useEffect(() => {
    load(1, false);
    setPage(1);
  }, [load]);

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      const { data } = await api.get("/payouts/my-batches");
      setBatches(data.batches || []);
    } catch (err) {
      console.error("Load batches failed:", err.message);
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  // Settlement statements: one row per bank credit (batch + reference + date).
  // If the backend has not been deployed yet, /my-history 404s - fall back to
  // the transferred batches from /my-batches so the view still renders. The
  // fallback rows carry no statement lines, so the card shows the summary only.
  const loadSettlements = useCallback(async () => {
    setSettlementsLoading(true);
    try {
      const { data } = await api.get("/payouts/my-history");
      setSettlements(data.settlements || []);
    } catch (err) {
      if (err.response?.status === 404) {
        try {
          const { data } = await api.get("/payouts/my-batches");
          setSettlements((data.batches || []).filter((b) => b.status === "TRANSFERRED"));
        } catch (fallbackErr) {
          console.error("Load settlements fallback failed:", fallbackErr.message);
          setSettlements([]);
        }
      } else {
        console.error("Load settlements failed:", err.message);
        setSettlements([]);
      }
    } finally {
      setSettlementsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
    loadSettlements();
  }, [loadBatches, loadSettlements]);

  // Split payments (equal/custom/item) create one row per payer sharing the
  // same kotMasterId - without a marker these look like duplicate orders.
  // Group rows currently loaded that share a kotMasterId and label each with
  // its position (numbered by paymentId so it's stable regardless of sort).
  const splitGroupInfo = useMemo(() => {
    const groups = new Map();
    transactions.forEach((t) => {
      if (t.kotMasterId == null || t.failed) return;
      if (!groups.has(t.kotMasterId)) groups.set(t.kotMasterId, []);
      groups.get(t.kotMasterId).push(t);
    });
    const info = new Map();
    groups.forEach((rows) => {
      if (rows.length < 2) return;
      const sorted = [...rows].sort((a, b) => a.paymentId - b.paymentId);
      sorted.forEach((t, i) => info.set(t.paymentId, { idx: i + 1, total: sorted.length }));
    });
    return info;
  }, [transactions]);

  // Scheduled must list only what has NOT been paid yet - /my-batches returns
  // every batch including transferred ones, which would otherwise show the same
  // batch under both Scheduled and Paid out. Filtered here rather than only on
  // the server because an older backend ignores an unknown query param and
  // would still return the transferred batches.
  const upcomingBatches = useMemo(
    () => batches.filter((b) => b.status !== "TRANSFERRED"),
    [batches]
  );

  // Scheduled and Paid out answer batch-level questions ("when do I get paid",
  // "what did I get paid"), so both render settlement cards instead of the
  // per-transaction feed.
  const isCardView = payoutFilter === "SCHEDULED" || payoutFilter === "TRANSFERRED";

  function downloadStatement(s) {
    exportSettlementStatementPdf({
      restaurantName: user?.displayName || "Restaurant",
      statement: s,
      fileName: `settlement-${s.statementNo || `B-${s.batchNo}`}`
    });
  }

  function logout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  function loadMore() {
    const next = page + 1;
    setPage(next);
    load(next, true);
  }

  function applyPreset(p) {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - (p.days - 1));
    setRange({ fromDate: toISODate(from), fromTime: "", toDate: toISODate(today), toTime: "" });
    setRangePreset(p.key);
  }

  function updateRange(patch) {
    setRange((r) => ({ ...r, ...patch }));
    setRangePreset("custom");
  }

  function clearRange() {
    setRange({ fromDate: "", fromTime: "", toDate: "", toTime: "" });
    setRangePreset("");
  }

  const paidOut = Number(summary?.totalTransferred || 0);
  const scheduledPayout = Number(summary?.totalScheduledPayout || 0);
  const processingPayout = Number(summary?.totalProcessingPayout || 0);
  const pendingPayout = summary?.totalAwaitingPayout != null
    ? Number(summary.totalAwaitingPayout)
    : Math.max(0, Number(summary?.totalPendingPayout || 0) - scheduledPayout - processingPayout);

  const nextPayout = summary?.nextScheduledDate || null;

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="rounded-xl bg-ink-950 p-2 shrink-0">
              <Store className="w-4.5 h-4.5 text-emerald-400" style={{ width: 18, height: 18 }} />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-zinc-900 leading-tight truncate">
                {user?.displayName || "My Restaurant"}
              </h1>
              <p className="text-xs text-zinc-500 truncate">QR payments · DeynoQR</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => load(1, false)}
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 border border-zinc-200 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 border border-zinc-200 transition"
              title="Change password"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 border border-zinc-200 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Earnings: the one dark anchor on the page */}
        <section className="rounded-2xl bg-ink-950 text-white p-5 sm:p-6 shadow-sm">
          <p className="text-zinc-400 text-sm">Your earnings through QR payments</p>
          <p className="num text-3xl sm:text-4xl font-semibold tracking-tight mt-1.5">
            {CURRENCY} {fmt(summary?.totalRestaurantPayoutDue)}
          </p>
          <div className="grid grid-cols-2 gap-px mt-6 rounded-xl overflow-hidden bg-ink-700">
            <div className="bg-ink-900 px-4 py-3">
              <p className="text-xs text-zinc-400">Scheduled</p>
              <p className="num text-base sm:text-lg font-semibold text-violet-300 mt-0.5">
                {CURRENCY} {fmt(scheduledPayout)}
              </p>
            </div>
            <div className="bg-ink-900 px-4 py-3">
              <p className="text-xs text-zinc-400">Processing</p>
              <p className="num text-base sm:text-lg font-semibold text-indigo-300 mt-0.5">
                {CURRENCY} {fmt(processingPayout)}
              </p>
            </div>
            <div className="bg-ink-900 px-4 py-3">
              <p className="text-xs text-zinc-400">Pending</p>
              <p className="num text-base sm:text-lg font-semibold text-amber-400 mt-0.5">
                {CURRENCY} {fmt(pendingPayout)}
              </p>
            </div>
            <div className="bg-ink-900 px-4 py-3">
              <p className="text-xs text-zinc-400">Paid out</p>
              <p className="num text-base sm:text-lg font-semibold text-emerald-400 mt-0.5">
                {CURRENCY} {fmt(paidOut)}
              </p>
            </div>
          </div>
          {nextPayout && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-ink-900 px-3.5 py-3">
              <CalendarClock className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-white font-medium">
                  Next payout: {fmtPayoutDate(nextPayout)}
                </p>
              </div>
            </div>
          )}

          {isPayoutNoticeActive() && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3.5 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm text-white font-medium">{PAYOUT_NOTICE.title}</p>
                <p className="text-xs sm:text-sm text-amber-50/85 mt-0.5">{PAYOUT_NOTICE.message}</p>
              </div>
            </div>
          )}

     
        </section>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {FILTER_CHIPS.map((c) => (
            <button
              key={c.key}
              onClick={() => setPayoutFilter(c.key)}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap border transition ${
                payoutFilter === c.key
                  ? "bg-ink-950 text-white border-ink-950 font-medium"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Scheduled tab shows payout batches as settlement cards; tapping one
            opens its full transaction breakdown. Every other chip is the feed. */}
        {payoutFilter === "SCHEDULED" && (
          <section className="rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100">
              <h2 className="text-sm font-semibold text-zinc-800">Scheduled payout batches</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Each settlement groups the transactions paid out together. Tap a batch to see its transactions.
              </p>
              {isPayoutNoticeActive() && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-amber-800">
                    {PAYOUT_NOTICE.message}
                  </p>
                </div>
              )}
            </div>

            {upcomingBatches.length === 0 ? (
              <div className="px-5 py-12 text-center text-zinc-400 text-sm">
                {batchesLoading ? "Loading..." : "No upcoming payout batches"}
              </div>
            ) : (
              <div className="p-4 sm:p-5 space-y-4">
                {upcomingBatches.map((b) => (
                  <button
                    key={b.batchNo}
                    type="button"
                    onClick={() => setBatchDetail(b)}
                    className="w-full text-left rounded-2xl border border-zinc-200 overflow-hidden hover:border-zinc-300 hover:shadow-sm transition"
                  >
                    {/* Card head: what & when */}
                    <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900">Sales</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {fmtTxnRange(b.firstTxnAt, b.lastTxnAt)} · <span className="num">{b.txnCount}</span> transaction{b.txnCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      {b.status === "MIXED" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-zinc-100 text-zinc-600 border-zinc-200">
                          Mixed
                        </span>
                      ) : (
                        <PayoutBadge status={b.status} />
                      )}
                    </div>

                    {/* Net payout: the headline number + when it lands */}
                    <div className="mx-4 sm:mx-5 rounded-xl bg-ink-950 px-4 py-3.5 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[11px] text-zinc-400">Net payout</p>
                        <p className="num text-2xl sm:text-3xl font-semibold text-white mt-0.5 tracking-tight">
                          {CURRENCY} {fmt(b.payoutAmount)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-zinc-500">Payout date</p>
                        <p className="text-sm text-emerald-400 font-medium mt-0.5">{fmtValueDay(b)}</p>
                      </div>
                    </div>

                    {/* Breakdown: gross → fees → tax (service fee never shown) */}
                    {isPayoutNoticeActive() && isHolidayDelayedBatch(b) && (
                      <div className="mx-4 sm:mx-5 mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs sm:text-sm text-amber-800">
                          {PAYOUT_NOTICE.message}
                        </p>
                      </div>
                    )}

                    <div className="px-4 sm:px-5 py-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Gross</span>
                        <span className="num text-zinc-800">{CURRENCY} {fmt(b.gross)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Platform fee</span>
                        <span className="num text-zinc-500">− {CURRENCY} {fmt(b.fees)}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 mt-1 border-t border-zinc-100">
                        <span className="text-zinc-700 font-medium">You receive</span>
                        <span className="num text-zinc-900 font-semibold">{CURRENCY} {fmt(b.payoutAmount)}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 pt-1">Tap to view all {b.txnCount} transaction{b.txnCount === 1 ? "" : "s"} →</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Paid out: one card per settlement statement - a settlement is one
            bank credit (batch + transfer reference + transfer date), and the
            breakdown mirrors the statement DeynoQR issues line for line. */}
        {payoutFilter === "TRANSFERRED" && (
          <section className="rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100">
              <h2 className="text-sm font-semibold text-zinc-800">Payout history</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Every payout that has landed in your account. Tap a settlement to see its transactions.
              </p>
            </div>

            {settlements.length === 0 ? (
              <div className="px-5 py-12 text-center text-zinc-400 text-sm">
                {settlementsLoading ? "Loading..." : "No payouts yet"}
              </div>
            ) : (
              <div className="p-4 sm:p-5 space-y-4">
                {settlements.map((s) => {
                  // A fallback row from /my-batches (backend not yet deployed)
                  // has no statement lines - show the summary only.
                  const hasStatement = s.grossPayable != null;
                  return (
                    <div
                      key={`${s.batchNo}-${s.transferRef || "x"}-${s.transferDate || "x"}`}
                      onClick={() => setBatchDetail(s)}
                      className="rounded-2xl border border-zinc-200 overflow-hidden hover:border-zinc-300 hover:shadow-sm transition cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-900">
                            {s.statementNo || `BATCH${fmtBatchNo(s.batchNo)}`}
                          </p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {fmtTxnRange(s.firstTxnAt, s.lastTxnAt)} · <span className="num">{s.txnCount}</span> transaction{s.txnCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <PayoutBadge status="TRANSFERRED" />
                      </div>

                      {/* The number that hit the bank. */}
                      <div className="mx-4 sm:mx-5 rounded-xl bg-ink-950 px-4 py-3.5 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[11px] text-zinc-400">Net amount transferred</p>
                          <p className="num text-2xl sm:text-3xl font-semibold text-white mt-0.5 tracking-tight">
                            {CURRENCY} {fmt(hasStatement ? s.netTransferred : s.payoutAmount)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] text-zinc-500">Payout date</p>
                          <p className="text-sm text-emerald-400 font-medium mt-0.5">{fmtDay(s.transferDate)}</p>
                        </div>
                      </div>

                      {s.transferRef && (
                        <div className="px-4 sm:px-5 pt-3 flex items-center justify-between text-sm">
                          <span className="text-zinc-500">Transfer reference</span>
                          <span className="num text-zinc-800">{s.transferRef}</span>
                        </div>
                      )}

                      {hasStatement ? (
                        <div className="px-4 sm:px-5 py-4 space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Total bill amount</span>
                            <span className="num text-zinc-800">{CURRENCY} {fmt(s.totalBillAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Tip amount</span>
                            <span className="num text-zinc-800">{CURRENCY} {fmt(s.tipAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Service fee</span>
                            <span className="num text-zinc-500">− {CURRENCY} {fmt(s.serviceFee)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">VAT on service fee</span>
                            <span className="num text-zinc-500">− {CURRENCY} {fmt(s.serviceFeeVat)}</span>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                            <span className="text-zinc-700 font-medium">Gross payable</span>
                            <span className="num text-zinc-900 font-medium">{CURRENCY} {fmt(s.grossPayable)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Transfer fee</span>
                            <span className="num text-zinc-500">− {CURRENCY} {fmt(s.transferFee)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">VAT on transfer fee</span>
                            <span className="num text-zinc-500">− {CURRENCY} {fmt(s.transferFeeVat)}</span>
                          </div>
                          {/* Only charged on some settlements - no line at all when it is 0. */}
                          {Number(s.monthlyFee || 0) > 0 && (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-500">Monthly fee</span>
                                <span className="num text-zinc-500">− {CURRENCY} {fmt(s.monthlyFee)}</span>
                              </div>
                              {Number(s.monthlyFeeVat || 0) > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-500">VAT on monthly fee</span>
                                  <span className="num text-zinc-500">− {CURRENCY} {fmt(s.monthlyFeeVat)}</span>
                                </div>
                              )}
                            </>
                          )}
                          <div className="flex items-center justify-between pt-2 mt-1 border-t border-zinc-100">
                            <span className="text-zinc-800 font-semibold">Net amount transferred</span>
                            <span className="num text-zinc-900 font-semibold">{CURRENCY} {fmt(s.netTransferred)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="px-4 sm:px-5 py-4 text-xs text-zinc-400">
                          Statement breakdown unavailable for this payout.
                        </div>
                      )}

                      <div className="px-4 sm:px-5 pb-4 flex items-center justify-between gap-3">
                        <span className="text-[11px] text-zinc-400">
                          Tap to view all {s.txnCount} transaction{s.txnCount === 1 ? "" : "s"} →
                        </span>
                        {hasStatement && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); downloadStatement(s); }}
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50 transition"
                            title="Download the settlement statement as PDF"
                          >
                            <ReceiptText className="w-3.5 h-3.5" />
                            Statement
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {!isCardView && (<>
        {/* Date and time range */}
        <section className="rounded-2xl bg-white border border-zinc-200 shadow-sm p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
              <CalendarDays className="w-4 h-4 text-zinc-400" />
              Date range
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => runExport("pdf")}
                disabled={!!exporting}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50 transition"
                title="Export selected range to PDF"
              >
                <FileDown className="w-3.5 h-3.5" />
                {exporting === "pdf" ? "Exporting..." : "PDF"}
              </button>
              <button
                onClick={() => runExport("excel")}
                disabled={!!exporting}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50 transition"
                title="Export selected range to Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {exporting === "excel" ? "Exporting..." : "Excel"}
              </button>
              {(range.fromDate || range.toDate) && (
                <button
                  onClick={clearRange}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto mt-3 -mx-4 px-4 pb-0.5">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                className={`px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition ${
                  rangePreset === p.key
                    ? "bg-ink-950 text-white border-ink-950 font-medium"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setRangePreset("custom")}
              className={`px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition ${
                rangePreset === "custom"
                  ? "bg-ink-950 text-white border-ink-950 font-medium"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
              }`}
            >
              Custom
            </button>
          </div>

          {rangePreset === "custom" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <RangeField
                label="From"
                idPrefix="range-from"
                date={range.fromDate}
                time={range.fromTime}
                onDate={(v) => updateRange({ fromDate: v, ...(v ? {} : { fromTime: "" }) })}
                onTime={(v) => updateRange({ fromTime: v })}
              />
              <RangeField
                label="To"
                idPrefix="range-to"
                date={range.toDate}
                time={range.toTime}
                onDate={(v) => updateRange({ toDate: v, ...(v ? {} : { toTime: "" }) })}
                onTime={(v) => updateRange({ toTime: v })}
              />
            </div>
          )}
        </section>

        {/* Transactions feed */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-zinc-500 text-sm">
            <ReceiptText className="w-4 h-4" />
            <span>
              <span className="num">{total}</span> transaction{total === 1 ? "" : "s"}
            </span>
            <div className="ml-auto flex items-center gap-2 rounded-xl border border-zinc-200 bg-white pl-3 pr-1 py-1 shadow-sm">
              <ArrowUpDown className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="text-xs text-zinc-400">Sort</span>
              <select
                value={sortOpt}
                onChange={(e) => setSortOpt(e.target.value)}
                className="rounded-lg bg-transparent py-1.5 pr-1 text-sm font-medium text-zinc-800 focus:outline-none"
                title="Sort"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {transactions.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 py-14 text-center text-zinc-400">
              {loading ? "Loading..." : "No transactions here yet"}
            </div>
          )}

          {transactions.length > 0 && (
            <div className="rounded-2xl bg-white border border-zinc-200 shadow-sm divide-y divide-zinc-100 overflow-hidden">
              {transactions.map((t) => (
                <article key={t.paymentId} className={`p-4 ${splitGroupInfo.has(t.paymentId) ? "bg-indigo-50/40" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900">
                        {t.failed ? (
                          "Payment attempt"
                        ) : t.billNo != null ? (
                          <>Bill <span className="num">#{t.billNo}</span></>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 align-middle">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Bill ongoing
                          </span>
                        )}
                        {t.tableId != null && (
                          <span className="text-zinc-400 font-normal"> · Table {t.tableId}</span>
                        )}
                        {splitGroupInfo.has(t.paymentId) && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 align-middle">
                            Split payment {splitGroupInfo.get(t.paymentId).idx}/{splitGroupInfo.get(t.paymentId).total}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {t.methodName}
                        {fmtDate(t.createdAt) !== "-" && ` · ${fmtDate(t.createdAt)}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`num text-lg font-semibold ${t.failed ? "text-zinc-400 line-through" : "text-zinc-900"}`}>
                        {CURRENCY} {fmt(t.failed ? t.billAmount : r2(t.restaurantPayoutAmount))}
                      </p>
                      {!t.failed && <p className="text-[10px] text-zinc-400">you receive</p>}
                      {!t.failed && Number(t.balanceAmount) > 0 && (
                        <p className="num text-xs text-amber-600 mt-0.5">bill remaining {fmt(t.balanceAmount)}</p>
                      )}
                    </div>
                  </div>

                  {!t.failed && (
                    <p className="text-xs text-zinc-400 mt-1">
                      Gross {CURRENCY} {fmt(t.restaurantGrossAmount ?? ((Number(t.paidBillAmount ?? 0) + Number(t.tipAmount ?? 0)) || t.billAmount))}
                      {" "}− {CURRENCY} {fmt(r2(t.platformFeeAmount))} platform fee
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                    {t.failed ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-red-50 text-red-700 border-red-200">
                        {t.failReason === "CANCELLED" ? "Cancelled" : "Payment failed"}
                      </span>
                    ) : (
                      <PayoutBadge status={t.payout?.status || "PENDING"} />
                    )}
                    {!t.failed && t.payout?.batchNo != null && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-sky-50 text-sky-700 border-sky-200">
                        Batch {fmtBatchNo(t.payout.batchNo)}
                      </span>
                    )}
                    {t.payout?.transferRef && (
                      <span className="num text-xs text-zinc-400">
                        Ref {t.payout.transferRef}
                        {t.payout.transferDate &&
                          ` · ${new Date(t.payout.transferDate).toLocaleDateString("en-AE", { timeZone: "UTC" })}`}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {transactions.length < total && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 text-sm transition"
            >
              <ChevronDown className="w-4 h-4" />
              {loading ? "Loading..." : "Load more"}
            </button>
          )}
        </section>
        </>)}
      </main>

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}

      {batchDetail && (
        <BatchDetailSheet batch={batchDetail} onClose={() => setBatchDetail(null)} />
      )}
    </div>
  );
}
