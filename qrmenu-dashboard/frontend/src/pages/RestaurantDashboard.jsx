import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UtensilsCrossed, LogOut, KeyRound, RefreshCw, Banknote,
  Hourglass, ReceiptText, ChevronDown
} from "lucide-react";
import api, { getStoredUser, clearSession } from "../api.js";
import ChangePasswordModal from "../components/ChangePasswordModal.jsx";

const CURRENCY = "AED";

const fmt = (n) =>
  Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleString("en-AE", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  });
};

const PAYOUT_LABEL = {
  PENDING: { text: "Awaiting payout", cls: "bg-amber-400/10 text-amber-300 border-amber-400/30" },
  APPROVED: { text: "Payout approved", cls: "bg-sky-400/10 text-sky-300 border-sky-400/30" },
  TRANSFERRED: { text: "Paid to you", cls: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30" }
};

const FILTER_CHIPS = [
  { key: "", label: "All" },
  { key: "PENDING", label: "Awaiting" },
  { key: "APPROVED", label: "Approved" },
  { key: "TRANSFERRED", label: "Paid out" }
];

const PAGE_SIZE = 25;

export default function RestaurantDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();

  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [payoutFilter, setPayoutFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const load = useCallback(async (pageToLoad, filter, append) => {
    setLoading(true);
    try {
      const params = { page: pageToLoad, pageSize: PAGE_SIZE };
      if (filter) params.payoutStatus = filter;

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
  }, []);

  useEffect(() => {
    load(1, payoutFilter, false);
    setPage(1);
  }, [payoutFilter, load]);

  function logout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  function loadMore() {
    const next = page + 1;
    setPage(next);
    load(next, payoutFilter, true);
  }

  const owed = summary
    ? Math.max(0, Number(summary.totalCollected) - Number(summary.totalTransferred))
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-500/15 rounded-xl p-2">
              <UtensilsCrossed className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="font-semibold leading-tight">{user?.displayName || "My Restaurant"}</h1>
              <p className="text-xs text-slate-400">QR payments · powered by DeynoQR</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => load(1, payoutFilter, false)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              title="Change password"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Earnings hero */}
        <section className="rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 shadow-lg shadow-emerald-900/30">
          <p className="text-emerald-100/80 text-sm">Collected through QR payments</p>
          <p className="text-4xl font-bold tracking-tight mt-1">
            {CURRENCY} {fmt(summary?.totalCollected)}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="rounded-2xl bg-white/10 backdrop-blur px-4 py-3">
              <div className="flex items-center gap-1.5 text-emerald-100/80 text-xs">
                <Hourglass className="w-3.5 h-3.5" /> With DeynoQR
              </div>
              <p className="text-lg font-semibold mt-0.5">{CURRENCY} {fmt(owed)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 backdrop-blur px-4 py-3">
              <div className="flex items-center gap-1.5 text-emerald-100/80 text-xs">
                <Banknote className="w-3.5 h-3.5" /> Paid to you
              </div>
              <p className="text-lg font-semibold mt-0.5">{CURRENCY} {fmt(summary?.totalTransferred)}</p>
            </div>
          </div>
          <p className="text-emerald-100/60 text-xs mt-4">
            Payments are collected by DeynoQR and settled to your bank within ~2 working days.
          </p>
        </section>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTER_CHIPS.map((c) => (
            <button
              key={c.key}
              onClick={() => setPayoutFilter(c.key)}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap border transition ${
                payoutFilter === c.key
                  ? "bg-emerald-500 text-slate-950 border-emerald-500 font-medium"
                  : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Transactions feed */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <ReceiptText className="w-4 h-4" />
            <span>{total} transaction{total === 1 ? "" : "s"}</span>
          </div>

          {transactions.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-800 py-14 text-center text-slate-500">
              {loading ? "Loading…" : "No transactions here yet"}
            </div>
          )}

          {transactions.map((t) => {
            const payout = PAYOUT_LABEL[t.payout?.status] || PAYOUT_LABEL.PENDING;
            return (
              <article
                key={t.paymentId}
                className="rounded-2xl bg-slate-900 border border-slate-800 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      Order #{t.kotMasterId}
                      {t.tableId != null && (
                        <span className="text-slate-500 font-normal"> · Table {t.tableId}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t.methodName} · {fmtDate(t.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">{CURRENCY} {fmt(t.paidAmount)}</p>
                    {Number(t.balanceAmount) > 0 && (
                      <p className="text-xs text-amber-400">balance {fmt(t.balanceAmount)}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs border ${payout.cls}`}>
                    {payout.text}
                  </span>
                  {t.payout?.transferRef && (
                    <span className="text-xs text-slate-400">
                      Ref {t.payout.transferRef}
                      {t.payout.transferDate &&
                        ` · ${new Date(t.payout.transferDate).toLocaleDateString("en-AE")}`}
                    </span>
                  )}
                </div>
              </article>
            );
          })}

          {transactions.length < total && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-slate-800 text-slate-300 hover:bg-slate-900 disabled:opacity-50 text-sm"
            >
              <ChevronDown className="w-4 h-4" />
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </section>
      </main>

      {showPasswordModal && (
        <ChangePasswordModal dark onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}
