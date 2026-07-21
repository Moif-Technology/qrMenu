import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  QrCode, LogOut, RefreshCw, Banknote, ChevronLeft, ChevronRight, X,
  KeyRound, Search, ShieldAlert, Store, ArrowUp, ArrowDown, ArrowUpDown
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
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
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
      {transferred ? "Transferred" : "Awaiting"}
    </span>
  );
}

function PaidBadge({ status }) {
  const cls =
    status === "PAID"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "FAILED"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-zinc-100 text-zinc-600 border-zinc-200";
  const label = status === "PAID" ? "Paid" : status === "FAILED" ? "Failed" : "Pending";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

function Stat({ label, value, tone = "default", sub }) {
  const valueCls =
    tone === "amber" ? "text-amber-400" : tone === "emerald" ? "text-emerald-400" : "text-white";
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className={`num text-xl sm:text-2xl font-semibold mt-1 ${valueCls}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function TransferModal({ txns, scope, onClose, onDone }) {
  // Two modes: explicit list of transactions (txns), or "everything awaiting
  // that matches the current filters" (scope) handled server-side.
  const isAll = !txns;
  const [transferRef, setTransferRef] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!isAll) return;
    api.post("/payouts/transfer-all", { ...scope, preview: true })
      .then(({ data }) => setPreview({ count: data.count, amount: data.amount }))
      .catch(() => setPreview({ count: 0, amount: 0 }));
    // scope is captured on mount; the modal is closed before filters can change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAll]);

  const totalAmount = isAll
    ? preview?.amount
    : txns.reduce((s, t) => s + Number(t.paidAmount || 0), 0);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (isAll) {
        const { data } = await api.post("/payouts/transfer-all", {
          ...scope,
          transferRef,
          transferDate,
          notes
        });
        alert(`${data.transferredCount} payments marked transferred under ${data.transferRef}.`);
      } else {
        const { data } = await api.post("/payouts/bulk-transfer", {
          paymentIds: txns.map((t) => t.paymentId),
          transferRef,
          transferDate,
          notes
        });
        if (data.skipped?.length) {
          alert(`${data.transferredCount} transferred, ${data.skipped.length} skipped (already transferred or not found).`);
        }
      }
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to mark transferred");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-xl bg-white border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm px-4">
      <form
        onSubmit={submit}
        className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">
            {isAll
              ? "Transfer all awaiting"
              : txns.length === 1
                ? "Transfer payment"
                : `Transfer ${txns.length} payments`}
          </h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-xl bg-ink-950 px-4 py-3.5">
          {isAll ? (
            <p className="text-sm text-zinc-400">
              {preview == null
                ? "Counting awaiting payments..."
                : `${preview.count} awaiting payments match your current filters, one bank reference for all of them`}
            </p>
          ) : txns.length === 1 ? (
            <p className="text-sm text-zinc-400">
              Payment <span className="num text-zinc-200">#{txns[0].paymentId}</span> from{" "}
              <span className="text-zinc-200">{txns[0].restaurantName}</span>
            </p>
          ) : (
            <p className="text-sm text-zinc-400">
              {txns.length} payments, one bank reference for all of them
            </p>
          )}
          <p className="num text-xl font-semibold text-white mt-1">
            {totalAmount == null ? "..." : `${CURRENCY} ${fmt(totalAmount)}`}
          </p>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Transfers are final. Once marked transferred there is no undo, so confirm the money
            has actually left the account.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="transfer-ref" className="block text-sm text-zinc-600">
            Cheque / bank reference
          </label>
          <input
            id="transfer-ref"
            value={transferRef}
            onChange={(e) => setTransferRef(e.target.value)}
            className={inputCls}
            placeholder="e.g. CHQ-000123"
            required
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="transfer-date" className="block text-sm text-zinc-600">Transfer date</label>
          <input
            id="transfer-date"
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="transfer-notes" className="block text-sm text-zinc-600">Notes (optional)</label>
          <textarea
            id="transfer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || (isAll && (!preview || preview.count === 0))}
            className="px-4 py-2 text-sm rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-60 text-white font-semibold transition"
          >
            {saving ? "Saving..." : "Confirm transfer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-zinc-400 shrink-0">{label}</span>
      <span className={`text-sm text-zinc-700 text-right ${mono ? "num" : ""}`}>{value ?? "-"}</span>
    </div>
  );
}

function TxnDetailModal({ txn, onClose }) {
  const payoutStatus = txn.payout?.status || "PENDING";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-zinc-900">
            {txn.failed ? "Failed payment attempt" : <>Payment <span className="num">#{txn.paymentId}</span></>}
          </h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="divide-y divide-zinc-100">
          <div className="py-3">
            <p className="text-xs font-medium text-zinc-400 mb-1.5">Transaction</p>
            <DetailRow label="Restaurant" value={txn.restaurantName} />
            <DetailRow label="Order (KOT)" value={txn.kotMasterId} mono />
            <DetailRow label="Table" value={txn.tableId != null ? `T${txn.tableId}` : "-"} />
            <DetailRow label="Payment method" value={txn.methodName} />
            <DetailRow label="Date" value={fmtDate(txn.createdAt)} />
          </div>

          <div className="py-3">
            <p className="text-xs font-medium text-zinc-400 mb-1.5">Amounts</p>
            <DetailRow label="Bill amount" value={`${CURRENCY} ${fmt(txn.billAmount)}`} mono />
            <DetailRow label="Paid amount" value={`${CURRENCY} ${fmt(txn.paidAmount)}`} mono />
            <DetailRow label="Balance" value={`${CURRENCY} ${fmt(txn.balanceAmount)}`} mono />
            <DetailRow label="Payment status" value={<PaidBadge status={txn.paidStatus} />} />
          </div>

          {txn.failed ? (
            <div className="py-3">
              <p className="text-xs font-medium text-zinc-400 mb-1.5">Failure</p>
              <DetailRow
                label="Reason"
                value={txn.failReason === "CANCELLED" ? "Cancelled by customer" : "Declined by Telr"}
              />
              <DetailRow label="Telr order ref" value={txn.orderRef} mono />
            </div>
          ) : (
            <div className="py-3">
              <p className="text-xs font-medium text-zinc-400 mb-1.5">Settlement</p>
              <DetailRow label="Status" value={<PayoutBadge status={payoutStatus} />} />
              <DetailRow
                label="Payout amount"
                value={txn.payout?.amount != null ? `${CURRENCY} ${fmt(txn.payout.amount)}` : "-"}
                mono
              />
              <DetailRow label="Transfer ref" value={txn.payout?.transferRef} mono />
              <DetailRow
                label="Transfer date"
                value={txn.payout?.transferDate ? new Date(txn.payout.transferDate).toLocaleDateString("en-AE") : "-"}
              />
              <DetailRow label="Transferred by" value={txn.payout?.transferredBy} />
              <DetailRow label="Notes" value={txn.payout?.notes} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full sm:w-auto rounded-xl bg-white border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition";

function SortTh({ label, k, sort, onSort, align = "left" }) {
  const active = sort.key === k;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`px-4 py-2.5 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-zinc-700 transition ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-zinc-700" : ""}`}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <Icon className={`w-3 h-3 ${active ? "" : "opacity-40"}`} />
      </button>
    </th>
  );
}

const MOBILE_SORTS = [
  { v: "id:desc", label: "Newest first" },
  { v: "id:asc", label: "Oldest first" },
  { v: "paid:desc", label: "Highest paid" },
  { v: "paid:asc", label: "Lowest paid" },
  { v: "restaurant:asc", label: "Restaurant A-Z" }
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const isCompany = user?.role === "superadmin";
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [methods, setMethods] = useState([]);
  const [methodBusy, setMethodBusy] = useState(null);
  const [serviceFee, setServiceFee] = useState(null);
  const [serviceFeeDraft, setServiceFeeDraft] = useState("");
  const [serviceFeeSaving, setServiceFeeSaving] = useState(false);

  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [loading, setLoading] = useState(false);
  const [restaurants, setRestaurants] = useState([]);
  const [transferTxns, setTransferTxns] = useState(null);
  const [transferAllOpen, setTransferAllOpen] = useState(false);
  const [detailTxn, setDetailTxn] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [sort, setSort] = useState({ key: "id", dir: "desc" });

  const [filters, setFilters] = useState({
    shopId: "",
    status: "",
    payoutStatus: "",
    methodId: "",
    search: "",
    from: "",
    to: "",
    minAmount: "",
    maxAmount: ""
  });
  const [searchDraft, setSearchDraft] = useState("");
  const [amountDraft, setAmountDraft] = useState({ min: "", max: "" });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (filters.shopId) params.shopId = filters.shopId;
      if (filters.status) params.status = filters.status;
      if (filters.payoutStatus) params.payoutStatus = filters.payoutStatus;
      if (filters.methodId) params.methodId = filters.methodId;
      if (filters.search) params.search = filters.search;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.minAmount) params.minAmount = filters.minAmount;
      if (filters.maxAmount) params.maxAmount = filters.maxAmount;
      params.sort = sort.key;
      params.dir = sort.dir;

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
  }, [page, filters, sort]);

  useEffect(() => {
    load();
  }, [load]);

  // Drop selection when the visible page changes
  useEffect(() => {
    setSelected(new Set());
  }, [page, filters, sort]);

  // Debounced search: apply the typed term 400ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => (f.search === searchDraft ? f : { ...f, search: searchDraft }));
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  // Debounced amount range, same pattern as search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) =>
        f.minAmount === amountDraft.min && f.maxAmount === amountDraft.max
          ? f
          : { ...f, minAmount: amountDraft.min, maxAmount: amountDraft.max }
      );
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [amountDraft]);

  useEffect(() => {
    if (!isCompany) return;
    api.get("/restaurants")
      .then(({ data }) => setRestaurants(data.restaurants || []))
      .catch(() => {});
    api.get("/methods")
      .then(({ data }) => setMethods(data.methods || []))
      .catch(() => {});
    api.get("/settings/service-fee")
      .then(({ data }) => {
        setServiceFee(data);
        setServiceFeeDraft(String(data.ratePercent));
      })
      .catch(() => {});
  }, [isCompany]);

  async function saveServiceFee(e) {
    e.preventDefault();
    const ratePercent = Number(serviceFeeDraft);
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      alert("Enter a valid percentage between 0 and 100");
      return;
    }
    setServiceFeeSaving(true);
    try {
      const { data } = await api.put("/settings/service-fee", { ratePercent });
      setServiceFee((prev) => ({ ...prev, ratePercent: data.ratePercent, updatedBy: user?.username, updatedOn: new Date().toISOString() }));
      setServiceFeeDraft(String(data.ratePercent));
    } catch (err) {
      alert(err.response?.data?.error || "Failed to update service fee");
    } finally {
      setServiceFeeSaving(false);
    }
  }

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

  function toggleSort(key) {
    setPage(1);
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "restaurant" ? "asc" : "desc" }
    );
  }

  // ---- bulk selection helpers ----
  const selectableTxns = transactions.filter(
    (t) => !t.failed && (t.payout?.status || "PENDING") !== "TRANSFERRED"
  );
  const selectedTxns = transactions.filter((t) => selected.has(t.paymentId));
  const allSelected = selectableTxns.length > 0 && selectableTxns.every((t) => selected.has(t.paymentId));

  function toggleSelect(paymentId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(selectableTxns.map((t) => t.paymentId)));
  }

  const totals = summary?.totals;

  const hasFilters =
    filters.shopId || filters.status || filters.payoutStatus || filters.methodId ||
    filters.search || filters.from || filters.to || filters.minAmount || filters.maxAmount;

  const stats = useMemo(() => {
    if (!totals) return [];
    return [
      {
        label: "Collected",
        value: `${CURRENCY} ${fmt(totals.totalCollected)}`,
        sub: `${totals.txnCount} transactions`
      },
      { label: "Awaiting transfer", value: `${CURRENCY} ${fmt(totals.totalPendingPayout)}`, tone: "amber" },
      { label: "Transferred", value: `${CURRENCY} ${fmt(totals.totalTransferred)}`, tone: "emerald" }
    ];
  }, [totals]);

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur border-b border-zinc-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="rounded-xl bg-ink-950 p-1.5 shrink-0">
              <QrCode className="text-emerald-400" style={{ width: 18, height: 18 }} />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-zinc-900 leading-tight truncate">DeynoQR Payouts</h1>
              <p className="text-xs text-zinc-500 truncate">
                Super admin · {user?.username}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={load}
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
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-sm text-zinc-600 hover:text-zinc-800 hover:bg-zinc-50 border border-zinc-200 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Money position: the one dark anchor on the page */}
        <section className="rounded-2xl bg-ink-950 shadow-sm grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-ink-700 overflow-hidden">
          {stats.length === 0 ? (
            <div className="px-5 py-4 sm:col-span-3">
              <div className="h-4 w-24 rounded bg-ink-800 animate-pulse" />
              <div className="h-7 w-40 rounded bg-ink-800 animate-pulse mt-2" />
            </div>
          ) : (
            stats.map((s) => <Stat key={s.label} {...s} />)
          )}
        </section>

        {/* Owed per restaurant */}
        {isCompany && summary?.byRestaurant?.length > 0 && (
          <section className="rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center gap-2">
              <Store className="w-4 h-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-800">Owed per restaurant</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-140 text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                    <th className="px-5 py-2.5 font-medium">Restaurant</th>
                    <th className="px-5 py-2.5 font-medium text-right">Transactions</th>
                    <th className="px-5 py-2.5 font-medium text-right">Collected</th>
                    <th className="px-5 py-2.5 font-medium text-right">Transferred</th>
                    <th className="px-5 py-2.5 font-medium text-right">Still owed</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byRestaurant.map((r) => (
                    <tr
                      key={r.shopId}
                      onClick={() => setFilter("shopId", String(r.shopId))}
                      className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 cursor-pointer transition"
                      title="Filter transactions to this restaurant"
                    >
                      <td className="px-5 py-3 text-zinc-800 font-medium">{r.restaurantName}</td>
                      <td className="num px-5 py-3 text-right text-zinc-500">{r.txnCount}</td>
                      <td className="num px-5 py-3 text-right text-zinc-500">{fmt(r.totalCollected)}</td>
                      <td className="num px-5 py-3 text-right text-emerald-600">{fmt(r.totalTransferred)}</td>
                      <td className="num px-5 py-3 text-right font-semibold text-amber-600">{fmt(r.totalOwed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Payment methods (controls what customers see in the QR menu) */}
        {methods.length > 0 && (
          <section className="rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100">
              <h2 className="text-sm font-semibold text-zinc-800">Payment methods</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Blocked methods disappear from the customer payment screen in the QR menu.
              </p>
            </div>
            <div className="p-4 flex flex-wrap gap-2.5">
              {methods.map((m) => (
                <div
                  key={m.paymentMethodId}
                  className={`flex items-center justify-between sm:justify-start gap-4 rounded-xl border px-4 py-2.5 w-full sm:w-auto transition ${
                    m.blocked ? "border-red-200 bg-red-50/60" : "border-zinc-200 bg-zinc-50/60"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{m.name}</p>
                    <p className={`text-xs ${m.blocked ? "text-red-500" : "text-emerald-600"}`}>
                      {m.blocked ? "Blocked" : "Active"}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleMethod(m)}
                    disabled={methodBusy === m.paymentMethodId}
                    role="switch"
                    aria-checked={!m.blocked}
                    className={`relative w-10 rounded-full transition disabled:opacity-50 ${
                      m.blocked ? "bg-zinc-300" : "bg-emerald-500"
                    }`}
                    style={{ height: "22px" }}
                    title={m.blocked ? "Unblock" : "Block"}
                  >
                    <span
                      className="absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all"
                      style={{ left: m.blocked ? "2px" : "20px" }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Service fee (company-controlled %, applied at QR menu checkout) */}
        {isCompany && (
          <section className="rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100">
              <h2 className="text-sm font-semibold text-zinc-800">Service fee</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Convenience fee charged to customers on every QR menu payment. Takes effect on the next payment.
              </p>
            </div>
            <form onSubmit={saveServiceFee} className="p-4 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="service-fee-rate" className="block text-xs text-zinc-400 mb-1">Rate (%)</label>
                <input
                  id="service-fee-rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={serviceFeeDraft}
                  onChange={(e) => setServiceFeeDraft(e.target.value)}
                  className={`${inputCls} w-28`}
                />
              </div>
              <button
                type="submit"
                disabled={serviceFeeSaving || serviceFeeDraft === String(serviceFee?.ratePercent ?? "")}
                className="px-4 py-2 text-sm rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-semibold transition"
              >
                {serviceFeeSaving ? "Saving..." : "Save"}
              </button>
              {serviceFee?.updatedBy && (
                <p className="text-xs text-zinc-400">
                  Last set by {serviceFee.updatedBy}
                  {serviceFee.updatedOn && ` · ${fmtDate(serviceFee.updatedOn)}`}
                </p>
              )}
            </form>
          </section>
        )}

        {/* Filters */}
        <section className="rounded-2xl bg-white border border-zinc-200 shadow-sm p-4 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3">
          {isCompany && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Restaurant</label>
              <select
                value={filters.shopId}
                onChange={(e) => setFilter("shopId", e.target.value)}
                className={inputCls}
              >
                <option value="">All</option>
                {restaurants.map((r) => (
                  <option key={r.RestaurantID} value={r.RestaurantID}>{r.Name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="col-span-2 sm:col-auto">
            <label className="block text-xs text-zinc-400 mb-1">Search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Payment / KOT / table no"
                className={`${inputCls} pl-8 w-full sm:w-52`}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Method</label>
            <select
              value={filters.methodId}
              onChange={(e) => setFilter("methodId", e.target.value)}
              className={inputCls}
            >
              <option value="">All</option>
              <option value="1">Pay Full</option>
              <option value="2">Equal Split</option>
              <option value="3">Item Split</option>
              <option value="4">Custom Split</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Payment status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
              className={inputCls}
            >
              <option value="">All</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Settlement</label>
            <select
              value={filters.payoutStatus}
              onChange={(e) => setFilter("payoutStatus", e.target.value)}
              className={inputCls}
            >
              <option value="">All</option>
              <option value="PENDING">Awaiting transfer</option>
              <option value="TRANSFERRED">Transferred</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilter("from", e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilter("to", e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="col-span-2 sm:col-auto">
            <label className="block text-xs text-zinc-400 mb-1">Amount ({CURRENCY})</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountDraft.min}
                onChange={(e) => setAmountDraft((a) => ({ ...a, min: e.target.value }))}
                placeholder="Min"
                className={`${inputCls} w-full sm:w-24`}
              />
              <span className="text-zinc-300">-</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountDraft.max}
                onChange={(e) => setAmountDraft((a) => ({ ...a, max: e.target.value }))}
                placeholder="Max"
                className={`${inputCls} w-full sm:w-24`}
              />
            </div>
          </div>
          {hasFilters && (
            <button
              onClick={() => {
                setPage(1);
                setSearchDraft("");
                setAmountDraft({ min: "", max: "" });
                setFilters({
                  shopId: "", status: "", payoutStatus: "", methodId: "",
                  search: "", from: "", to: "", minAmount: "", maxAmount: ""
                });
              }}
              className="col-span-2 sm:col-auto px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700 underline underline-offset-4 text-left transition"
            >
              Clear filters
            </button>
          )}
        </section>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="sticky top-18 z-30 rounded-2xl bg-ink-950 text-white shadow-xl px-4 py-3 flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium">
              {selected.size} selected ·{" "}
              <span className="num">
                {CURRENCY} {fmt(selectedTxns.reduce((s, t) => s + Number(t.paidAmount || 0), 0))}
              </span>
            </p>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => setTransferTxns(selectedTxns)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-xl bg-emerald-500 text-ink-950 font-semibold hover:bg-emerald-400 active:scale-[0.98] transition"
              >
                <Banknote className="w-4 h-4" /> Transfer selected
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="px-2 py-1.5 text-sm rounded-xl hover:bg-ink-800 transition"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Transactions table */}
        <section className="rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-100 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-zinc-800">
              Transactions <span className="num text-zinc-400 font-normal">({total})</span>
            </h2>
            {isCompany && Number(totals?.totalPendingPayout) > 0 && (
              <button
                onClick={() => setTransferAllOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.98] transition"
                title="Transfer every awaiting payment matching the current filters"
              >
                <Banknote className="w-3.5 h-3.5" /> Transfer all awaiting
              </button>
            )}
            <select
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":");
                setPage(1);
                setSort({ key, dir });
              }}
              className="lg:hidden rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-600"
              title="Sort"
            >
              {MOBILE_SORTS.map((o) => (
                <option key={o.v} value={o.v}>{o.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-2 text-sm text-zinc-500 ml-auto">
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

          {/* Desktop table */}
          <div className="overflow-x-auto hidden lg:block">
            <table className="w-full min-w-240 text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                  <th className="pl-5 pr-1 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="accent-emerald-600 cursor-pointer"
                      title="Select all awaiting on this page"
                    />
                  </th>
                  <SortTh label="#" k="id" sort={sort} onSort={toggleSort} />
                  {isCompany && <SortTh label="Restaurant" k="restaurant" sort={sort} onSort={toggleSort} />}
                  <th className="px-4 py-2.5 font-medium">Order (KOT)</th>
                  <th className="px-4 py-2.5 font-medium">Method</th>
                  <SortTh label="Bill" k="bill" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Paid" k="paid" sort={sort} onSort={toggleSort} align="right" />
                  <th className="px-4 py-2.5 font-medium text-right">Balance</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                  <th className="px-4 py-2.5 font-medium">Settlement</th>
                  <th className="px-4 py-2.5 font-medium">Transfer ref</th>
                  <SortTh label="Date" k="date" sort={sort} onSort={toggleSort} />
                  {isCompany && <th className="px-4 py-2.5 font-medium text-right pr-5">Action</th>}
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={isCompany ? 13 : 11} className="px-4 py-12 text-center text-zinc-400">
                      {loading ? "Loading..." : "No transactions found"}
                    </td>
                  </tr>
                )}
                {transactions.map((t) => {
                  const payoutStatus = t.payout?.status || "PENDING";
                  return (
                    <tr
                      key={t.paymentId}
                      onClick={() => setDetailTxn(t)}
                      className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 cursor-pointer transition"
                      title="Click for full details"
                    >
                      <td className="pl-5 pr-1 py-3" onClick={(e) => e.stopPropagation()}>
                        {!t.failed && payoutStatus !== "TRANSFERRED" && (
                          <input
                            type="checkbox"
                            checked={selected.has(t.paymentId)}
                            onChange={() => toggleSelect(t.paymentId)}
                            className="accent-emerald-600 cursor-pointer"
                          />
                        )}
                      </td>
                      <td className="num px-4 py-3 text-zinc-400">{t.failed ? "-" : t.paymentId}</td>
                      {isCompany && (
                        <td className="px-4 py-3 text-zinc-800 font-medium">{t.restaurantName}</td>
                      )}
                      <td className="num px-4 py-3 text-zinc-600">
                        {t.kotMasterId}
                        {t.tableId != null && <span className="text-zinc-400"> · T{t.tableId}</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{t.methodName}</td>
                      <td className="num px-4 py-3 text-right text-zinc-600">{fmt(t.billAmount)}</td>
                      <td className="num px-4 py-3 text-right font-medium text-zinc-900">{fmt(t.paidAmount)}</td>
                      <td className="num px-4 py-3 text-right text-zinc-400">{fmt(t.balanceAmount)}</td>
                      <td className="px-4 py-3"><PaidBadge status={t.paidStatus} /></td>
                      <td className="px-4 py-3">
                        {t.failed ? <span className="text-xs text-zinc-300">-</span> : <PayoutBadge status={payoutStatus} />}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">
                        <span className="num">{t.payout?.transferRef || "-"}</span>
                        {t.payout?.transferDate && (
                          <span className="num block text-zinc-400">
                            {new Date(t.payout.transferDate).toLocaleDateString("en-AE")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                      {isCompany && (
                        <td className="px-4 py-3 pr-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {t.failed ? (
                            <span className="text-xs text-zinc-300">-</span>
                          ) : payoutStatus !== "TRANSFERRED" ? (
                            <button
                              onClick={() => setTransferTxns([t])}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 active:scale-[0.98] transition"
                            >
                              Transfer
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-400">Settled</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet card list */}
          <div className="lg:hidden divide-y divide-zinc-100">
            {transactions.length === 0 && (
              <div className="px-4 py-12 text-center text-zinc-400">
                {loading ? "Loading..." : "No transactions found"}
              </div>
            )}
            {transactions.map((t) => {
              const payoutStatus = t.payout?.status || "PENDING";
              return (
                <div key={t.paymentId} className="p-4 space-y-2.5" onClick={() => setDetailTxn(t)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {!t.failed && payoutStatus !== "TRANSFERRED" && (
                        <input
                          type="checkbox"
                          checked={selected.has(t.paymentId)}
                          onChange={() => toggleSelect(t.paymentId)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-emerald-600 mt-1 cursor-pointer shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">
                          {t.restaurantName}
                        </p>
                        <p className="num text-xs text-zinc-500 mt-0.5">
                          {t.failed ? "Failed attempt" : `#${t.paymentId}`}
                          {t.kotMasterId != null && ` · KOT ${t.kotMasterId}`}
                          {t.tableId != null && ` · T${t.tableId}`}
                        </p>
                        <p className="text-xs text-zinc-400">{t.methodName}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="num text-base font-semibold text-zinc-900">{fmt(t.paidAmount)}</p>
                      <p className="num text-xs text-zinc-400">of {fmt(t.billAmount)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <PaidBadge status={t.paidStatus} />
                    {!t.failed && <PayoutBadge status={payoutStatus} />}
                    <span className="text-xs text-zinc-400 ml-auto">{fmtDate(t.createdAt)}</span>
                  </div>

                  {t.payout?.transferRef && (
                    <p className="num text-xs text-zinc-500">
                      Ref {t.payout.transferRef}
                      {t.payout.transferDate &&
                        ` · ${new Date(t.payout.transferDate).toLocaleDateString("en-AE")}`}
                    </p>
                  )}

                  {isCompany && !t.failed && payoutStatus !== "TRANSFERRED" && (
                    <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setTransferTxns([t])}
                        className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-emerald-300 text-emerald-700 hover:bg-emerald-50 active:scale-[0.98] transition"
                      >
                        Transfer
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {transferTxns && (
        <TransferModal
          txns={transferTxns}
          onClose={() => setTransferTxns(null)}
          onDone={() => {
            setTransferTxns(null);
            setSelected(new Set());
            load();
          }}
        />
      )}

      {transferAllOpen && (
        <TransferModal
          scope={{
            shopId: filters.shopId,
            status: filters.status,
            methodId: filters.methodId,
            search: filters.search,
            from: filters.from,
            to: filters.to,
            minAmount: filters.minAmount,
            maxAmount: filters.maxAmount
          }}
          onClose={() => setTransferAllOpen(false)}
          onDone={() => {
            setTransferAllOpen(false);
            setSelected(new Set());
            load();
          }}
        />
      )}

      {detailTxn && <TxnDetailModal txn={detailTxn} onClose={() => setDetailTxn(null)} />}

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}
