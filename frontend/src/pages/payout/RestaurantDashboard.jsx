import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store, LogOut, KeyRound, RefreshCw, ReceiptText, ChevronDown, ArrowUpDown,
  CalendarDays, X
} from "lucide-react";
import api, { getStoredUser, clearSession } from "../../lib/payoutApi.js";
import ChangePasswordModal from "../../component/payout/ChangePasswordModal.jsx";

const CURRENCY = "AED";

const fmt = (n) =>
  Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "-" : dt.toLocaleString("en-AE", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  });
};

function PayoutBadge({ status }) {
  const transferred = status === "TRANSFERRED";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${
        transferred
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-amber-50 text-amber-700 border-amber-200"
      }`}
    >
      {transferred ? "Paid to you" : "Awaiting payout"}
    </span>
  );
}

const FILTER_CHIPS = [
  { key: "", label: "All" },
  { key: "PENDING", label: "Awaiting" },
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

  const owed = summary
    ? Math.max(0, Number(summary.totalCollected) - Number(summary.totalTransferred))
    : 0;

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
          <p className="text-zinc-400 text-sm">Collected through QR payments</p>
          <p className="num text-3xl sm:text-4xl font-semibold tracking-tight mt-1.5">
            {CURRENCY} {fmt(summary?.totalCollected)}
          </p>
          <div className="grid grid-cols-2 gap-px mt-6 rounded-xl overflow-hidden bg-ink-700">
            <div className="bg-ink-900 px-4 py-3">
              <p className="text-xs text-zinc-400">Awaiting payout</p>
              <p className="num text-base sm:text-lg font-semibold text-amber-400 mt-0.5">
                {CURRENCY} {fmt(owed)}
              </p>
            </div>
            <div className="bg-ink-900 px-4 py-3">
              <p className="text-xs text-zinc-400">Paid to you</p>
              <p className="num text-base sm:text-lg font-semibold text-emerald-400 mt-0.5">
                {CURRENCY} {fmt(summary?.totalTransferred)}
              </p>
            </div>
          </div>
          <p className="text-zinc-500 text-xs mt-4">
            Payments are collected by DeynoQR and settled to your bank within about 2 working days.
          </p>
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

        {/* Date and time range */}
        <section className="rounded-2xl bg-white border border-zinc-200 shadow-sm p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
              <CalendarDays className="w-4 h-4 text-zinc-400" />
              Date range
            </div>
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
                        {t.kotMasterId != null ? (
                          <>Order <span className="num">#{t.kotMasterId}</span></>
                        ) : (
                          "Payment attempt"
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
                        {CURRENCY} {fmt(t.failed ? t.billAmount : t.restaurantPayoutAmount)}
                      </p>
                      {!t.failed && <p className="text-[10px] text-zinc-400">you receive</p>}
                      {!t.failed && Number(t.balanceAmount) > 0 && (
                        <p className="num text-xs text-amber-600 mt-0.5">bill remaining {fmt(t.balanceAmount)}</p>
                      )}
                    </div>
                  </div>

                  {!t.failed && (
                    <p className="text-xs text-zinc-400 mt-1">
                      Bill {CURRENCY} {fmt(t.billAmount)}
                      {Number(t.tipAmount) > 0 && ` + tip ${fmt(t.tipAmount)}`}
                      {" "}− {CURRENCY} {fmt(t.platformFeeAmount)} platform fee
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
                    {t.payout?.transferRef && (
                      <span className="num text-xs text-zinc-400">
                        Ref {t.payout.transferRef}
                        {t.payout.transferDate &&
                          ` · ${new Date(t.payout.transferDate).toLocaleDateString("en-AE")}`}
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
      </main>

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}
