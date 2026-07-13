import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  QrCode, LogOut, RefreshCw, CheckCircle2, Banknote, Clock3, Wallet,
  ChevronLeft, ChevronRight, X, KeyRound
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
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
};

const PAYOUT_BADGE = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-blue-50 text-blue-700 border-blue-200",
  TRANSFERRED: "bg-emerald-50 text-emerald-700 border-emerald-200"
};

const PAID_BADGE = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200"
};

function SummaryCard({ icon: Icon, label, value, tint }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
      <div className={`rounded-xl p-2.5 ${tint}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-lg font-semibold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function TransferModal({ txn, onClose, onDone }) {
  const [transferRef, setTransferRef] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.post(`/payouts/${txn.paymentId}/transfer`, { transferRef, transferDate, notes });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to mark transferred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Mark as transferred</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500">
          Payment <span className="font-medium text-gray-700">#{txn.paymentId}</span> —{" "}
          {txn.restaurantName} — {CURRENCY} {fmt(txn.paidAmount)}
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Cheque / transfer reference *
          </label>
          <input
            value={transferRef}
            onChange={(e) => setTransferRef(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="e.g. CHQ-000123"
            required
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Transfer date</label>
          <input
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium"
          >
            {saving ? "Saving…" : "Confirm transfer"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const isCompany = user?.role === "superadmin";
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [methods, setMethods] = useState([]);
  const [methodBusy, setMethodBusy] = useState(null);

  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [loading, setLoading] = useState(false);
  const [restaurants, setRestaurants] = useState([]);
  const [transferTxn, setTransferTxn] = useState(null);
  const [actionBusy, setActionBusy] = useState(null);

  const [filters, setFilters] = useState({
    shopId: "",
    status: "",
    payoutStatus: "",
    from: "",
    to: ""
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (filters.shopId) params.shopId = filters.shopId;
      if (filters.status) params.status = filters.status;
      if (filters.payoutStatus) params.payoutStatus = filters.payoutStatus;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      const summaryParams = filters.shopId ? { shopId: filters.shopId } : {};
      const [txnRes, sumRes] = await Promise.all([
        api.get("/transactions", { params }),
        api.get("/transactions/summary", { params: summaryParams })
      ]);
      setTransactions(txnRes.data.transactions);
      setTotal(txnRes.data.total);
      setSummary(sumRes.data);
    } catch (err) {
      console.error("Load failed:", err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isCompany) return;
    api.get("/restaurants")
      .then(({ data }) => setRestaurants(data.restaurants || []))
      .catch(() => {});
    api.get("/methods")
      .then(({ data }) => setMethods(data.methods || []))
      .catch(() => {});
  }, [isCompany]);

  async function toggleMethod(m) {
    setMethodBusy(m.paymentMethodId);
    try {
      const { data } = await api.post(`/methods/${m.paymentMethodId}/toggle`);
      setMethods((prev) =>
        prev.map((x) =>
          x.paymentMethodId === m.paymentMethodId ? { ...x, blocked: data.blocked } : x
        )
      );
    } catch (err) {
      alert(err.response?.data?.error || "Failed to update method");
    } finally {
      setMethodBusy(null);
    }
  }

  function logout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  function setFilter(key, value) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  async function approve(txn) {
    setActionBusy(txn.paymentId);
    try {
      await api.post(`/payouts/${txn.paymentId}/approve`);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || "Approve failed");
    } finally {
      setActionBusy(null);
    }
  }

  const totals = summary?.totals;

  const summaryCards = useMemo(() => {
    if (!totals) return [];
    return [
      { icon: Wallet, label: "Collected", value: `${CURRENCY} ${fmt(totals.totalCollected)}`, tint: "bg-gray-100 text-gray-700" },
      { icon: Clock3, label: "Pending payout", value: `${CURRENCY} ${fmt(totals.totalPendingPayout)}`, tint: "bg-amber-50 text-amber-600" },
      { icon: CheckCircle2, label: "Approved", value: `${CURRENCY} ${fmt(totals.totalApproved)}`, tint: "bg-blue-50 text-blue-600" },
      { icon: Banknote, label: "Transferred", value: `${CURRENCY} ${fmt(totals.totalTransferred)}`, tint: "bg-emerald-50 text-emerald-600" }
    ];
  }, [totals]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-6 h-6 text-emerald-600" />
            <div>
              <h1 className="font-bold text-gray-800 leading-tight">DeynoQR — Super Admin</h1>
              <p className="text-xs text-gray-400">
                All restaurants · signed in as {user?.username}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-50 border border-gray-200"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-50 border border-gray-200"
              title="Change password"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 border border-gray-200"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {summaryCards.map((c) => (
            <SummaryCard key={c.label} {...c} />
          ))}
        </div>

        {/* Per-restaurant rollup (company only) */}
        {isCompany && summary?.byRestaurant?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Owed per restaurant</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="px-4 py-2 font-medium">Restaurant</th>
                    <th className="px-4 py-2 font-medium text-right">Transactions</th>
                    <th className="px-4 py-2 font-medium text-right">Collected</th>
                    <th className="px-4 py-2 font-medium text-right">Transferred</th>
                    <th className="px-4 py-2 font-medium text-right">Still owed</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byRestaurant.map((r) => (
                    <tr key={r.shopId} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 text-gray-700 font-medium">{r.restaurantName}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{r.txnCount}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{CURRENCY} {fmt(r.totalCollected)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600">{CURRENCY} {fmt(r.totalTransferred)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-amber-600">{CURRENCY} {fmt(r.totalOwed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payment methods (controls what customers see in the QR menu) */}
        {methods.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">Payment methods</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Blocked methods disappear from the customer payment screen in the QR menu.
              </p>
            </div>
            <div className="p-4 flex flex-wrap gap-3">
              {methods.map((m) => (
                <div
                  key={m.paymentMethodId}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 ${
                    m.blocked ? "border-red-100 bg-red-50/50" : "border-gray-100 bg-gray-50/50"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-700">{m.name}</p>
                    <p className={`text-xs ${m.blocked ? "text-red-500" : "text-emerald-600"}`}>
                      {m.blocked ? "Blocked" : "Active"}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleMethod(m)}
                    disabled={methodBusy === m.paymentMethodId}
                    role="switch"
                    aria-checked={!m.blocked}
                    className={`relative w-10 h-5.5 rounded-full transition disabled:opacity-50 ${
                      m.blocked ? "bg-gray-300" : "bg-emerald-500"
                    }`}
                    style={{ height: "22px" }}
                    title={m.blocked ? "Unblock" : "Block"}
                  >
                    <span
                      className="absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-all"
                      style={{ left: m.blocked ? "2px" : "20px" }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
          {isCompany && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Restaurant</label>
              <select
                value={filters.shopId}
                onChange={(e) => setFilter("shopId", e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                <option value="">All</option>
                {restaurants.map((r) => (
                  <option key={r.RestaurantID} value={r.RestaurantID}>{r.Name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Payment status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">All</option>
              <option value="PAID">PAID</option>
              <option value="PENDING">PENDING</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Payout status</label>
            <select
              value={filters.payoutStatus}
              onChange={(e) => setFilter("payoutStatus", e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">All</option>
              <option value="NONE">Not started</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="TRANSFERRED">Transferred</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilter("from", e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilter("to", e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            />
          </div>
          {(filters.shopId || filters.status || filters.payoutStatus || filters.from || filters.to) && (
            <button
              onClick={() => {
                setPage(1);
                setFilters({ shopId: "", status: "", payoutStatus: "", from: "", to: "" });
              }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Transactions table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Transactions <span className="text-gray-400 font-normal">({total})</span>
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2 font-medium">#</th>
                  {isCompany && <th className="px-4 py-2 font-medium">Restaurant</th>}
                  <th className="px-4 py-2 font-medium">Order (KOT)</th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium text-right">Bill</th>
                  <th className="px-4 py-2 font-medium text-right">Paid</th>
                  <th className="px-4 py-2 font-medium text-right">Balance</th>
                  <th className="px-4 py-2 font-medium">Payment</th>
                  <th className="px-4 py-2 font-medium">Payout</th>
                  <th className="px-4 py-2 font-medium">Transfer ref</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  {isCompany && <th className="px-4 py-2 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={isCompany ? 12 : 10} className="px-4 py-10 text-center text-gray-400">
                      {loading ? "Loading…" : "No transactions found"}
                    </td>
                  </tr>
                )}
                {transactions.map((t) => {
                  const payoutStatus = t.payout?.status || "PENDING";
                  return (
                    <tr key={t.paymentId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-500">{t.paymentId}</td>
                      {isCompany && (
                        <td className="px-4 py-2.5 text-gray-700 font-medium">{t.restaurantName}</td>
                      )}
                      <td className="px-4 py-2.5 text-gray-600">
                        {t.kotMasterId}
                        {t.tableId != null && <span className="text-gray-400"> · T{t.tableId}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{t.methodName}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{fmt(t.billAmount)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(t.paidAmount)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{fmt(t.balanceAmount)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${PAID_BADGE[t.paidStatus] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          {t.paidStatus}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${PAYOUT_BADGE[payoutStatus] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          {payoutStatus}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">
                        {t.payout?.transferRef || "—"}
                        {t.payout?.transferDate && (
                          <span className="block text-gray-400">
                            {new Date(t.payout.transferDate).toLocaleDateString("en-AE")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                      {isCompany && (
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {payoutStatus === "PENDING" && (
                            <button
                              onClick={() => approve(t)}
                              disabled={actionBusy === t.paymentId}
                              className="px-2.5 py-1 text-xs rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50 mr-1.5"
                            >
                              Approve
                            </button>
                          )}
                          {payoutStatus !== "TRANSFERRED" && (
                            <button
                              onClick={() => setTransferTxn(t)}
                              className="px-2.5 py-1 text-xs rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                            >
                              Transfer
                            </button>
                          )}
                          {payoutStatus === "TRANSFERRED" && (
                            <span className="text-xs text-gray-300">Done</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {transferTxn && (
        <TransferModal
          txn={transferTxn}
          onClose={() => setTransferTxn(null)}
          onDone={() => {
            setTransferTxn(null);
            load();
          }}
        />
      )}

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}
