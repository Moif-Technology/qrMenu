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
  PENDING: { text: "Awaiting payout", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  APPROVED: { text: "Payout approved", cls: "bg-sky-100 text-sky-800 border-sky-200" },
  TRANSFERRED: { text: "Paid to you", cls: "bg-orange-100 text-orange-800 border-orange-200" }
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
    <div className="min-h-screen bg-[#faf6f0] text-stone-800">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#faf6f0]/90 backdrop-blur border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-orange-100 rounded-xl p-2 shrink-0">
              <UtensilsCrossed className="w-5 h-5 text-orange-600" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold leading-tight truncate">{user?.displayName || "My Restaurant"}</h1>
              <p className="text-xs text-stone-400 truncate">QR payments · powered by DeynoQR</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => load(1, payoutFilter, false)}
              className="p-2 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="p-2 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100"
              title="Change password"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              className="p-2 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Earnings hero */}
        <section className="rounded-3xl bg-gradient-to-br from-orange-500 to-amber-600 text-white p-5 sm:p-6 shadow-lg shadow-orange-200">
          <p className="text-orange-50/90 text-sm">Collected through QR payments</p>
          <p className="text-3xl sm:text-4xl font-bold tracking-tight mt-1">
            {CURRENCY} {fmt(summary?.totalCollected)}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="rounded-2xl bg-white/15 backdrop-blur px-3 sm:px-4 py-3">
              <div className="flex items-center gap-1.5 text-orange-50/90 text-xs">
                <Hourglass className="w-3.5 h-3.5" /> With DeynoQR
              </div>
              <p className="text-base sm:text-lg font-semibold mt-0.5">{CURRENCY} {fmt(owed)}</p>
            </div>
            <div className="rounded-2xl bg-white/15 backdrop-blur px-3 sm:px-4 py-3">
              <div className="flex items-center gap-1.5 text-orange-50/90 text-xs">
                <Banknote className="w-3.5 h-3.5" /> Paid to you
              </div>
              <p className="text-base sm:text-lg font-semibold mt-0.5">{CURRENCY} {fmt(summary?.totalTransferred)}</p>
            </div>
          </div>
          <p className="text-orange-50/70 text-xs mt-4">
            Payments are collected by DeynoQR and settled to your bank within ~2 working days.
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
                  ? "bg-orange-600 text-white border-orange-600 font-medium shadow-sm"
                  : "border-stone-300 bg-white text-stone-600 hover:border-stone-400"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Transactions feed */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-stone-500 text-sm">
            <ReceiptText className="w-4 h-4" />
            <span>{total} transaction{total === 1 ? "" : "s"}</span>
          </div>

          {transactions.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/50 py-14 text-center text-stone-400">
              {loading ? "Loading…" : "No transactions here yet"}
            </div>
          )}

          {transactions.map((t) => {
            const payout = PAYOUT_LABEL[t.payout?.status] || PAYOUT_LABEL.PENDING;
            return (
              <article
                key={t.paymentId}
                className="rounded-2xl bg-white border border-stone-200 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      Order #{t.kotMasterId}
                      {t.tableId != null && (
                        <span className="text-stone-400 font-normal"> · Table {t.tableId}</span>
                      )}
                    </p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {t.methodName} · {fmtDate(t.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-semibold text-stone-900">{CURRENCY} {fmt(t.paidAmount)}</p>
                    {Number(t.balanceAmount) > 0 && (
                      <p className="text-xs text-amber-600">balance {fmt(t.balanceAmount)}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-stone-100">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs border ${payout.cls}`}>
                    {payout.text}
                  </span>
                  {t.payout?.transferRef && (
                    <span className="text-xs text-stone-400">
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
              className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-stone-300 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-50 text-sm"
            >
              <ChevronDown className="w-4 h-4" />
              {loading ? "Loading…" : "Load more"}
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
