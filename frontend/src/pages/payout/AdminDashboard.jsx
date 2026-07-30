import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  QrCode, LogOut, RefreshCw, Banknote, ChevronLeft, ChevronRight, X,
  KeyRound, Search, ShieldAlert, Store, ArrowUp, ArrowDown, ArrowUpDown,
  FileDown, FileSpreadsheet
} from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import api, { getStoredUser, clearSession } from "../../lib/payoutApi.js";
import ChangePasswordModal from "../../component/payout/ChangePasswordModal.jsx";
import Toast from "../../component/Toast.jsx";
import { exportPayoutsPdf, exportPayoutsExcel, fmtDateTime } from "../../lib/exportPayouts.js";

function nextTuesdayOnOrAfter(from) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7));
  return d;
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ScheduleDateModal({ count, onConfirm, onClose }) {
  const [date, setDate] = useState(() => nextTuesdayOnOrAfter(new Date()));
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    try {
      await onConfirm(toISODate(date));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm px-4">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">Schedule for Tuesday</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-zinc-500">
          Payouts run weekly on Tuesdays. Pick which Tuesday {count > 1 ? `these ${count} payments` : "this payment"} should go out.
        </p>
        <DatePicker
          selected={date}
          onChange={setDate}
          filterDate={(d) => d.getDay() === 2}
          minDate={new Date()}
          inline
        />
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-60 text-white font-semibold transition"
          >
            {saving ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CURRENCY = "AED";

const fmt = (n) =>
  Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// CreatedAt comes from the backend as a "wall clock tagged UTC" ISO string
// (see backend/utils/payoutDates.js) - timeZone: "UTC" reads those digits
// back literally instead of re-converting them into the viewer's local time.
const fmtDate = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "-" : dt.toLocaleString("en-AE", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  });
};

// Date-only (no time) for batch summaries, UTC-literal like fmtDate.
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

// Transferred batches show the real transfer date; scheduled ones the planned
// Tuesday; anything else has no payout date yet.
const fmtPayoutDay = (b) => fmtDay(b.transferDate || b.scheduledDate);

const PAYOUT_BADGE = {
  TRANSFERRED: { label: "Transferred", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  SCHEDULED: { label: "Scheduled", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  PROCESSING: { label: "Processing", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  PENDING: { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" }
};

function PayoutBadge({ status }) {
  const b = PAYOUT_BADGE[status] || PAYOUT_BADGE.PENDING;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${b.cls}`}>
      {b.label}
    </span>
  );
}

function BatchBadge({ code, onClick }) {
  if (!code) return <span className="text-xs text-zinc-300">-</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 transition"
      title="Filter transactions to this batch"
    >
      {code}
    </button>
  );
}

function PaidBadge({ status, qrBillStatus, telrStatus }) {
  const settledSplit = status === "PAID" && qrBillStatus === "PENDING" && telrStatus === "SETTLED";
  const cls =
    status === "PAID"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "FAILED"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-zinc-100 text-zinc-600 border-zinc-200";
  const label = settledSplit
    ? "Online settled"
    : status === "PAID"
      ? "Bill settled"
      : status === "FAILED"
        ? "Failed"
        : "Bill pending";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cls}`}
      title={settledSplit ? "Telr leg is settled; the remaining bill may have been closed in POS." : undefined}
    >
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

function TransferModal({ txns, scope, onClose, onDone, showToast }) {
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
    : txns.reduce((s, t) => s + Number(t.restaurantPayoutAmount || 0), 0);

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
        showToast(`${data.transferredCount} payments marked transferred under ${data.transferRef}.`, "success");
      } else {
        const { data } = await api.post("/payouts/bulk-transfer", {
          paymentIds: txns.map((t) => t.paymentId),
          transferRef,
          transferDate,
          notes
        });
        if (data.skipped?.length) {
          const reasons = [...new Set(data.skipped.map((s) => s.reason))].join(", ");
          showToast(`${data.transferredCount} transferred, ${data.skipped.length} skipped (${reasons}).`, "warning");
        } else {
          showToast(`${data.transferredCount} payment${data.transferredCount === 1 ? "" : "s"} transferred.`, "success");
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
            <DetailRow label="Bill amount (full bill)" value={`${CURRENCY} ${fmt(txn.billAmount)}`} mono />
            <DetailRow label="Paid amount (charged to card, this leg)" value={`${CURRENCY} ${fmt(txn.paidAmount)}`} mono />
            {!txn.failed && Number(txn.serviceFeeAmount) > 0 && (
              <DetailRow label="  ⤷ includes service fee (kept by DeynoQR)" value={`${CURRENCY} ${fmt(txn.serviceFeeAmount)}`} mono />
            )}
            {!txn.failed && Number(txn.tipAmount) > 0 && (
              <DetailRow label="  ⤷ includes tip" value={`${CURRENCY} ${fmt(txn.tipAmount)}`} mono />
            )}
            <DetailRow label="Balance (remaining on bill)" value={`${CURRENCY} ${fmt(txn.balanceAmount)}`} mono />
            {!txn.failed && (
              <>
                <DetailRow label="Platform fee (0.50 flat)" value={`- ${CURRENCY} ${fmt(txn.platformFeeAmount)}`} mono />
                <DetailRow label="Restaurant payout" value={`${CURRENCY} ${fmt(txn.restaurantPayoutAmount)}`} mono />
              </>
            )}
            <DetailRow label="Payment status" value={<PaidBadge status={txn.paidStatus} qrBillStatus={txn.qrBillStatus} telrStatus={txn.telrStatus} />} />
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
              {payoutStatus === "SCHEDULED" && txn.payout?.scheduledDate && (
                <DetailRow
                  label="Scheduled for"
                  value={new Date(txn.payout.scheduledDate).toLocaleDateString("en-AE", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}
                />
              )}
              <DetailRow label="Transfer ref" value={txn.payout?.transferRef} mono />
              <DetailRow
                label="Transfer date"
                value={txn.payout?.transferDate ? new Date(txn.payout.transferDate).toLocaleDateString("en-AE", { timeZone: "UTC" }) : "-"}
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

function BatchDetailSheet({ batchNo, onClose, requestStatusChange, onTransfer }) {
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState([]);
  const [acting, setActing] = useState(false);

  const fetchTxns = useCallback(() => {
    setLoading(true);
    return api.get("/transactions", { params: { batch: batchNo, pageSize: 500 } })
      .then(({ data }) => setTxns(data.transactions || []))
      .catch(() => setTxns([]))
      .finally(() => setLoading(false));
  }, [batchNo]);

  useEffect(() => {
    fetchTxns();
  }, [fetchTxns]);

  const total = txns.reduce((s, t) => s + Number(t.restaurantPayoutAmount || 0), 0);
  const activeIds = txns.filter((t) => !t.failed && t.payout?.status !== "TRANSFERRED").map((t) => t.paymentId);

  function markBatch(status) {
    if (!activeIds.length) return;
    setActing(true);
    requestStatusChange(status, activeIds, {
      after: async () => { await fetchTxns(); setActing(false); }
    });
    if (status === "SCHEDULED") setActing(false); // the date modal takes over from here
  }

  function transferBatch() {
    const activeTxns = txns.filter((t) => !t.failed && t.payout?.status !== "TRANSFERRED");
    if (!activeTxns.length) return;
    // TransferModal totals on restaurantPayoutAmount - passing it as paidAmount
    // made the confirm dialog read AED 0.00 for a batch transfer.
    onTransfer(activeTxns.map((t) => ({ paymentId: t.paymentId, restaurantPayoutAmount: t.restaurantPayoutAmount })));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-t-3xl bg-white border-t border-zinc-200 shadow-2xl">
          <div className="pt-3 shrink-0">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-zinc-200" />
          </div>
          <div className="px-5 pt-3 pb-3.5 border-b border-zinc-100 flex items-start justify-between shrink-0">
            <div>
              <h3 className="font-semibold text-zinc-900">Batch B-{batchNo}</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {loading ? "Loading..." : `${txns.length} transaction${txns.length === 1 ? "" : "s"} · ${CURRENCY} ${fmt(total)}`}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition">
              <X className="w-5 h-5" />
            </button>
          </div>

          {activeIds.length > 0 && (
            <div className="px-5 py-3 border-b border-zinc-100 flex flex-wrap gap-2 shrink-0">
              <button
                onClick={() => markBatch("PROCESSING")}
                disabled={acting}
                className="px-3.5 py-1.5 text-sm rounded-xl bg-indigo-100 text-indigo-700 font-semibold hover:bg-indigo-200 active:scale-[0.98] disabled:opacity-50 transition"
              >
                Mark processing
              </button>
              <button
                onClick={() => markBatch("SCHEDULED")}
                disabled={acting}
                className="px-3.5 py-1.5 text-sm rounded-xl bg-violet-100 text-violet-700 font-semibold hover:bg-violet-200 active:scale-[0.98] disabled:opacity-50 transition"
              >
                Mark scheduled
              </button>
              <button
                onClick={transferBatch}
                disabled={acting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-xl bg-emerald-500 text-ink-950 font-semibold hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50 transition"
              >
                <Banknote className="w-4 h-4" /> Transfer batch
              </button>
            </div>
          )}

          <div className="overflow-y-auto flex-1 divide-y divide-zinc-100">
            {loading ? (
              <div className="px-5 py-10 text-center text-zinc-400 text-sm">Loading...</div>
            ) : txns.length === 0 ? (
              <div className="px-5 py-10 text-center text-zinc-400 text-sm">No transactions found</div>
            ) : (
              txns.map((t) => (
                <div key={t.paymentId} className="px-5 py-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-800 truncate">
                        {t.restaurantName} <span className="num text-zinc-400 font-normal">#{t.paymentId}</span>
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {t.kotMasterId != null && `KOT ${t.kotMasterId}`}
                        {t.tableId != null && ` · T${t.tableId}`}
                        {t.methodName && ` · ${t.methodName}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="num text-sm font-semibold text-zinc-900">{fmt(t.paidAmount)}</p>
                      <p className="num text-xs text-zinc-400">of {fmt(t.billAmount)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <PaidBadge status={t.paidStatus} qrBillStatus={t.qrBillStatus} telrStatus={t.telrStatus} />
                    <PayoutBadge status={t.payout?.status || "PENDING"} />
                    <span className="text-xs text-zinc-400 ml-auto">{fmtDate(t.createdAt)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span>Balance <span className="num text-zinc-700">{fmt(t.balanceAmount)}</span></span>
                    <span className="text-right">Restaurant payout <span className="num text-zinc-700">{fmt(t.restaurantPayoutAmount)}</span></span>
                    {t.payout?.status === "SCHEDULED" && t.payout?.scheduledDate && (
                      <span className="col-span-2">
                        Scheduled for <span className="num text-zinc-700">
                          {new Date(t.payout.scheduledDate).toLocaleDateString("en-AE", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })}
                        </span>
                      </span>
                    )}
                    {t.payout?.transferRef && (
                      <span className="col-span-2">
                        Ref <span className="num text-zinc-700">{t.payout.transferRef}</span>
                        {t.payout.transferDate &&
                          ` · ${new Date(t.payout.transferDate).toLocaleDateString("en-AE", { timeZone: "UTC" })}`}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="h-3 shrink-0" />
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
  const [exporting, setExporting] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [view, setView] = useState("transactions");
  const [batches, setBatches] = useState([]);
  const [batchDetail, setBatchDetail] = useState(null);
  const [selectedBatches, setSelectedBatches] = useState(() => new Set());
  const [batchPayoutLoading, setBatchPayoutLoading] = useState(false);
  const [scheduling, setScheduling] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, variant = "info", title = null) => {
    setToast({ message, variant, title });
  }, []);

  const [filters, setFilters] = useState({
    shopId: "",
    status: "",
    payoutStatus: "",
    methodId: "",
    search: "",
    from: "",
    to: "",
    minAmount: "",
    maxAmount: "",
    batch: ""
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
      if (filters.batch) params.batch = filters.batch;
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

  const EXPORT_COLUMNS = useMemo(() => {
    const cols = [
      { header: "#", key: (r) => (r.failed ? "-" : r.paymentId) },
      ...(isCompany ? [{ header: "Restaurant", key: "restaurantName" }] : []),
      { header: "Order (KOT)", key: (r) => r.kotMasterId ?? "-" },
      { header: "Table", key: (r) => (r.tableId != null ? `T${r.tableId}` : "-") },
      { header: "Method", key: "methodName" },
      { header: "Bill (AED)", key: (r) => fmt(r.billAmount), align: "right" },
      { header: "Paid (AED)", key: (r) => fmt(r.paidAmount), align: "right" },
      { header: "Balance (AED)", key: (r) => fmt(r.balanceAmount), align: "right" },
      { header: "Restaurant payout (AED)", key: (r) => (r.failed ? "-" : fmt(r.restaurantPayoutAmount)), align: "right" },
      {
        header: "Payment",
        key: (r) => (
          r.paidStatus === "PAID" && r.qrBillStatus === "PENDING" && r.telrStatus === "SETTLED"
            ? "Online settled"
            : r.paidStatus === "PAID"
              ? "Bill settled"
              : r.paidStatus === "FAILED"
                ? "Failed"
                : "Bill pending"
        )
      },
      { header: "Settlement", key: (r) => (r.failed ? "-" : r.payout?.status || "PENDING") },
      { header: "Transfer ref", key: (r) => r.payout?.transferRef || "-" },
      { header: "Date", key: (r) => fmtDateTime(r.createdAt) }
    ];
    return cols;
  }, [isCompany]);

  async function runExport(kind) {
    setExporting(kind);
    try {
      const params = {};
      if (filters.shopId) params.shopId = filters.shopId;
      if (filters.status) params.status = filters.status;
      if (filters.payoutStatus) params.payoutStatus = filters.payoutStatus;
      if (filters.methodId) params.methodId = filters.methodId;
      if (filters.search) params.search = filters.search;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.minAmount) params.minAmount = filters.minAmount;
      if (filters.maxAmount) params.maxAmount = filters.maxAmount;
      if (filters.batch) params.batch = filters.batch;
      params.sort = sort.key;
      params.dir = sort.dir;

      const { data } = await api.get("/transactions/export", { params });
      const rows = data.transactions || [];
      const scope = isCompany ? "all-restaurants" : (user?.displayName || "restaurant");
      const fileName = `payouts-${scope}-${new Date().toISOString().slice(0, 10)}`.replace(/\s+/g, "-");
      if (kind === "pdf") {
        exportPayoutsPdf({
          title: "DeynoQR Payouts",
          fromDate: filters.from, toDate: filters.to,
          columns: EXPORT_COLUMNS, rows, fileName,
          footerNote: data.truncated ? `Showing first ${rows.length} of ${data.total} matching records.` : undefined
        });
      } else {
        exportPayoutsExcel({
          title: "DeynoQR Payouts",
          fromDate: filters.from, toDate: filters.to,
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

  const loadBatches = useCallback(async () => {
    if (!isCompany) return;
    try {
      const { data } = await api.get("/payouts/batches");
      setBatches(data.batches || []);
    } catch (err) {
      console.error("Load batches failed:", err.message);
    }
  }, [isCompany]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

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

  async function setBulkStatus(status, ids = selectedTxns.map((t) => t.paymentId), scheduledDate) {
    setStatusSaving(true);
    try {
      const body = { paymentIds: ids, status };
      if (scheduledDate) body.scheduledDate = scheduledDate;
      const { data } = await api.post("/payouts/bulk-status", body);
      if (data.skipped?.length) {
        const reasons = [...new Set(data.skipped.map((s) => s.reason))].join(", ");
        showToast(`${data.updatedCount} updated, ${data.skipped.length} skipped (${reasons}).`, "warning");
      } else {
        showToast(`${data.updatedCount} payment${data.updatedCount === 1 ? "" : "s"} moved to ${status.charAt(0) + status.slice(1).toLowerCase()}.`, "success");
      }
      setSelected(new Set());
      load();
      loadBatches();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update status", "error");
    } finally {
      setStatusSaving(false);
    }
  }

  // Scheduling always needs a Tuesday date first - route through the modal
  // instead of calling the API directly. Other statuses go straight through.
  function requestStatusChange(status, ids, opts = {}) {
    if (status === "SCHEDULED") {
      setScheduling({ ids, after: opts.after });
      return;
    }
    setBulkStatus(status, ids).then(() => opts.after?.());
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

  // ---- batch selection helpers ----
  // A fully TRANSFERRED batch is settled and final, so it can be inspected but
  // never re-paid; only the rest can be picked for a payout run.
  const payableBatches = batches.filter((b) => b.status !== "TRANSFERRED");
  const selectedBatchRows = batches.filter((b) => selectedBatches.has(b.batchNo));
  const allBatchesSelected =
    payableBatches.length > 0 && payableBatches.every((b) => selectedBatches.has(b.batchNo));

  const batchSelectionTotals = selectedBatchRows.reduce(
    (acc, b) => ({
      txnCount: acc.txnCount + Number(b.txnCount || 0),
      payout: acc.payout + Number(b.totalAmount || 0),
      transferFee: acc.transferFee + Number(b.transferFee || 0),
      transferFeeTax: acc.transferFeeTax + Number(b.transferFeeTax ?? b.tax ?? 0)
    }),
    { txnCount: 0, payout: 0, transferFee: 0, transferFeeTax: 0 }
  );
  const selectedPayableBatches = selectedBatchRows.filter((b) => b.status !== "TRANSFERRED");

  function toggleBatch(batchNo) {
    setSelectedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchNo)) next.delete(batchNo);
      else next.add(batchNo);
      return next;
    });
  }

  function toggleAllBatches() {
    setSelectedBatches(allBatchesSelected ? new Set() : new Set(payableBatches.map((b) => b.batchNo)));
  }

  // Batches are a live GROUP BY, not a stored entity, so a payout run has to
  // resolve the selection back to the individual payments the transfer API
  // works on. Already-transferred and failed rows are dropped here.
  async function payoutSelectedBatches() {
    if (!selectedPayableBatches.length) return;
    setBatchPayoutLoading(true);
    try {
      const lists = await Promise.all(
        selectedPayableBatches.map((b) =>
          api
            .get("/transactions", { params: { batch: b.batchNo, pageSize: 500 } })
            .then(({ data }) => data.transactions || [])
        )
      );
      const txns = lists
        .flat()
        .filter((t) => !t.failed && (t.payout?.status || "PENDING") !== "TRANSFERRED");
      if (!txns.length) {
        showToast("Nothing left to transfer in the selected batches.", "warning");
        return;
      }
      setTransferTxns(txns);
    } catch {
      showToast("Failed to load the transactions for these batches.", "error");
    } finally {
      setBatchPayoutLoading(false);
    }
  }

  const totals = summary?.totals;

  const hasFilters =
    filters.shopId || filters.status || filters.payoutStatus || filters.methodId ||
    filters.search || filters.from || filters.to || filters.minAmount || filters.maxAmount ||
    filters.batch;

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
              <option value="PAID">Online settled</option>
              <option value="PENDING">Bill pending</option>
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
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="SCHEDULED">Scheduled</option>
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
                  search: "", from: "", to: "", minAmount: "", maxAmount: "", batch: ""
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
                {CURRENCY} {fmt(selectedTxns.reduce((s, t) => s + Number(t.restaurantPayoutAmount || 0), 0))}
              </span>
            </p>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => requestStatusChange("PROCESSING", selectedTxns.map((t) => t.paymentId))}
                disabled={statusSaving}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-xl bg-indigo-100 text-indigo-700 font-semibold hover:bg-indigo-200 active:scale-[0.98] disabled:opacity-50 transition"
              >
                Mark processing
              </button>
              <button
                onClick={() => requestStatusChange("SCHEDULED", selectedTxns.map((t) => t.paymentId))}
                disabled={statusSaving}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-xl bg-violet-100 text-violet-700 font-semibold hover:bg-violet-200 active:scale-[0.98] disabled:opacity-50 transition"
              >
                Mark scheduled
              </button>
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

        {/* Transactions / Batches tab switcher */}
        {isCompany && (
          <div className="flex gap-2">
            <button
              onClick={() => setView("transactions")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl border transition ${
                view === "transactions"
                  ? "bg-ink-950 text-white border-ink-950"
                  : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              Transactions
            </button>
            <button
              onClick={() => setView("batches")}
              className={`px-4 py-2 text-sm font-semibold rounded-xl border transition ${
                view === "batches"
                  ? "bg-ink-950 text-white border-ink-950"
                  : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              Batches {batches.length > 0 && <span className="num opacity-70">({batches.length})</span>}
            </button>
          </div>
        )}

        {/* Batches view */}
        {isCompany && view === "batches" && (
          <section className="rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100">
              <h2 className="text-sm font-semibold text-zinc-800">
                Batches <span className="num text-zinc-400 font-normal">({batches.length})</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Payments that were moved or transferred together share a batch number. Click one to see its transactions.
              </p>
            </div>
            {batches.length === 0 ? (
              <div className="px-5 py-12 text-center text-zinc-400 text-sm">No batches yet</div>
            ) : (
              <>
                <div className="overflow-x-auto hidden sm:block">
                  <table className="w-full min-w-[1320px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                        <th className="pl-5 pr-2 py-2.5 w-10">
                          <input
                            type="checkbox"
                            checked={allBatchesSelected}
                            onChange={toggleAllBatches}
                            disabled={payableBatches.length === 0}
                            aria-label="Select all payable batches"
                            className="w-4 h-4 rounded border-zinc-300 accent-sky-600 cursor-pointer disabled:cursor-not-allowed"
                          />
                        </th>
                        <th className="px-5 py-2.5 font-medium">Batch</th>
                        <th className="px-5 py-2.5 font-medium whitespace-nowrap">Transaction date</th>
                        <th className="px-5 py-2.5 font-semibold text-zinc-600 text-right whitespace-nowrap">Total transactions</th>
                        <th className="px-5 py-2.5 font-medium text-right whitespace-nowrap" title="Full amount charged through Telr, service fee included">Telr total</th>
                        <th className="px-5 py-2.5 font-medium text-right whitespace-nowrap" title="Bill paid, excluding tip and service fee">Bill amount</th>
                        <th className="px-5 py-2.5 font-medium text-right">Tip</th>
                        <th className="px-5 py-2.5 font-medium text-right whitespace-nowrap" title="DeynoQR commission, deducted from the payout">Platform fee</th>
                        <th className="px-5 py-2.5 font-medium text-right whitespace-nowrap" title="Transactions x AED 0.50">Transfer fee</th>
                        <th className="px-5 py-2.5 font-medium text-right whitespace-nowrap" title="5% VAT on the transfer fee">Transfer fee tax</th>
                        <th className="px-5 py-2.5 font-medium whitespace-nowrap">Payout date</th>
                        <th className="px-5 py-2.5 font-medium text-right whitespace-nowrap" title="Excludes service fee, platform fee deducted">Payout to restaurant</th>
                        <th className="px-5 py-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((b) => (
                        <tr
                          key={b.batchNo}
                          onClick={() => setBatchDetail(b.batchNo)}
                          className={`border-b border-zinc-50 last:border-0 hover:bg-zinc-50 cursor-pointer transition ${selectedBatches.has(b.batchNo) ? "bg-sky-50/60" : ""}`}
                          title="View this batch's transactions"
                        >
                          <td className="pl-5 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedBatches.has(b.batchNo)}
                              onChange={() => toggleBatch(b.batchNo)}
                              disabled={b.status === "TRANSFERRED"}
                              aria-label={`Select batch B-${b.batchNo}`}
                              title={b.status === "TRANSFERRED" ? "Already transferred" : "Select this batch"}
                              className="w-4 h-4 rounded border-zinc-300 accent-sky-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                            />
                          </td>
                          <td className="px-5 py-3 font-medium text-sky-700">B-{b.batchNo}</td>
                          <td className="px-5 py-3 text-zinc-500 text-xs whitespace-nowrap">{fmtTxnRange(b.firstTxnAt, b.lastTxnAt)}</td>
                          <td className="num px-5 py-3 text-right text-zinc-900 font-bold text-[15px]">{b.txnCount}</td>
                          <td className="num px-5 py-3 text-right text-zinc-700">{CURRENCY} {fmt(b.totalTxnAmount)}</td>
                          <td className="num px-5 py-3 text-right text-zinc-700">{CURRENCY} {fmt(b.billAmount)}</td>
                          <td className="num px-5 py-3 text-right text-zinc-500">{CURRENCY} {fmt(b.tipAmount)}</td>
                          <td className="num px-5 py-3 text-right text-rose-600">-{CURRENCY} {fmt(b.platformFee)}</td>
                          <td className="num px-5 py-3 text-right text-zinc-500">{CURRENCY} {fmt(b.transferFee)}</td>
                          <td className="num px-5 py-3 text-right text-zinc-500">{CURRENCY} {fmt(b.transferFeeTax ?? b.tax)}</td>
                          <td className="px-5 py-3 text-zinc-500 text-xs whitespace-nowrap">{fmtPayoutDay(b)}</td>
                          <td className="num px-5 py-3 text-right text-zinc-900 font-medium">{CURRENCY} {fmt(b.totalAmount)}</td>
                          <td className="px-5 py-3">
                            {b.status === "MIXED" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-zinc-100 text-zinc-600 border-zinc-200">
                                Mixed
                              </span>
                            ) : (
                              <PayoutBadge status={b.status} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden divide-y divide-zinc-100">
                  {batches.map((b) => (
                    <div
                      key={b.batchNo}
                      onClick={() => setBatchDetail(b.batchNo)}
                      className={`p-4 space-y-2.5 cursor-pointer hover:bg-zinc-50 transition ${selectedBatches.has(b.batchNo) ? "bg-sky-50/60" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={selectedBatches.has(b.batchNo)}
                            onChange={() => toggleBatch(b.batchNo)}
                            onClick={(e) => e.stopPropagation()}
                            disabled={b.status === "TRANSFERRED"}
                            aria-label={`Select batch B-${b.batchNo}`}
                            className="w-4 h-4 rounded border-zinc-300 accent-sky-600 disabled:opacity-40"
                          />
                          <span className="font-medium text-sky-700">B-{b.batchNo}</span>
                        </span>
                        {b.status === "MIXED" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-zinc-100 text-zinc-600 border-zinc-200">
                            Mixed
                          </span>
                        ) : (
                          <PayoutBadge status={b.status} />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <span className="text-zinc-400">Transaction date</span>
                        <span className="text-right text-zinc-600">{fmtTxnRange(b.firstTxnAt, b.lastTxnAt)}</span>
                        <span className="text-zinc-500 font-semibold">Total transactions</span>
                        <span className="num text-right text-zinc-900 font-bold text-[15px]">{b.txnCount}</span>
                        <span className="text-zinc-400">Telr total (incl. service fee)</span>
                        <span className="num text-right text-zinc-700">{CURRENCY} {fmt(b.totalTxnAmount)}</span>
                        <span className="text-zinc-400">Bill amount (excl. tip)</span>
                        <span className="num text-right text-zinc-700">{CURRENCY} {fmt(b.billAmount)}</span>
                        <span className="text-zinc-400">Tip</span>
                        <span className="num text-right text-zinc-600">{CURRENCY} {fmt(b.tipAmount)}</span>
                        <span className="text-zinc-400">Platform fee</span>
                        <span className="num text-right text-rose-600">-{CURRENCY} {fmt(b.platformFee)}</span>
                        <span className="text-zinc-400">Transfer fee</span>
                        <span className="num text-right text-zinc-600">{CURRENCY} {fmt(b.transferFee)}</span>
                        <span className="text-zinc-400">Transfer fee tax</span>
                        <span className="num text-right text-zinc-600">{CURRENCY} {fmt(b.transferFeeTax ?? b.tax)}</span>
                        <span className="text-zinc-400">Payout date</span>
                        <span className="text-right text-zinc-600">{fmtPayoutDay(b)}</span>
                        <span className="text-zinc-400">Payout to restaurant</span>
                        <span className="num text-right font-semibold text-zinc-900">{CURRENCY} {fmt(b.totalAmount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* Transactions table */}
        <section className={`rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden ${isCompany && view !== "transactions" ? "hidden" : ""}`}>
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
            <button
              onClick={() => runExport("pdf")}
              disabled={!!exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition"
              title="Export filtered transactions to PDF"
            >
              <FileDown className="w-3.5 h-3.5" /> {exporting === "pdf" ? "Exporting..." : "PDF"}
            </button>
            <button
              onClick={() => runExport("excel")}
              disabled={!!exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition"
              title="Export filtered transactions to Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> {exporting === "excel" ? "Exporting..." : "Excel"}
            </button>
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
                  <th className="px-4 py-2.5 font-medium text-right">Restaurant payout</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                  <th className="px-4 py-2.5 font-medium">Settlement</th>
                  <th className="px-4 py-2.5 font-medium">Batch</th>
                  <th className="px-4 py-2.5 font-medium">Transfer ref</th>
                  <SortTh label="Date" k="date" sort={sort} onSort={toggleSort} />
                  {isCompany && <th className="px-4 py-2.5 font-medium text-right pr-5">Action</th>}
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={isCompany ? 15 : 13} className="px-4 py-12 text-center text-zinc-400">
                      {loading ? "Loading..." : "No transactions found"}
                    </td>
                  </tr>
                )}
                {transactions.map((t) => {
                  const payoutStatus = t.payout?.status || "PENDING";
                  const splitInfo = splitGroupInfo.get(t.paymentId);
                  return (
                    <tr
                      key={t.paymentId}
                      onClick={() => setDetailTxn(t)}
                      className={`border-b border-zinc-50 last:border-0 hover:bg-zinc-50 cursor-pointer transition ${splitInfo ? "bg-indigo-50/40" : ""}`}
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
                        {splitInfo && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 border border-indigo-200 align-middle">
                            Split {splitInfo.idx}/{splitInfo.total}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{t.methodName}</td>
                      <td className="num px-4 py-3 text-right text-zinc-600">{fmt(t.billAmount)}</td>
                      <td className="num px-4 py-3 text-right font-medium text-zinc-900">{fmt(t.paidAmount)}</td>
                      <td className="num px-4 py-3 text-right text-zinc-400">{fmt(t.balanceAmount)}</td>
                      <td className="num px-4 py-3 text-right text-zinc-600">
                        {t.failed ? "-" : fmt(t.restaurantPayoutAmount)}
                      </td>
                      <td className="px-4 py-3"><PaidBadge status={t.paidStatus} qrBillStatus={t.qrBillStatus} telrStatus={t.telrStatus} /></td>
                      <td className="px-4 py-3">
                        {t.failed ? (
                          <span className="text-xs text-zinc-300">-</span>
                        ) : (
                          <>
                            <PayoutBadge status={payoutStatus} />
                            {payoutStatus === "SCHEDULED" && t.payout?.scheduledDate && (
                              <span className="num block text-xs text-zinc-400 mt-0.5">
                                {new Date(t.payout.scheduledDate).toLocaleDateString("en-AE", { day: "2-digit", month: "short", timeZone: "UTC" })}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {t.failed ? (
                          <span className="text-xs text-zinc-300">-</span>
                        ) : (
                          <BatchBadge
                            code={t.payout?.batchNo != null ? `B-${t.payout.batchNo}` : null}
                            onClick={(e) => { e.stopPropagation(); setFilter("batch", String(t.payout.batchNo)); }}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">
                        <span className="num">{t.payout?.transferRef || "-"}</span>
                        {t.payout?.transferDate && (
                          <span className="num block text-zinc-400">
                            {new Date(t.payout.transferDate).toLocaleDateString("en-AE", { timeZone: "UTC" })}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                      {isCompany && (
                        <td className="px-4 py-3 pr-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {t.failed ? (
                            <span className="text-xs text-zinc-300">-</span>
                          ) : payoutStatus !== "TRANSFERRED" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <select
                                value={payoutStatus}
                                onChange={(e) => requestStatusChange(e.target.value, [t.paymentId])}
                                className="rounded-lg border border-zinc-200 text-xs px-1.5 py-1.5 text-zinc-600 focus:outline-none focus:border-emerald-500"
                                title="Move to a different pre-transfer status"
                              >
                                <option value="PENDING">Pending</option>
                                <option value="PROCESSING">Processing</option>
                                <option value="SCHEDULED">Scheduled</option>
                              </select>
                              <button
                                onClick={() => setTransferTxns([t])}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 active:scale-[0.98] transition"
                              >
                                Transfer
                              </button>
                            </div>
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
            {selectableTxns.length > 0 && (
              <label className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-zinc-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="accent-emerald-600 cursor-pointer"
                />
                Select all awaiting on this page
              </label>
            )}
            {transactions.length === 0 && (
              <div className="px-4 py-12 text-center text-zinc-400">
                {loading ? "Loading..." : "No transactions found"}
              </div>
            )}
            {transactions.map((t) => {
              const payoutStatus = t.payout?.status || "PENDING";
              const splitInfo = splitGroupInfo.get(t.paymentId);
              return (
                <div
                  key={t.paymentId}
                  className={`p-4 space-y-2.5 ${splitInfo ? "bg-indigo-50/40" : ""}`}
                  onClick={() => setDetailTxn(t)}
                >
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
                          {splitInfo && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 border border-indigo-200 align-middle">
                              Split {splitInfo.idx}/{splitInfo.total}
                            </span>
                          )}
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
                    <PaidBadge status={t.paidStatus} qrBillStatus={t.qrBillStatus} telrStatus={t.telrStatus} />
                    {!t.failed && <PayoutBadge status={payoutStatus} />}
                    {!t.failed && payoutStatus === "SCHEDULED" && t.payout?.scheduledDate && (
                      <span className="num text-xs text-zinc-400">
                        {new Date(t.payout.scheduledDate).toLocaleDateString("en-AE", { day: "2-digit", month: "short", timeZone: "UTC" })}
                      </span>
                    )}
                    {!t.failed && t.payout?.batchNo != null && (
                      <BatchBadge
                        code={`B-${t.payout.batchNo}`}
                        onClick={(e) => { e.stopPropagation(); setFilter("batch", String(t.payout.batchNo)); }}
                      />
                    )}
                    <span className="text-xs text-zinc-400 ml-auto">{fmtDate(t.createdAt)}</span>
                  </div>

                  {t.payout?.transferRef && (
                    <p className="num text-xs text-zinc-500">
                      Ref {t.payout.transferRef}
                      {t.payout.transferDate &&
                        ` · ${new Date(t.payout.transferDate).toLocaleDateString("en-AE", { timeZone: "UTC" })}`}
                    </p>
                  )}

                  {isCompany && !t.failed && payoutStatus !== "TRANSFERRED" && (
                    <div className="pt-1 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={payoutStatus}
                        onChange={(e) => requestStatusChange(e.target.value, [t.paymentId])}
                        className="flex-1 rounded-xl border border-zinc-200 text-xs px-2 py-2 text-zinc-600 focus:outline-none focus:border-emerald-500"
                        title="Move to a different pre-transfer status"
                      >
                        <option value="PENDING">Pending</option>
                        <option value="PROCESSING">Processing</option>
                        <option value="SCHEDULED">Scheduled</option>
                      </select>
                      <button
                        onClick={() => setTransferTxns([t])}
                        className="px-3 py-2 text-xs font-medium rounded-xl border border-emerald-300 text-emerald-700 hover:bg-emerald-50 active:scale-[0.98] transition"
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

      {/* Batch selection bar - floats over the page bottom so the payout action
          stays reachable on a phone without scrolling back up. */}
      {view === "batches" && selectedBatches.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-ink-950 text-white shadow-2xl px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">
                  {selectedBatches.size} batch{selectedBatches.size === 1 ? "" : "es"} ·{" "}
                  <span className="num">{batchSelectionTotals.txnCount}</span> txns
                </p>
                <p className="text-[11px] text-zinc-400 truncate">
                  Transfer fee <span className="num">{CURRENCY} {fmt(batchSelectionTotals.transferFee)}</span>
                  {" · "}Tax <span className="num">{CURRENCY} {fmt(batchSelectionTotals.transferFeeTax)}</span>
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wide text-zinc-400">Payout</p>
                <p className="num text-base font-bold leading-tight">
                  {CURRENCY} {fmt(batchSelectionTotals.payout)}
                </p>
              </div>

              {selectedPayableBatches.length > 0 && (
                <button
                  onClick={payoutSelectedBatches}
                  disabled={batchPayoutLoading}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-xl bg-emerald-500 text-ink-950 font-semibold hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50 transition"
                >
                  <Banknote className="w-4 h-4" />
                  {batchPayoutLoading ? "Loading..." : "Payout"}
                </button>
              )}

              <button
                onClick={() => setSelectedBatches(new Set())}
                className="shrink-0 p-2 rounded-xl hover:bg-ink-800 transition"
                title="Clear selection"
                aria-label="Clear batch selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {transferTxns && (
        <TransferModal
          txns={transferTxns}
          onClose={() => setTransferTxns(null)}
          showToast={showToast}
          onDone={() => {
            setTransferTxns(null);
            setSelected(new Set());
            setSelectedBatches(new Set());
            load();
            loadBatches();
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
          showToast={showToast}
          onDone={() => {
            setTransferAllOpen(false);
            setSelected(new Set());
            load();
            loadBatches();
          }}
        />
      )}

      {detailTxn && <TxnDetailModal txn={detailTxn} onClose={() => setDetailTxn(null)} />}

      {batchDetail != null && (
        <BatchDetailSheet
          batchNo={batchDetail}
          onClose={() => setBatchDetail(null)}
          requestStatusChange={requestStatusChange}
          onTransfer={setTransferTxns}
        />
      )}

      {scheduling && (
        <ScheduleDateModal
          count={scheduling.ids.length}
          onClose={() => setScheduling(null)}
          onConfirm={async (dateStr) => {
            await setBulkStatus("SCHEDULED", scheduling.ids, dateStr);
            await scheduling.after?.();
            setScheduling(null);
          }}
        />
      )}

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
