// src/pages/TableSummaryPremium.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { List } from "react-window";

import ConfirmModal from "../component/ConfirmModal";
import PaymentProcessingOverlay from "../component/PaymentProcessingOverlay";
import PaymentSuccess from "../component/PaymentSuccess";
import SplitCustomAmountSheet from "../component/SplitCustomAmountSheet";
import SplitEqualSheet from "../component/SplitEqualSheet";
import SplitOptionsSheet from "../component/SplitOptionSheet";
import SplitPickItemsSheet from "../component/SplitPickItemsSheet";
import Toast from "../component/Toast";
import { API } from "../lib/api";

import { log, error as logError } from "../lib/logger";
import { isOrderMode } from "../lib/orderMode";
import { checkTelrStatus, createTelrSession, getBalance, getPaidItems, getPaymentMethods, processCustomSplit, processEqualSplit, processItemSplit } from "../services/payment.service";
import { useCart } from "../store/cartStore";

const fmt = (n) => Number(n || 0).toFixed(2);

// TEMP: when false, all payment UI (split sheets, pay buttons, payment methods
// sheet) stays fully browsable, but the final Telr gateway redirect is blocked.
const TELR_REDIRECT_ENABLED = true;

// Customer convenience/service fee rate (Terms → Pricing and description: up to 3.1%).
// Fallback only — the live rate is company-controlled via qrmenu-dashboard and
// fetched from the backend at runtime (GET /payment/service-fee-rate).
const DEFAULT_SERVICE_FEE_RATE = 0.031;

/* ── Item row ─────────────────────────────────────────── */
function ItemRow({ item, currency = "AED", paidKotChildIds = [] }) {
  const qty = Number(item.Qty || 0);
  const unit = Number(item.UnitPrice || 0);
  const total = Number(item.LineTotal || 0);
  
  // Check if this item is already paid
  const kotChildId = item.KotChildID || item.kotChildID || item.kotChildId || null;
  const isPaid = kotChildId && paidKotChildIds.includes(Number(kotChildId));

  return (
    <li
      className={`group px-3 py-3 rounded-xl border backdrop-blur-[1px] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-sm ${
        isPaid ? 'bg-gray-50/80 opacity-75' : 'bg-white/80'
      }`}
      style={{ borderColor: "var(--grad-end-soft)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-8 h-8 rounded-full grid place-items-center text-xs font-semibold shrink-0 ${
              isPaid ? 'bg-green-100' : ''
            }`}
            style={isPaid ? {} : {
              background: "var(--grad-start-soft)",
              color: "var(--text-rose)",
            }}
            aria-label={`Qty ${qty}`}
          >
            {isPaid ? '✓' : qty}
          </div>

          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-gray-900 truncate flex items-center gap-2">
              {item.ShortDescription || `Item #${item.ProductID}`}
              {isPaid && (
                <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-normal">
                  PAID
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-600">
              <span
                className="px-2 py-[3px] rounded-lg bg-gray-50 border"
                style={{ borderColor: "var(--grad-end-soft)" }}
              >
                {fmt(unit)} {currency} each
              </span>

              {item.Modifier && (
                <>
                  <span className="text-gray-300">•</span>
                  <span
                    className="max-w-[160px] truncate px-2 py-[3px] rounded-lg"
                    style={{
                      background: "var(--grad-start-soft)",
                      color: "var(--text-rose)",
                    }}
                  >
                    {item.Modifier}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-[15px] font-semibold text-gray-900">
            {fmt(total)}
          </div>
          <div className="text-[11px] text-gray-500">{currency}</div>
        </div>
      </div>
    </li>
  );
}

/* ── Pay Full Button Component ─────────────────────────────────────────── */
function PayFullButton({
  grandTotal,
  tableId,
  kotMasterID,
  token,
  remainingBalance,
  fullGrandTotal,
  disabled,
  className,
  brand,
  paidKotChildIds = [],
  lines = [],
  equalSplitInfo = null,
  onCardPay,
  serviceFeeAmount = 0,
  tipAmount = 0,
  showConfirm,
}) {
  const [processing] = useState(false);
  
  // Check if there's a custom split in progress (remainingBalance exists and is less than full total)
  const hasCustomSplitInProgress = remainingBalance !== null && fullGrandTotal !== null && remainingBalance < fullGrandTotal;
  
  // Check if there's an item split in progress (some items are paid)
  const hasItemSplitInProgress = paidKotChildIds.length > 0;
  
  // Check if all items are paid (item split complete)
  const allItemsPaid = lines.length > 0 && lines.every(item => {
    const kotChildId = item.KotChildID || item.kotChildID || item.kotChildId || null;
    return kotChildId && paidKotChildIds.includes(Number(kotChildId));
  });
  
  // Check if there's an equal split in progress (equalSplitInfo exists and remainingBalance > 0)
  // Equal split is distinguished from custom split by the presence of equalSplitInfo
  const hasEqualSplitInProgress = equalSplitInfo !== null && remainingBalance !== null && remainingBalance > 0;
  
  const hasSplitInProgress = hasCustomSplitInProgress || hasEqualSplitInProgress || (hasItemSplitInProgress && !allItemsPaid);
  const buttonText = hasSplitInProgress ? "Pay remaining balance" : "Pay fully";

  const handlePayFull = async () => {
    if (processing || disabled || grandTotal <= 0) return;

    // Snapshot the order's items now, before the Telr redirect - once payment
    // settles the bill, /r/resolve stops returning line items for this KOT,
    // so this is the last point where they're reliably available.
    const itemsSnapshot = lines.map((it) => ({
      name: it.ShortDescription || `Item #${it.ProductID}`,
      qty: it.Qty,
      unitPrice: it.UnitPrice,
      total: it.LineTotal,
    }));

    // If there's an equal split in progress, continue with equal split method
    if (hasEqualSplitInProgress && equalSplitInfo) {
      const numberOfPeople = equalSplitInfo.numberOfPeople || 1;
      // When "Pay remaining balance": charge the REMAINING BALANCE (grandTotal), not the original amount per person.
      // grandTotal is already the remaining balance; amountPerPerson was from the original split and can be outdated
      // if new items were added (e.g. original 35.70/person, but remaining is now 61.95).
      const amountToCharge = Number(grandTotal);
      
      const paymentPayload = {
        billAmount: Number(fullGrandTotal), // Full bill amount
        paidAmount: amountToCharge, // Amount being paid now (remaining balance)
        numberOfPeople: Number(numberOfPeople),
        tableId: tableId ? Number(tableId) : null,
        kotMasterID: kotMasterID ? Number(kotMasterID) : null
      };
      
      if (onCardPay) {
        // Carry the tip (and fee) the guest chose on THIS "Pay remaining"
        // screen - without these, the split-equal branch dropped the tip
        // entirely (it returns below before reaching the pay-full branches
        // that pass them), so a tip added here never reached Telr/the DB.
        const feeAmt = Number(serviceFeeAmount) || 0;
        const tip = Number(tipAmount) || 0;
        onCardPay({
          amount: amountToCharge,
          serviceFeeAmount: feeAmt,
          tipAmount: tip,
          tableId,
          kotMasterID,
          token,
          brand,
          mode: "split-equal",
          numberOfPeople,
          originalBillAmount: fullGrandTotal,
          items: itemsSnapshot,
          splitPayload: {
            paymentPayload,
            amountPerPerson: amountToCharge, // This payment: one person pays remaining
            numberOfPeople,
          }
        });
      }
      return;
    }
    
    // If there's a custom split or item split in progress, "Pay remaining
    // balance" must go through Telr like every other charge - it must NEVER
    // call processCustomSplit/processItemSplit directly, since that writes
    // PAID to the KOT with no card ever charged. Routing through onCardPay
    // (mode defaults to "pay-full") lets savePayFullPayment() do what it's
    // already built for: auto-detect the existing split group (MethodID
    // 2/3/4) and complete it with one final leg for exactly this remaining
    // balance - same as the plain "no split" Pay Full case below.
    if ((hasCustomSplitInProgress && !hasEqualSplitInProgress) || (hasItemSplitInProgress && !allItemsPaid)) {
      showConfirm(
        `Pay ${fmt(grandTotal)} AED?`,
        `This will pay the remaining balance and complete the payment.`,
        () => {
          const feeAmt = Number(serviceFeeAmount) || 0;
          const tip = Number(tipAmount) || 0;
          onCardPay?.({
            amount: Number(grandTotal),
            billAmount: Number(grandTotal),
            serviceFeeAmount: feeAmt,
            tipAmount: tip,
            tableId,
            kotMasterID,
            token,
            brand,
            items: itemsSnapshot,
          });
        },
        { confirmLabel: `Pay ${fmt(grandTotal)} AED`, variant: "success" }
      );
    } else {
      const feeAmt = Number(serviceFeeAmount) || 0;
      const tip = Number(tipAmount) || 0;
      onCardPay?.({
        // Raw bill only — backend recomputes fee from this amount and adds
        // tip itself (telr.routes.js). Baking fee/tip in here double-counts
        // both once the backend adds them again on top.
        amount: Number(grandTotal),
        billAmount: Number(grandTotal),
        serviceFeeAmount: feeAmt,
        tipAmount: tip,
        tableId,
        kotMasterID,
        token,
        brand,
        items: itemsSnapshot,
      });
    }
  };

  return (
    <button
      onClick={handlePayFull}
      disabled={disabled || processing || grandTotal <= 0}
      className={className}
    >
      {processing ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
          Processing...
        </>
      ) : (
        <>
          {buttonText}
          <span className="btn-ripple" />
        </>
      )}
    </button>
  );
}

/* ── Page ─────────────────────────────────────────────── */
export default function TableSummaryPremium() {
  const { token } = useParams();
  const navigate = useNavigate();
  const setTableId = useCart((s) => s.setTableId);
  const setToken = useCart((s) => s.setToken);

  // Capture ?order=1 here so test mode survives the redirect to the menu (/),
  // which drops the query string. Persists to sessionStorage for this tab.
  useEffect(() => {
    isOrderMode();
  }, []);

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({
    ok: false,
    tableId: null,
    brand: "Restaurant",
  });
  const [lines, setLines] = useState([]);
  // Telr-return handling runs inside callbacks whose dependency arrays don't
  // (and shouldn't) include `lines` - they'd need to be recreated every time
  // order data refreshes. Without this ref, those callbacks close over the
  // `lines` value from whenever they were last created (often still [] from
  // initial mount), so the receipt's item list silently comes back empty.
  const linesRef = useRef([]);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [kotMasterID, setKotMasterID] = useState(null); // Store kotMasterID from order lines
  const [splitTransId, setSplitTransId] = useState(null); // Store TransID for split payments
  const [remainingBalance, setRemainingBalance] = useState(null); // Remaining balance from pending payments
  const [canPay, setCanPay] = useState(false); // Whether payment is enabled (order accepted and printed)

  // sheets
  const [showSplitOptions, setShowSplitOptions] = useState(false);
  const [showEqualSheet, setShowEqualSheet] = useState(false);
  const [showPickItems, setShowPickItems] = useState(false);
  const [showCustomSheet, setShowCustomSheet] = useState(false);

  // Tip: preset amount (AED) or custom entry
  const [tipPreset, setTipPreset] = useState(null); // number | "custom" | null
  const [customTip, setCustomTip] = useState("");
  const [showEqualSplitModal, setShowEqualSplitModal] = useState(false);
  const [showPaymentComplete, setShowPaymentComplete] = useState(false);
  const [paymentCompleteData, setPaymentCompleteData] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);
  const [serviceFeeRate, setServiceFeeRate] = useState(DEFAULT_SERVICE_FEE_RATE);

  useEffect(() => {
    API.get("/payment/service-fee-rate")
      .then(({ data }) => {
        const pct = Number(data?.ratePercent);
        if (Number.isFinite(pct) && pct >= 0) setServiceFeeRate(pct / 100);
      })
      .catch(() => {}); // keep DEFAULT_SERVICE_FEE_RATE on failure
  }, []);

  const showToast = useCallback((message, variant = "info", title = null) => {
    setToast({ message, variant, title });
  }, []);

  const showConfirm = useCallback((title, message, onConfirm, opts = {}) => {
    setConfirmState({ title, message, onConfirm, ...opts });
  }, []);
  const [paidKotChildIds, setPaidKotChildIds] = useState([]); // Track which items are paid
  const [equalSplitInfo, setEqualSplitInfo] = useState(null); // Track equal split information
  const [telrReturnStatus, setTelrReturnStatus] = useState(null);
  const [searchParams] = useSearchParams();
  const isTelrAuthParam = searchParams.get("telrStatus") === "AUTH";
  const telrHandledKeyRef = useRef(null);
  const isProcessingTelrSplitRef = useRef(false); // Track if we're processing a Telr split payment
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadOrderDataRef = useRef(null);
  const navigatingAwayRef = useRef(false); // Prevents Invalid Access flash when redirecting to menu
  const [billClosed, setBillClosed] = useState(false); // True when this QR bill is already settled / no active KOT

  const handlePaymentComplete = useCallback((data) => {
    setPaymentCompleteData(data);
    setShowPaymentComplete(true);
    setShowEqualSplitModal(false);
  }, []);

  const startTelrSession = useCallback(
    async (payload) => {
      if (!payload || isPaymentProcessing) return;

      // TEMP: Telr redirect disabled — full payment UI is browsable, but no
      // gateway session is created. Set TELR_REDIRECT_ENABLED to true to restore.
      if (!TELR_REDIRECT_ENABLED) {
        showToast("Online payment is temporarily unavailable. Please ask staff for assistance.", "info", "Payment Preview");
        return;
      }

      const {
        amount,
        billAmount = null,
        serviceFeeAmount = 0,
        tipAmount = 0,
        tableId,
        kotMasterID,
        token: payloadToken,
        brand: payloadBrand,
        mode = "pay-full",
        splitPayload = null,
        // Split-mode extras — let the backend webhook complete this leg on
        // its own if the frontend's follow-up save call never fires (closed
        // browser, network drop, etc).
        numberOfPeople = null,
        items = null,
        originalBillAmount = null,
      } = payload;

      const MIN_PROCESSING_OVERLAY_MS = 5000;
      const overlayStartedAt = Date.now();

      try {
        setIsPaymentProcessing(true);
        const timestamp = new Date();
        const cartId = `TABLE-${tableId || "UNKNOWN"}-${timestamp.getTime()}`;
        const descriptionSegments = [
          payloadBrand ? `${payloadBrand}` : null,
          tableId ? `Table ${tableId}` : null,
          mode && mode !== "pay-full" ? mode.replace("split-", "").replace(/-/g, " ") : null,
          timestamp.toLocaleString(),
        ].filter(Boolean);
        const description =
          descriptionSegments.length > 0
            ? descriptionSegments.join(" • ")
            : `Table ${tableId || ""} bill`;

        const telrPayload = {
          amount: Number(amount),
          billAmount: billAmount != null ? Number(billAmount) : Number(amount),
          serviceFeeAmount: Number(serviceFeeAmount) || 0,
          tipAmount: Number(tipAmount) || 0,
          currency: "AED",
          cartId,
          description,
          tableId,
          kotMasterID,
          token: payloadToken,
          mode,
          numberOfPeople,
          items,
          originalBillAmount,
          customer: {},
        };
        log("[EQUAL SPLIT] Step 2 - Telr session starting:", {
          mode,
          amount,
          kotMasterID,
          tableId,
          splitPayload,
          telrPayload
        });
        const session = await createTelrSession(telrPayload);

        if (!session?.url || !session?.orderRef) {
          throw new Error("Invalid Telr session response");
        }

        // CRITICAL: Store mode and splitPayload in sessionStorage
        // This ensures we can correctly identify the payment method when Telr returns
        const sessionData = {
          orderRef: session.orderRef,
          sessionKey: session.sessionKey || null, // fallback if URL param is lost
          amount: Number(amount),
          // Server-recomputed fee for THIS leg (proportional to the amount
          // actually charged, same for every mode) - carried through so the
          // post-return save call can record it against this payment leg.
          serviceFeeAmount: Number(session.serviceFeeAmount) || 0,
          // Tip the guest chose for this leg - already part of what Telr
          // charged (see telrPayload.tipAmount above), carried through so
          // the post-return save call can record it too.
          tipAmount: Number(tipAmount) || 0,
          tableId,
          kotMasterID,
          token: payloadToken,
          mode: mode || "pay-full", // Ensure mode is always set
          splitPayload: splitPayload || null,
          // Order item snapshot taken before the Telr redirect - once payment
          // settles the bill, /r/resolve stops returning line items for this
          // KOT, so the return handler can't rebuild this list from live data.
          items: Array.isArray(items) && items.length > 0 ? items : null,
          createdAt: Date.now(),
        };
        sessionStorage.setItem("telr:lastSession", JSON.stringify(sessionData));

        // Keep the "please wait" overlay up for a minimum stretch so it's
        // actually readable, even when /telr/create responds in well under
        // a second on a fast connection.
        const elapsed = Date.now() - overlayStartedAt;
        if (elapsed < MIN_PROCESSING_OVERLAY_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_PROCESSING_OVERLAY_MS - elapsed));
        }

        window.location.href = session.url;
      } catch (err) {
        logError("Telr session error:", err);
        const errorMsg = err?.response?.data?.error || err?.message || "Payment failed. Please try again.";
        showToast(errorMsg, "error", "Payment Failed");
      } finally {
        setIsPaymentProcessing(false);
      }
    },
    [isPaymentProcessing],
  );

  // "Pay fully" goes straight to the Telr-hosted checkout — no in-app payment
  // method picker, since Card is the only working option today.
  const handlePayFullRequest = useCallback((payload) => {
    if (payload.mode === "split-equal" && payload.splitPayload) {
      startTelrSession({ ...payload, mode: "split-equal" });
    } else {
      startTelrSession({ ...payload, mode: "pay-full", splitPayload: null });
    }
  }, [startTelrSession]);

  const completeSplitPaymentFromTelr = useCallback(
    async ({ mode, splitPayload, telrPaymentId, amountPaid, sessionKey, orderRef, serviceFeeAmount = 0, tipAmount = 0, items = null }) => {
      if (!mode || mode === "pay-full") return false;
      if (!splitPayload) return false;

      // Set flag to prevent redirects during Telr split payment processing
      isProcessingTelrSplitRef.current = true;

      try {
        if (mode === "split-equal") {
          const { paymentPayload, amountPerPerson, numberOfPeople } = splitPayload;
          log("[EQUAL SPLIT] Step 3 - After Telr return, calling processEqualSplit:", {
            mode,
            splitPayload,
            paymentPayload,
            amountPerPerson,
            numberOfPeople
          });
          // orderRef is mandatory server-side: the backend settles strictly from
          // the Telr-authorised PaymentSession row it identifies, not from any
          // amount in this payload (see payment.controller.js settleFromOrderRef).
          const result = await processEqualSplit({ ...paymentPayload, sessionKey: sessionKey || undefined, orderRef, serviceFeeAmount, tipAmount });

          if (!result.ok) {
            throw new Error(result.error || "Equal split payment processing failed");
          }

          const balance = result.balanceAmount || result.BalanceAmount || 0;
          const paidStatus = result.paidStatus || result.PaidStatus || "PENDING";
          // amountPaid (from the Telr return) is this leg's real charge incl.
          // fee+tip - result.PaidAmount is the whole-bill running bill-share
          // total used for balance tracking, not what THIS payer actually paid.
          const paidValue = amountPaid || result.PaidAmount || result.paidAmount || amountPerPerson;

          if (balance <= 0 && paidStatus === "PAID") {
            handlePaymentComplete({
              paymentId: telrPaymentId || result.paymentId,
              amountPaid: paidValue,
              status: paidStatus,
              mode: "split-equal",
              serviceFeeAmount,
              tipAmount,
              tableLabel: meta.tableName || (meta.tableNo ? `Table ${meta.tableNo}` : null),
              brand: meta.brand,
              splitInfo: { numberOfPeople, amountPerPerson: amountPerPerson || paidValue },
              items:
                items ||
                linesRef.current.map((it) => ({
                  name: it.ShortDescription || `Item #${it.ProductID}`,
                  qty: it.Qty,
                  unitPrice: it.UnitPrice,
                  total: it.LineTotal,
                })),
            });
          } else {
            showToast(`Paid ${fmt(paidValue)} AED · Remaining: ${fmt(balance)} AED`, "success", "Payment Successful");
            setRemainingBalance(balance);
            if (numberOfPeople > 0) {
              setEqualSplitInfo({
                amountPerPerson: amountPerPerson || paidValue,
                numberOfPeople,
              });
            }
            // Don't reload - stay on payment page to allow continued payment
            // Refresh order data to get updated balance without reloading page
            if (loadOrderDataRef.current) {
              loadOrderDataRef.current();
            }
          }
          return true;
        }

        if (mode === "split-items") {
          const { paymentPayload, totalAmount } = splitPayload;
          if (!paymentPayload) {
            throw new Error("Payment payload is missing for item split payment");
          }
          
          if (!paymentPayload.items || !Array.isArray(paymentPayload.items) || paymentPayload.items.length === 0) {
            throw new Error("No items found in payment payload for item split payment");
          }
          
          const result = await processItemSplit({ ...paymentPayload, orderRef, serviceFeeAmount, tipAmount });
          if (!result.ok) {
            throw new Error(result.error || "Item split payment processing failed");
          }
          const balance = result.BalanceAmount || result.balanceAmount || 0;
          const paidStatus = result.PaidStatus || result.paidStatus || "PENDING";
          // amountPaid (from the Telr return) is this leg's real charge incl.
          // fee+tip - result.PaidAmount/itemsPaid are bill-only figures, not
          // what THIS payer actually paid.
          const paidValue = amountPaid || result.PaidAmount || result.paidAmount || result.itemsPaid || totalAmount;

          // Always refresh paid items after item split payment (regardless of balance)
          // Add a small delay to ensure database transaction is committed
          if (paymentPayload?.kotMasterID) {
            try {
              // Wait a bit for database transaction to complete
              await new Promise(resolve => setTimeout(resolve, 500));
              const paidItems = await getPaidItems(paymentPayload.kotMasterID);
              setPaidKotChildIds(paidItems);
            } catch (err) {
              logError("Error refreshing paid items:", err);
            }
          }

          if (balance <= 0 && paidStatus === "PAID") {
            // Payment complete - refresh data to show paid items, then show success screen
            // loadOrderData will also fetch paid items, so we ensure they're set
            if (loadOrderDataRef.current) {
              await loadOrderDataRef.current();
              // After loadOrderData, ensure paid items are still set (it should fetch them)
              if (paymentPayload?.kotMasterID) {
                try {
                  const paidItems = await getPaidItems(paymentPayload.kotMasterID);
                  setPaidKotChildIds(paidItems);
                } catch (err) {
                  logError("Error refreshing paid items after loadOrderData:", err);
                }
              }
            }
            handlePaymentComplete({
              paymentId: telrPaymentId || result.paymentId,
              amountPaid: paidValue,
              status: paidStatus,
              mode: "split-items",
              serviceFeeAmount,
              tipAmount,
              tableLabel: meta.tableName || (meta.tableNo ? `Table ${meta.tableNo}` : null),
              brand: meta.brand,
              items: (paymentPayload.items || []).map((it) => ({
                name: it.desc || `Item #${it.productId ?? ""}`,
                qty: it.qty,
                unitPrice: it.unitPrice,
                total: it.lineTotal,
              })),
            });
          } else {
            showToast(`Paid ${fmt(paidValue)} AED · Remaining: ${fmt(balance)} AED`, "success", "Payment Successful");
            // Don't reload - stay on payment page to allow continued payment
            // Refresh order data to get updated balance without reloading page
            if (loadOrderDataRef.current) {
              await loadOrderDataRef.current();
              // Ensure paid items are set after loadOrderData
            if (paymentPayload?.kotMasterID) {
              try {
                const paidItems = await getPaidItems(paymentPayload.kotMasterID);
                setPaidKotChildIds(paidItems);
              } catch (err) {
                  logError("Error refreshing paid items after loadOrderData:", err);
              }
            }
            }
          }
          return true;
        }

        if (mode === "split-custom") {
          const { paymentPayload, paidAmount } = splitPayload;
          const result = await processCustomSplit({ ...paymentPayload, orderRef, serviceFeeAmount, tipAmount });

          if (!result.ok) {
            throw new Error(result.error || "Payment processing failed");
          }

          if (!splitTransId && result.transId) {
            setSplitTransId(result.transId);
          }

          const balance = result.balanceAmount || result.BalanceAmount || 0;
          const paidStatus = result.paidStatus || result.PaidStatus || "PENDING";
          // amountPaid (from the Telr return) is this leg's real charge incl.
          // fee+tip - result.PaidAmount/billAmount are bill-only figures, not
          // what THIS payer actually paid.
          const totalPaid = amountPaid || result.paidAmount || result.PaidAmount || result.billAmount || result.BillAmount || paidAmount;

          if (balance <= 0 && paidStatus === "PAID") {
            handlePaymentComplete({
              paymentId: telrPaymentId || result.paymentId,
              amountPaid: totalPaid,
              status: paidStatus,
              totalPaid,
              billAmount: result.originalBillAmount || result.billAmount || result.BillAmount,
              mode: "split-custom",
              serviceFeeAmount,
              tipAmount,
              tableLabel: meta.tableName || (meta.tableNo ? `Table ${meta.tableNo}` : null),
              brand: meta.brand,
              items:
                items ||
                linesRef.current.map((it) => ({
                  name: it.ShortDescription || `Item #${it.ProductID}`,
                  qty: it.Qty,
                  unitPrice: it.UnitPrice,
                  total: it.LineTotal,
                })),
            });
            setRemainingBalance(null);
            setSplitTransId(null);
          } else {
            showToast(`Paid ${fmt(amountPaid || paidAmount)} AED · Remaining: ${fmt(balance)} AED`, "success", "Payment Successful");
            setRemainingBalance(balance);
            setSplitTransId(result.transId);
            // Don't reload - stay on payment page to allow continued payment
            // Refresh order data to get updated balance without reloading page
            if (loadOrderDataRef.current) {
              loadOrderDataRef.current();
            }
          }
          return true;
        }

        return false;
      } catch (err) {
        logError("Split payment completion error:", err);
        const errorMsg = err?.response?.data?.error || err.message || "Payment failed. Please try again.";
        showToast(errorMsg, "error", "Payment Failed");
        return false;
      } finally {
        // Clear the flag after a short delay to allow loadOrderData to complete
        setTimeout(() => {
          isProcessingTelrSplitRef.current = false;
        }, 2000);
      }
    },
    [
      handlePaymentComplete,
      setEqualSplitInfo,
      setPaidKotChildIds,
      setRemainingBalance,
      setSplitTransId,
      splitTransId,
      showToast,
    ],
  );


  useEffect(() => {
    const status = searchParams.get("telrStatus");
    const orderRef = searchParams.get("orderRef");
    const paymentIdParam = searchParams.get("paymentId");
    const sessionKeyParam = searchParams.get("sessionKey");

    if (!status) {
      setTelrReturnStatus(null);
      return;
    }

    setTelrReturnStatus(status);

    const clearParams = () => {
      const current = new URL(window.location.href);
      current.searchParams.delete("telrStatus");
      current.searchParams.delete("orderRef");
      current.searchParams.delete("paymentId");
      current.searchParams.delete("tableId");
      current.searchParams.delete("kotMasterID");
      current.searchParams.delete("sessionKey");
      current.searchParams.delete("mode");
      current.searchParams.delete("settled");
      current.searchParams.delete("balanceAmount");
      current.searchParams.delete("paidStatus");
      current.searchParams.delete("amount");
      current.searchParams.delete("cartId");
      window.history.replaceState({}, "", current.toString());
    };

    const storedRaw = sessionStorage.getItem("telr:lastSession");
    const stored =
      storedRaw && storedRaw !== "undefined"
        ? (() => {
            try {
              return JSON.parse(storedRaw);
            } catch {
              return null;
            }
          })()
        : null;

    const handledKeyCandidate = orderRef || sessionKeyParam || paymentIdParam || stored?.orderRef || null;

    if (status === "AUTH") {
      if (handledKeyCandidate && telrHandledKeyRef.current === handledKeyCandidate) {
        clearParams();
        if (stored?.orderRef === orderRef) {
          sessionStorage.removeItem("telr:lastSession");
        }
        return;
      }

      // Set the handled key immediately to prevent duplicate processing
      telrHandledKeyRef.current = handledKeyCandidate || `handled-${Date.now()}`;

      (async () => {
        try {
          // Add a small delay to prevent rapid-fire requests
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const telrResponse = await checkTelrStatus(orderRef || stored?.orderRef || "");
          const telrData = telrResponse?.data || {};
          const transactionStatus = telrData?.transaction?.status?.code;
          const orderStatusCode = Number(telrData?.order?.status?.code);
          const authorised = transactionStatus === "A" || orderStatusCode === 3;
          if (!authorised) {
            showToast("We could not confirm the payment yet. Please contact a staff member.", "warning", "Payment Unverified");
            telrHandledKeyRef.current = null;
          } else {
            // Set telrReturnStatus to "AUTH" BEFORE processing payment to prevent redirects
            setTelrReturnStatus("AUTH");
            
            // stored.amount is only the raw bill (what was sent to /api/telr/create,
            // before fee/tip) - NOT what the customer was actually charged. The real
            // total is bill + this leg's fee + tip, so prefer Telr's own authorized
            // amount, then that computed total, before ever falling back to the bare bill.
            const storedTrueTotal = stored
              ? Number(stored.amount || 0) + Number(stored.serviceFeeAmount || 0) + Number(stored.tipAmount || 0)
              : null;
            const amountPaid =
              Number(telrData?.order?.amount) ||
              (Number.isFinite(storedTrueTotal) && storedTrueTotal > 0 ? storedTrueTotal : null) ||
              Number(telrData?.order?.total) ||
              stored?.amount;

            const paymentIdValue =
              paymentIdParam ||
              telrData?.order?.tranid ||
              telrData?.order?.trans_ref ||
              telrData?.transaction?.ref ||
              telrData?.order?.ref;

            // Read mode: sessionStorage is primary, URL param is backup
            const modeFromUrl = searchParams.get("mode");
            const mode = stored?.mode || modeFromUrl || "pay-full";
            const splitPayload = stored?.splitPayload || null;
            log("[EQUAL SPLIT] Telr return - mode:", mode, "| from storage:", stored?.mode, "| from URL:", modeFromUrl, "| kotMasterID:", stored?.kotMasterID);
            // CRITICAL: Determine the actual payment mode
            // Priority: 1. stored.mode, 2. infer from splitPayload structure, 3. default to pay-full
            // If splitPayload exists, it's ALWAYS a split payment - never pay-full
            let actualMode = mode;
            
            // If splitPayload exists, this is definitely a split payment
            // Infer the mode from splitPayload structure if mode is missing or wrong
            if (splitPayload) {
              if (splitPayload.paymentPayload?.items && Array.isArray(splitPayload.paymentPayload.items)) {
                actualMode = "split-items";
              } else if (splitPayload.paymentPayload?.numberOfPeople || splitPayload.numberOfPeople) {
                actualMode = "split-equal";
              } else if (splitPayload.paymentPayload?.paidAmount && splitPayload.paymentPayload?.billAmount) {
                actualMode = "split-custom";
              } else if (mode !== "pay-full") {
                actualMode = mode;
              } else {
                // splitPayload exists but we can't determine type - this is an error
                logError("[FRONTEND] Telr callback - splitPayload exists but mode cannot be determined!", splitPayload);
                showToast("Payment error: Could not determine payment method. Please contact support.", "error", "Payment Error");
                return;
              }
            }

            // The backend's /telr/return/auth handler now settles split payments
            // itself, inline, using the item/amount data it captured server-side
            // at session-creation time (see telr.routes.js settleSplitFromSession).
            // That happens BEFORE this redirect ever reaches the browser, so it
            // does not depend on sessionStorage surviving the cross-origin trip
            // to Telr and back - which mobile/in-app browsers can and do drop,
            // previously causing a charge that Telr recorded but that never made
            // it into dbo.Payment/dbo.PaymentItems.
            //
            // settled === "1" -> backend already wrote the row. Do NOT call the
            // split-save endpoint again here: it would either throw ("all items
            // already paid") or, if a save function is ever made to no-op instead
            // of throwing, silently double-count the leg.
            const settledParam = searchParams.get("settled");
            const balanceAmountParam = searchParams.get("balanceAmount");
            const paidStatusParam = searchParams.get("paidStatus");

            if (actualMode && actualMode !== "pay-full" && settledParam === "1") {
              const balance = Number(balanceAmountParam) || 0;
              const paidStatus = paidStatusParam || (balance <= 0 ? "PAID" : "PENDING");
              const paidValue = Number.isFinite(amountPaid) ? amountPaid : undefined;

              if (balance <= 0 && paidStatus === "PAID") {
                if (loadOrderDataRef.current) await loadOrderDataRef.current();
                if (actualMode === "split-items" && kotMasterID) {
                  try {
                    setPaidKotChildIds(await getPaidItems(kotMasterID));
                  } catch (err) {
                    logError("Error refreshing paid items after inline settlement:", err);
                  }
                }
                handlePaymentComplete({
                  paymentId: paymentIdValue,
                  amountPaid: paidValue,
                  status: paidStatus,
                  mode: actualMode,
                  serviceFeeAmount: stored?.serviceFeeAmount || 0,
                  tipAmount: stored?.tipAmount || 0,
                  tableLabel: meta.tableName || (meta.tableNo ? `Table ${meta.tableNo}` : null),
                  brand: meta.brand,
                  items:
                    actualMode === "split-items" && splitPayload?.paymentPayload?.items
                      ? splitPayload.paymentPayload.items.map((it) => ({
                          name: it.desc || `Item #${it.productId ?? ""}`,
                          qty: it.qty,
                          unitPrice: it.unitPrice,
                          total: it.lineTotal,
                        }))
                      : null,
                });
              } else {
                showToast(`Paid ${fmt(paidValue || 0)} AED · Remaining: ${fmt(balance)} AED`, "success", "Payment Successful");
                setRemainingBalance(balance);
                if (loadOrderDataRef.current) await loadOrderDataRef.current();
                if (actualMode === "split-items" && kotMasterID) {
                  try {
                    setPaidKotChildIds(await getPaidItems(kotMasterID));
                  } catch (err) {
                    logError("Error refreshing paid items after inline settlement:", err);
                  }
                }
              }
              return;
            }

            // Fallback path: either a non-split payment, or the inline backend
            // settlement above did not run/succeed (settledParam is "0" or
            // absent) - try the frontend-driven save using whatever sessionStorage
            // still has. This is the pre-existing behaviour, kept as a second
            // safety net (the webhook is the third and last one).
            // CRITICAL: If we have a split payment, process it as split
            // NEVER create a Pay Full payment if splitPayload exists
            if (actualMode && actualMode !== "pay-full") {
              if (!splitPayload) {
                // Backend inline settlement didn't happen (or failed) AND we have
                // no local record of what was selected - we genuinely cannot
                // complete this leg from the browser. Do not silently pretend
                // success; the webhook remains the last resort if configured.
                logError("[FRONTEND] Split payment lost both inline settlement and sessionStorage payload — cannot complete client-side.", { actualMode, settledParam });
                showToast("Payment authorised, but we could not confirm it against your order. Please check with staff.", "warning", "Please Check With Staff");
                return;
              }
              // Process split payment - this will set isProcessingTelrSplitRef to prevent redirects
              const splitResult = await completeSplitPaymentFromTelr({
                mode: actualMode,
                splitPayload,
                telrPaymentId: paymentIdValue,
                amountPaid: Number.isFinite(amountPaid) ? amountPaid : undefined,
                // orderRef identifies the Telr-authorised PaymentSession row the
                // backend settles from - mandatory now (see settleFromOrderRef).
                orderRef: orderRef || stored?.orderRef || null,
                // Pass sessionKey so the backend can verify the paidAmount
                // against what Telr actually charged (tamper protection)
                sessionKey: sessionKeyParam || stored?.sessionKey || null,
                // Server-recomputed fee charged for this leg (see startTelrSession)
                serviceFeeAmount: stored?.serviceFeeAmount || 0,
                tipAmount: stored?.tipAmount || 0,
                items: stored?.items || null,
              });
              // If split payment has balance, don't do anything else - stay on page
              // The completeSplitPaymentFromTelr already handled the balance display
              if (splitResult) {
                return;
              } else {
                logError("[FRONTEND] Split payment processing returned false - this should not happen");
              }
            } else {
              // CRITICAL: Do NOT create a Pay Full payment here!
              // handlePaymentComplete only shows the completion screen, it doesn't create a payment
              // The payment should have been created by the backend when Telr authorized it
              // If we're here, it means either:
              // 1. This is a legitimate pay-full payment (no split)
              // 2. The mode was lost and we can't determine the payment type
              // In case 2, we should NOT create a payment - just show completion
              handlePaymentComplete({
                paymentId: paymentIdValue,
                amountPaid: Number.isFinite(amountPaid) ? amountPaid : undefined,
                billAmount: Number.isFinite(amountPaid) ? amountPaid : undefined,
                status: "PAID",
                telrOrderRef: orderRef || telrData?.order?.ref || stored?.orderRef,
                mode: "pay-full",
                serviceFeeAmount: stored?.serviceFeeAmount || 0,
                tipAmount: stored?.tipAmount || 0,
                tableLabel: meta.tableName || (meta.tableNo ? `Table ${meta.tableNo}` : null),
                brand: meta.brand,
                items:
                  stored?.items ||
                  linesRef.current.map((it) => ({
                    name: it.ShortDescription || `Item #${it.ProductID}`,
                    qty: it.Qty,
                    unitPrice: it.UnitPrice,
                    total: it.LineTotal,
                  })),
              });
            }
          }
        } catch (err) {
          logError("Telr callback handling failed:", err);
          showToast("Payment authorised, but we could not verify the status. Please check with staff.", "warning", "Please Check With Staff");
          telrHandledKeyRef.current = null;
          isProcessingTelrSplitRef.current = false; // Clear flag on error
        } finally {
          setIsPaymentProcessing(false);
          if (stored?.orderRef === orderRef) {
            sessionStorage.removeItem("telr:lastSession");
          }
          clearParams();
        }
      })();
    } else {
      sessionStorage.removeItem("telr:lastSession");

      if (status === "CANCEL") {
        showToast("Payment was cancelled.", "info");
      } else if (status === "DECLINED") {
        showToast("Payment was declined. Please try again with a different card.", "error", "Payment Declined");
      }

      clearParams();
    }
  }, [searchParams, handlePaymentComplete, completeSplitPaymentFromTelr]);

  // Fetch payment methods
  useEffect(() => {
    (async () => {
      try {
        const methods = await getPaymentMethods();
        
        setPaymentMethods(methods);
      } catch (err) {
        logError("Failed to load payment methods:", err);
        // Keep default behavior if fetch fails
        setPaymentMethods([]);
      }
    })();
  }, []);

  // Match payment methods by PaymentMethodID:
  // ID 1 = Pay Full → Show "Pay fully" button
  // ID 2 = Equal Split → Show "Divide the bill equally" option
  // ID 3 = Item Split → Show "Pay for your items" option
  // ID 4 = Custom Split → Show "Pay a custom amount" option
  
  const hasMethodById = (methodId) => {
    return paymentMethods.some(m => Number(m.paymentMethodId) === Number(methodId));
  };

  // Show buttons/options based on PaymentMethodID
  const showPayFull = paymentMethods.length === 0 || hasMethodById(1); // Pay Full
  const showSplitBill = paymentMethods.length === 0 || hasMethodById(2) || hasMethodById(3) || hasMethodById(4); // Any split method
  const showSplitEqually = paymentMethods.length === 0 || hasMethodById(2); // Equal Split
  const showSplitItems = paymentMethods.length === 0 || hasMethodById(3); // Item Split
  const showCustomAmount = paymentMethods.length === 0 || hasMethodById(4); // Custom Split

  // Lock rules:
  //
  //  Equal Split active  → Custom LOCKED (equal is a group agreement; custom breaks it)
  //                      → Item   LOCKED (amount-based vs item-based conflict)
  //                      → Equal  OPEN   (continue the agreement)
  //
  //  Custom Split active → Equal  OPEN   (both just track a running balance; flexible)
  //                      → Custom OPEN   (continue)
  //                      → Item   LOCKED (amount-based vs item-based conflict)
  //
  //  Item Split active   → Equal  LOCKED (item-based vs amount-based conflict)
  //                      → Custom LOCKED (item-based vs amount-based conflict)
  //                      → Item   OPEN   (continue picking items)

  // Full bill total (for lock rules; same value as fullGrand used later).
  // Must use the discounted KOTMaster.Amount when a POS bill discount exists,
  // so split detection compares against the same discounted total the backend's
  // remainingBalance is derived from - otherwise a discounted-but-fully-paid
  // bill could look like a partial (custom) split.
  const fullGrandTotal = useMemo(
    () => {
      const seen = new Set();
      let sumLine = 0, sumKotAmount = 0, sumDiscount = 0, svc = 0;
      for (const x of lines) {
        sumLine += Number(x.LineTotal) || 0;
        svc += Number(x.ServiceFee) || 0;
        const kotId = x.kotMasterID ?? x.kotMasterId ?? x.KotMasterID;
        if (kotId != null && !seen.has(kotId)) {
          seen.add(kotId);
          sumKotAmount += Number(x.KotAmount) || 0;
          sumDiscount += Number(x.BillDiscount) || 0;
        }
      }
      const billTotal = (sumDiscount > 0 && sumKotAmount > 0) ? sumKotAmount : sumLine;
      return billTotal + svc;
    },
    [lines]
  );

  // True when all items in the current KOT are already paid (item split)
  const allItemsPaid =
    lines.length > 0 &&
    lines.every((item) => {
      const kotChildId = item.KotChildID || item.kotChildID || item.kotChildId || null;
      return kotChildId && paidKotChildIds.includes(Number(kotChildId));
    });

  // Item split is active when at least one item has been marked paid but not all
  const itemSplitActive = paidKotChildIds.length > 0 && !allItemsPaid;

  const equalSplitActive =
    equalSplitInfo !== null && remainingBalance !== null && remainingBalance > 0;

  // Custom split is active when balance is partially reduced AND it is NOT an equal split
  // and we are NOT in item-split mode. Item split also creates a remaining balance in the
  // payments table, but it should not be treated as an amount-based split here.
  const customSplitActive =
    !equalSplitActive &&
    !itemSplitActive &&
    remainingBalance !== null &&
    fullGrandTotal != null &&
    remainingBalance > 0 &&
    remainingBalance < fullGrandTotal;

  // Any amount-based split (equal or custom) is in progress (never item split)
  const amountSplitActive = equalSplitActive || customSplitActive;

  // Per-option lock reasons (null = not locked)
  const equalLockReason  = itemSplitActive   ? "Item split in progress — continue paying for items"   : null;
  const customLockReason = equalSplitActive  ? "Equal split in progress — everyone pays their share"
                         : itemSplitActive   ? "Item split in progress — continue paying for items"    : null;
  const itemLockReason   = amountSplitActive ? "Amount split in progress — pay by amount to complete" : null;

  // Function to load order data
  const loadOrderData = useCallback(async () => {
    if (!token) return;
    setBillClosed(false);
    try {
      setRefreshing(true);
      const { data } = await API.post("/r/resolve", { token });
      const tableId = data.tableId;
      const linesData = data.lines || [];
      const areaName = data.area ?? null;
      const canPayValue = data.canPay === true; // Payment enabled only if order is accepted (HOLD) and printed
      
      // Look up areaId from area name
      let areaId = null;
      if (areaName) {
        try {
          const { getAreas } = await import("../services/menu.service");
          const areas = await getAreas();
          const areaObj = areas.find(a => a.areaName === areaName);
          if (areaObj) {
            areaId = areaObj.areaId;
          }
        } catch (err) {
          logError("Error fetching areas to get areaId:", err);
        }
      }
      
      // Store tableId, area, areaId, tableNo, tableName in cart store for use in order submission and navigation
      if (tableId) {
        setTableId(tableId, areaName, areaId, data.tableNo ?? null, data.tableName ?? null);
      }
      if (token) {
        setToken(token);
      }

      // Dev: show full link details in console when this page is opened from generated link
      if (typeof window !== "undefined") {
        log("[Link details]", {
          url: window.location.href,
          token,
          tableId,
          tableNo: data.tableNo ?? null,
          tableName: data.tableName ?? null,
          area: areaName ?? null,
        });
      }

      setCanPay(canPayValue);
      // If no orders exist, redirect to menu page
      // EXCEPT: Don't redirect if we're processing a Telr return (split payment may have just been saved)
      const isProcessingTelrReturnCheck = isTelrAuthParam || telrReturnStatus === "AUTH" || isProcessingTelrSplitRef.current;
      let resolvedLines = linesData;
      // When returning from Telr (e.g. item split): backend may not see the new payment yet. Retry once after a short delay.
      if (resolvedLines.length === 0 && isProcessingTelrReturnCheck) {
        await new Promise((r) => setTimeout(r, 700));
        const retryRes = await API.post("/r/resolve", { token });
        const retryLines = retryRes?.data?.lines || [];
        if (retryLines.length > 0) {
          resolvedLines = retryLines;
          // Use latest canPay and table info from retry
          if (retryRes.data.canPay !== undefined) setCanPay(retryRes.data.canPay === true);
          if (retryRes.data.tableName != null) data.tableName = retryRes.data.tableName;
          if (retryRes.data.tableNo != null) data.tableNo = retryRes.data.tableNo;
        }
      }
      if (resolvedLines.length === 0 && !isProcessingTelrReturnCheck) {
        // No active order — set table context and redirect to menu so customer can order
        if (tableId) {
          setTableId(tableId, areaName, areaId, data.tableNo ?? null, data.tableName ?? null);
        }
        if (token) {
          setToken(token);
        }
        navigatingAwayRef.current = true;
        navigate("/menu");
        return;
      }
      // If there are orders, show the payment page (even if not accepted yet)
      
      // Extract kotMasterID from first line (all lines should have the same kotMasterID)
      // Check for different possible property names
      const firstLine = resolvedLines.length > 0 ? resolvedLines[0] : null;
      let kotMasterID = null;
      
      if (firstLine) {
        kotMasterID = firstLine.kotMasterID || firstLine.kotMasterId || firstLine.KotMasterID || firstLine.KotMasterId || null;
      }
      
      setMeta({
        ok: !!data.ok,
        tableId: tableId,
        tableName: data.tableName || null,
        tableNo: data.tableNo || null,
        brand: data.brand || "Restaurant",
      });
      setLines(resolvedLines);
      setKotMasterID(kotMasterID);
      // Fetch remaining balance and check if table is fully paid
      let balanceData = null;
      if (tableId && kotMasterID) {
        try {
          // Pass kotMasterID to get balance for this specific KOT
          balanceData = await getBalance(tableId, kotMasterID);
          // CRITICAL: Never redirect if there's a remaining balance - user needs to stay on payment page
          // Also never redirect if we're processing a Telr return (split payments may have balance)
          // Check if this specific kotMasterID is fully paid (PaidStatus = "PAID")
          // If paid AND balance is 0, silently redirect to menu - this KOT is settled, next order will be new kotMasterID
          const isProcessingTelrReturn = isTelrAuthParam || telrReturnStatus === "AUTH" || isProcessingTelrSplitRef.current;
          const hasRemainingBalance = balanceData.balance > 0;
          // CRITICAL: NEVER redirect if:
          // 1. There's a remaining balance (user needs to continue paying)
          // 2. We're processing a Telr return (might be split payment with balance)
          // 3. Payment complete screen is showing
          // 4. There's equal split info (split payment in progress)
          // 5. There are paid items (item split in progress - some items paid but not all)
          // 6. We're on the /r/:token route (user should stay on payment page)
          const hasEqualSplitInfo = balanceData.equalSplitInfo !== null && balanceData.equalSplitInfo !== undefined;
          const isOnPaymentRoute = window.location.pathname.includes('/r/');
          
          // Don't check redirect here - wait until after paid items are fetched
          // This prevents redirecting when item split is in progress
          // We'll do the redirect check after fetching paid items below
          
          // IMPORTANT: Don't proceed with redirect check here - wait until after paid items are fetched
          // This ensures we can check if item split is in progress
          
          // CRITICAL: Only show balance if it's > 0 (payment not complete)
          // When balance = 0, payment is complete - clear remainingBalance
          if (balanceData.balance > 0) {
            // Payment is pending - show balance (regardless of isFullyPaid status for split payments)
            setRemainingBalance(balanceData.balance);
            setSplitTransId(balanceData.transId);
            // Set equal split info if available (only if balance > 0)
            if (balanceData.equalSplitInfo) {
              setEqualSplitInfo(balanceData.equalSplitInfo);
              // Show modal to inform user about equal split in progress.
              // The modal render is already guarded by !showPaymentComplete in JSX,
              // so setting the flag here is safe even if payment completes shortly after.
              if (isProcessingTelrReturn) {
                setTimeout(() => setShowEqualSplitModal(true), 1000);
              } else {
                setShowEqualSplitModal(true);
              }
            }
          } else {
            // Payment is complete (balance = 0) - clear everything
            setRemainingBalance(null);
            setEqualSplitInfo(null);
            setSplitTransId(null);
          }
        } catch (err) {
          logError("Error fetching balance:", err);
          setRemainingBalance(null);
        }
      }
      
      // Fetch paid items for item split (if kotMasterID exists)
      // This is important to show which items are already paid
      // MUST fetch before redirect check to prevent redirecting when item split is in progress
      let fetchedPaidItems = [];
      if (kotMasterID) {
        try {
          // Add a small delay to ensure any recent payments are committed to database
          await new Promise(resolve => setTimeout(resolve, 300));
          fetchedPaidItems = await getPaidItems(kotMasterID);
          setPaidKotChildIds(fetchedPaidItems);
        } catch (err) {
          logError("Error fetching paid items:", err);
          setPaidKotChildIds([]);
        }
      } else {
        // If no kotMasterID, clear paid items
        setPaidKotChildIds([]);
      }
      
      // Now check for redirect AFTER fetching paid items
      // Check if item split is in progress (some items are paid but not all)
      const hasItemSplitInProgressCheck = fetchedPaidItems.length > 0 && resolvedLines.length > 0;
      const allItemsPaidCheck = hasItemSplitInProgressCheck && resolvedLines.every(item => {
        const kotChildId = item.KotChildID || item.kotChildID || item.kotChildId || null;
        return kotChildId && fetchedPaidItems.includes(Number(kotChildId));
      });
      const hasUnpaidItemsCheck = hasItemSplitInProgressCheck && !allItemsPaidCheck;
      
      // Final redirect check AFTER fetching paid items (balanceData in outer scope for this block)
      if (tableId && kotMasterID) {
        try {
          if (hasUnpaidItemsCheck) {
            return;
          }
          let finalBalanceData = balanceData;
          if (!finalBalanceData) {
            finalBalanceData = await getBalance(tableId, kotMasterID);
          }
          const finalIsProcessingTelrReturn = isTelrAuthParam || telrReturnStatus === "AUTH" || isProcessingTelrSplitRef.current;
          const finalHasRemainingBalance = finalBalanceData.balance > 0;
          const finalHasEqualSplitInfo = finalBalanceData.equalSplitInfo != null;
          const finalIsOnPaymentRoute = window.location.pathname.includes('/r/');
          const shouldRedirectFinal = !finalHasRemainingBalance && 
                                     !finalIsProcessingTelrReturn && 
                                     !showPaymentComplete && 
                                     !finalHasEqualSplitInfo &&
                                     finalBalanceData.balance <= 0 &&
                                     finalBalanceData.isFullyPaid &&
                                     finalBalanceData.paidStatus === "PAID" &&
                                     !finalIsOnPaymentRoute;
          if (shouldRedirectFinal && !finalBalanceData.hasUnpaidKots && (resolvedLines.length === 0 || allItemsPaidCheck)) {
            navigate("/menu");
            return;
          }
        } catch (err) {
          logError("Error in final redirect check:", err);
        }
      }
    } catch (err) {
      logError("Error loading order data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, setTableId, navigate, telrReturnStatus, isTelrAuthParam, showPaymentComplete]);

  // Store loadOrderData in ref so it can be accessed by completeSplitPaymentFromTelr
  useEffect(() => {
    loadOrderDataRef.current = loadOrderData;
  }, [loadOrderData]);

  useEffect(() => {
    loadOrderData();
  }, [loadOrderData]);

  // Auto-refresh every 10s, even after the order is payable, so POS-side
  // changes (bill discount applied, items added/removed) show without a manual
  // refresh. Only fires while the tab is visible, so a backgrounded phone makes
  // no calls. /r/resolve allows 300 req/min per IP - 6/min here is well under.
  useEffect(() => {
    if (lines.length === 0 || loading) return;
    const tick = () => {
      if (document.visibilityState === "visible") loadOrderData();
    };
    const interval = setInterval(tick, 10000);
    return () => clearInterval(interval);
  }, [lines.length, loading, loadOrderData]);

  const totals = useMemo(
    () => {
      const seenKots = new Set();
      return lines.reduce(
        (a, x) => {
          a.sub += Number(x.Qty || 0) * Number(x.UnitPrice || 0);
          a.tax += Number(x.Tax1AmountC || 0);
          a.svc += Number(x.ServiceFee || 0);
          a.sum += Number(x.LineTotal || 0);
          // KotAmount (KOTMaster.Amount, already discounted) and BillDiscount are
          // master-level values repeated on every child line - count once per KOT.
          const kotId = x.kotMasterID ?? x.kotMasterId ?? x.KotMasterID;
          if (kotId != null && !seenKots.has(kotId)) {
            seenKots.add(kotId);
            a.kotAmount += Number(x.KotAmount || 0);
            a.discount += Number(x.BillDiscount || 0);
          }
          return a;
        },
        { sub: 0, tax: 0, svc: 0, sum: 0, kotAmount: 0, discount: 0 }
      );
    },
    [lines]
  );

  // A POS bill discount lives only on KOTMaster (pre-tax, on the subtotal) and
  // is already baked into KOTMaster.Amount. When present, the payable total is
  // that discounted Amount - NOT the sum of un-discounted line totals - and tax
  // = total − discounted subtotal. No discount → behaves exactly as before.
  const billHasDiscount = totals.discount > 0 && totals.kotAmount > 0;
  const billTotalAmount = billHasDiscount ? totals.kotAmount : totals.sum;
  const displayTax = billHasDiscount
    ? Math.max(0, billTotalAmount - (totals.sub - totals.discount))
    : totals.tax;

  // Calculate unpaid items totals (for item split payments)
  const unpaidTotals = useMemo(
    () => {
      if (paidKotChildIds.length === 0) {
        // No paid items, return full totals
        return totals;
      }
      
      return lines.reduce(
        (a, x) => {
          const kotChildId = x.KotChildID || x.kotChildID || x.kotChildId || null;
          const isPaid = kotChildId && paidKotChildIds.includes(Number(kotChildId));
          
          // Only include unpaid items in the calculation
          if (!isPaid) {
            a.sub += Number(x.Qty || 0) * Number(x.UnitPrice || 0);
            a.tax += Number(x.Tax1AmountC || 0);
            a.svc += Number(x.ServiceFee || 0);
            a.sum += Number(x.LineTotal || 0);
          }
          return a;
        },
        { sub: 0, tax: 0, svc: 0, sum: 0 }
      );
    },
    [lines, paidKotChildIds, totals]
  );

  const fullGrand = billTotalAmount + totals.svc;
  
  // Calculate unpaid grand total (for item split payments)
  const unpaidGrand = unpaidTotals.sum + unpaidTotals.svc;
  
  // Determine which amount to show:
  // 1. If there's a remainingBalance from custom/equal split, use that
  // 2. If there are paid items (item split in progress), use unpaid items total
  // 3. Otherwise, use full grand total
  const hasItemSplitInProgress = paidKotChildIds.length > 0;
  const hasEqualSplitInProgress = equalSplitInfo !== null && remainingBalance !== null && remainingBalance > 0;
  const grand = remainingBalance !== null
    ? remainingBalance
    : (hasItemSplitInProgress ? unpaidGrand : fullGrand);

  // Customer convenience/service fee — rate is company-controlled (qrmenu-dashboard)
  const serviceFee = grand * serviceFeeRate;

  // Round-off tip: brings bill+fee up to the next multiple of 5 AED
  // (93 → 95, 98 → 100; if already exactly on a multiple of 5, next one: 95 → 100)
  const baseDue = grand + serviceFee;
  const roundUpRemainder = Math.ceil(baseDue / 5) * 5 - baseDue;
  const roundUpTip = roundUpRemainder < 0.01 ? 5 : roundUpRemainder;

  // Tip (not subject to service fee)
  const tipAmount = tipPreset === "custom"
    ? Math.max(0, Number(customTip) || 0)
    : tipPreset === "roundup"
      ? roundUpTip
      : Number(tipPreset) || 0;

  const grandWithFee = baseDue + tipAmount;

  // Tiered message under pay buttons, based on displayed total (bill + fee, excl. tip)
  const tierMessage =
    baseDue >= 500
      ? { icon:null, text: "Premium Guests Pay the Premium Way.", premium: true }
      : baseDue >= 200
        ? { icon: null, text: "Skip the Wait. Pay Smart. Leave Happy.", premium: false }
        : { icon: null, text: "Your Table. Your Time. Your Way.", premium: false };


  if (loading) {
    return (
      <div className="min-h-screen bg-white grid place-items-center">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Loading bill details</p>
        </div>
      </div>
    );
  }

  if (!meta.ok && !navigatingAwayRef.current) {
    return (
      <div className="min-h-screen bg-white grid place-items-center p-6">
        <div className="text-center max-w-sm w-full">
          <div className="text-gray-400 text-5xl mb-4">⎋</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Invalid Access
          </h2>
          <p className="text-gray-600 mb-5">
            This table link is no longer valid. Please ask staff for assistance.
          </p>
          <button
            onClick={() => navigate("/")}
            className="btn w-full rounded-xl py-3"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <header
        className="border-b flex-shrink-0"
        style={{ borderColor: "var(--grad-end-soft)" }}
      >
        <div className="mx-auto max-w-md px-6 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-gray-500 uppercase tracking-[0.14em]">Order summary</div>
            <h1 className="text-[24px] leading-tight font-light text-gray-900 tracking-tight">
              Table #{meta.tableNo}
            </h1>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {lines.length} items{TELR_REDIRECT_ENABLED && (
                <> • {canPay ? "Ready for payment" : "Waiting for order acceptance"}</>
              )}
            </p>
          </div>
          <button
            onClick={() => navigate("/menu")}
            className="btn-pill-outline h-9 px-4"
          >
            Menu
          </button>
        </div>
      </header>

      {/* Items - Scrollable */}
      <section className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              Order Items
            </h2>
            <span className="text-[12px] text-gray-600">
              {lines.length} items
            </span>
          </div>

          {lines.length > 30 ? (
            <List
              rowCount={lines.length}
              rowHeight={80}
              rowComponent={({ index, style }) => (
                <div style={style} className="mb-2">
                  <ItemRow
                    item={lines[index]}
                    paidKotChildIds={paidKotChildIds}
                  />
                </div>
              )}
              rowProps={{ lines, paidKotChildIds }}
              style={{
                height: Math.min(450, Math.max(250, (typeof window !== "undefined" ? window.innerHeight - 400 : 400))),
                width: "100%",
              }}
            />
          ) : (
            <ul className="grid gap-2">
              {lines.map((item, index) => (
                <ItemRow
                  key={`${item.KotChildID || index}`}
                  item={item}
                  paidKotChildIds={paidKotChildIds}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Fixed bottom: Totals + Actions */}
      <div
        className="flex-shrink-0 bg-white/95 backdrop-blur-md border-t"
        style={{ borderColor: "var(--grad-end-soft)" }}
      >
        <div className="max-w-md mx-auto px-6 py-4">
          {/* Totals (clean, one block) */}
          <div className="text-center">
            <div className="text-[11px] text-gray-500 tracking-wide">
              {(remainingBalance !== null || hasItemSplitInProgress || hasEqualSplitInProgress) ? "REMAINING BALANCE" : "TOTAL AMOUNT"}
            </div>
            <div className="flex items-baseline justify-center gap-1.5 mt-0.5">
              <span className="text-[32px] font-light text-gray-900 leading-tight">
                {fmt(grandWithFee)}
              </span>
              <span className="text-[13px] text-gray-500">AED</span>
            </div>
            {billHasDiscount && (
              <div className="mt-0.5 text-[11px] text-green-600">
                Bill discount applied −{fmt(totals.discount)} AED
              </div>
            )}
            {tipAmount > 0 && (
              <div className="mt-0.5 text-[11px] text-gray-500">
                Includes {fmt(tipAmount)} AED tip
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div
                className="rounded-xl p-3 border"
                style={{ borderColor: "var(--grad-end-soft)" }}
              >
                <div className="text-[11px] text-gray-500 mb-1">Subtotal</div>
                <div className="text-sm font-semibold text-gray-900">
                  {fmt(totals.sub)}
                </div>
              </div>
              <div
                className="rounded-xl p-3 border"
                style={{ borderColor: "var(--grad-end-soft)" }}
              >
                <div className="text-[11px] text-gray-500 mb-1">Tax</div>
                <div className="text-sm font-semibold text-gray-900">
                  {fmt(displayTax)}
                </div>
              </div>
              <div
                className="rounded-xl p-3 border"
                style={{ borderColor: "var(--grad-end-soft)" }}
              >
                <div className="text-[11px] text-gray-500 mb-1">Service fee</div>
                <div className="text-sm font-semibold text-gray-900">
                  {fmt(serviceFee)}
                </div>
              </div>
            </div>
            {(remainingBalance !== null || hasItemSplitInProgress || hasEqualSplitInProgress) && (
              <div className="text-[10px] text-red-600 mt-1 font-medium space-y-0.5">
                <div>Total bill amount: {fmt(fullGrand)} AED</div>
                {(hasEqualSplitInProgress || (remainingBalance !== null && fullGrand != null && remainingBalance < fullGrand && !hasEqualSplitInProgress && !hasItemSplitInProgress)) && fullGrand > grand && (
                  <div>Already paid from bill: {fmt(fullGrand - grand)} AED</div>
                )}
              </div>
            )}
          </div>

          {/* Tip */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between mb-1.5 px-1">
              <span className="text-[11px] font-medium tracking-wide" style={{ color: "var(--text-primary)" }}>
                Add a tip
              </span>
              {tipAmount > 0 ? (
                <button
                  onClick={() => { setTipPreset(null); setCustomTip(""); }}
                  className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  Remove
                </button>
              ) : (
                <span className="text-[11px] text-gray-400">Optional</span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => setTipPreset(tipPreset === "roundup" ? null : "roundup")}
                aria-pressed={tipPreset === "roundup"}
                className={`h-9 rounded-xl text-[13px] transition-all duration-200 active:scale-[0.96] ${
                  tipPreset === "roundup"
                    ? "font-semibold text-white shadow-md border border-transparent"
                    : "font-medium text-gray-700 bg-white border shadow-sm hover:-translate-y-[1px] hover:shadow"
                }`}
                style={
                  tipPreset === "roundup"
                    ? { background: "linear-gradient(90deg, var(--grad-start), var(--grad-end))" }
                    : { borderColor: "rgba(139,111,71,0.3)" }
                }
              >
                <span className="block leading-tight">Quick tip</span>
                <span className={`block text-[10px] leading-tight ${tipPreset === "roundup" ? "text-white/70" : "text-gray-400"}`}>
                  +{fmt(roundUpTip)}
                </span>
              </button>
              {[5, 10].map((amt) => {
                const active = tipPreset === amt;
                return (
                  <button
                    key={amt}
                    onClick={() => setTipPreset(active ? null : amt)}
                    aria-pressed={active}
                    className={`h-9 rounded-xl text-[13px] transition-all duration-200 active:scale-[0.96] ${
                      active
                        ? "font-semibold text-white shadow-md border border-transparent"
                        : "font-medium text-gray-700 bg-white border shadow-sm hover:-translate-y-[1px] hover:shadow"
                    }`}
                    style={
                      active
                        ? { background: "linear-gradient(90deg, var(--grad-start), var(--grad-end))" }
                        : { borderColor: "rgba(139,111,71,0.3)" }
                    }
                  >
                    {amt}
                    <span className={`ml-1 text-[10px] ${active ? "text-white/70" : "text-gray-400"}`}>AED</span>
                  </button>
                );
              })}
              <button
                onClick={() => setTipPreset(tipPreset === "custom" ? null : "custom")}
                aria-pressed={tipPreset === "custom"}
                className={`h-9 rounded-xl text-[13px] transition-all duration-200 active:scale-[0.96] ${
                  tipPreset === "custom"
                    ? "font-semibold text-white shadow-md border border-transparent"
                    : "font-medium text-gray-700 bg-white border shadow-sm hover:-translate-y-[1px] hover:shadow"
                }`}
                style={
                  tipPreset === "custom"
                    ? { background: "linear-gradient(90deg, var(--grad-start), var(--grad-end))" }
                    : { borderColor: "rgba(139,111,71,0.3)" }
                }
              >
                Custom
              </button>
            </div>

            {tipPreset === "custom" && (
              <div
                className="mt-2 flex items-center rounded-xl border bg-white pl-4 pr-2 h-9 shadow-sm"
                style={{ borderColor: "rgba(139,111,71,0.3)" }}
              >
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  autoFocus
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  placeholder="Tip amount"
                  className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
                />
                <span
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-full shrink-0"
                  style={{ background: "var(--grad-start-soft)", color: "var(--text-primary)" }}
                >
                  AED
                </span>
              </div>
            )}
          </div>

          {/* Payment Status Banner - Show when order is not yet accepted */}
          {/* {!canPay && lines.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center">
                  {refreshing ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-white text-xs font-bold">!</span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-900">
                    Order pending acceptance
                  </p>
                  <p className="text-xs text-yellow-700 mt-0.5">
                    Your order is being processed. Payment will be enabled once the order is accepted by the kitchen.
                  </p>
                </div>
                <button
                  onClick={loadOrderData}
                  disabled={refreshing}
                  className="px-3 py-1.5 text-xs font-medium text-yellow-900 bg-yellow-100 rounded-lg hover:bg-yellow-200 disabled:opacity-50 transition"
                >
                  {refreshing ? "Checking..." : "Refresh"}
                </button>
              </div>
            </div>
          )} */}

          {/* Actions */}
          <div className="mt-4 flex gap-3">
            {showSplitBill && (
              <button
                onClick={() => setShowSplitOptions(true)}
                disabled={grand <= 0 || (!canPay && TELR_REDIRECT_ENABLED)}
                className="flex-1 btn-pill-outline h-12 disabled:opacity-50"
                title={!canPay && TELR_REDIRECT_ENABLED ? "Payment disabled - Order not yet accepted" : ""}
              >
                Split bill
              </button>
            )}
            {showPayFull && (
              <PayFullButton
                grandTotal={grand}
                tableId={meta.tableId}
                kotMasterID={kotMasterID}
                token={token}
                remainingBalance={remainingBalance}
                fullGrandTotal={fullGrand}
                paidKotChildIds={paidKotChildIds}
                lines={lines}
                equalSplitInfo={equalSplitInfo}
                disabled={grand <= 0 || (!canPay && TELR_REDIRECT_ENABLED)}
                className={`flex-1 btn-pill h-12 disabled:opacity-50 ${!showSplitBill ? 'w-full' : ''}`}
                onPaymentComplete={handlePaymentComplete}
                brand={meta.brand}
                serviceFeeAmount={serviceFee}
                tipAmount={tipAmount}
                onCardPay={handlePayFullRequest}
                onRefreshData={loadOrderData}
                showConfirm={showConfirm}
              />
            )}
          </div>

          <div className="mt-3 text-center">
            {(canPay || !TELR_REDIRECT_ENABLED) ? (
              <div
                className="text-[11px] tracking-[0.08em] uppercase"
                style={{ color: tierMessage.premium ? "#a8842e" : "var(--text-secondary)" }}
              >
                {tierMessage.icon && <span aria-hidden="true" className="mr-1 normal-case">{tierMessage.icon}</span>}
                {tierMessage.text}
              </div>
            ) : (
              <div className="text-[12px] text-gray-500">
                Please wait for your order to be accepted before making payment.
              </div>
            )}
          </div>
        </div>
        <div className="h-2 safe-bottom" />
      </div>

      {/* Sheets - Payment sheets hidden */}
      {showSplitOptions && (
        <SplitOptionsSheet
          variant="pill"
          onClose={() => setShowSplitOptions(false)}
          onEqual={
            !showSplitEqually
              ? undefined
              : equalLockReason
                ? equalLockReason
                : () => { setShowSplitOptions(false); setShowEqualSheet(true); }
          }
          onItems={
            !showSplitItems
              ? undefined
              : itemLockReason
                ? itemLockReason
                : () => { setShowSplitOptions(false); setShowPickItems(true); }
          }
          onCustom={
            !showCustomAmount
              ? undefined
              : customLockReason
                ? customLockReason
                : () => { setShowSplitOptions(false); setShowCustomSheet(true); }
          }
        />
      )}

      {/* Equal Split Modal - hidden when payment is already complete */}
      {showEqualSplitModal && equalSplitInfo && !showPaymentComplete && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full border" style={{ borderColor: "var(--grad-end-soft)" }}>
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Equal Split in Progress</h3>
                <button 
                  onClick={() => setShowEqualSplitModal(false)}
                  className="h-8 w-8 grid place-items-center rounded-full text-gray-500 hover:bg-gray-100"
                >
                  ×
                </button>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <div className="text-sm text-blue-900 font-medium mb-1">Current Split Status</div>
                <div className="text-xs text-blue-700 space-y-1">
                  <div>• {equalSplitInfo.numberOfPeople} people splitting</div>
                  <div>• {fmt(equalSplitInfo.amountPerPerson)} AED per person</div>
                  <div>• Remaining balance: {fmt(grand)} AED</div>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Would you like to continue with the equal split or choose another payment method?
              </p>
            </div>
            
            <div className="px-6 pb-6 space-y-2">
              <button
                onClick={() => {
                  setShowEqualSplitModal(false);
                  setShowEqualSheet(true);
                }}
                className="btn w-full h-12 rounded-xl"
              >
                Continue with Equal Split
              </button>
              
              <button
                onClick={() => {
                  setShowEqualSplitModal(false);
                  setShowSplitOptions(true);
                }}
                className="btn-pill-outline w-full h-12 rounded-xl text-sm"
              >
                Choose Another Method
              </button>
            </div>
          </div>
        </div>
      )}

      {showEqualSheet && (
        <SplitEqualSheet
          total={grand}
          currency="AED"
          equalSplitInfo={equalSplitInfo}
          serviceFeeRate={serviceFeeRate}
          onClose={() => setShowEqualSheet(false)}
          onConfirm={async (shares, tip = 0) => {
            try {
              if (!shares || shares.length === 0) {
                showToast("Please set up equal split with at least one person.", "warning");
                return;
              }

              // Calculate amount per person (use first share amount)
              const amountPerPerson = Number(shares[0]?.amount || 0);
              
              if (amountPerPerson <= 0) {
                showToast("Amount per person must be greater than 0.", "warning");
                return;
              }

              const numberOfPeople = shares.length;

              setShowEqualSheet(false);

              // Ensure we have valid values
              if (!kotMasterID) {
                showToast("KOT Master ID is missing. Please refresh the page and try again.", "error", "Error");
                return;
              }
              
              if (!fullGrand || fullGrand <= 0) {
                showToast("Bill amount is invalid. Please refresh the page and try again.", "error", "Error");
                return;
              }

              // For continuing equal split, use the original bill amount (fullGrand)
              // For new equal split, also use fullGrand
              const originalBillAmount = fullGrand; // Always use full grand total as original bill amount
              
              const paymentPayload = {
                billAmount: Number(originalBillAmount), // Full bill amount - ensure it's a number
                paidAmount: Number(amountPerPerson), // Equal share amount - ensure it's a number
                numberOfPeople: Number(numberOfPeople),
                tableId: meta.tableId ? Number(meta.tableId) : null,
                kotMasterID: kotMasterID ? Number(kotMasterID) : null
              };
              log("[EQUAL SPLIT] Step 1 - Payload built:", {
                kotMasterID,
                fullGrand,
                originalBillAmount,
                amountPerPerson,
                numberOfPeople,
                paymentPayload
              });
              startTelrSession({
                mode: "split-equal",
                amount: amountPerPerson,
                tipAmount: tip,
                tableId: meta.tableId,
                kotMasterID,
                token,
                brand: meta.brand,
                numberOfPeople,
                originalBillAmount,
                items: lines.map((it) => ({
                  name: it.ShortDescription || `Item #${it.ProductID}`,
                  qty: it.Qty,
                  unitPrice: it.UnitPrice,
                  total: it.LineTotal,
                })),
                splitPayload: { paymentPayload, amountPerPerson, numberOfPeople },
              });
            } catch (err) {
              logError("Equal split payment error:", err);
              const errorMsg = err?.response?.data?.error || err.message || "Payment failed. Please try again.";
              showToast(errorMsg, "error", "Payment Failed");
            }
          }}
        />
      )}

      {showPickItems && (
        <SplitPickItemsSheet
          items={lines}
          paidKotChildIds={paidKotChildIds}
          currency="AED"
          serviceFeeRate={serviceFeeRate}
          onClose={() => setShowPickItems(false)}
          onRemoveSplit={() => setShowPickItems(false)}
          onConfirm={async (payload, tip = 0) => {
            try {
              if (!payload || payload.length === 0) {
                showToast("Please select at least one item to pay for.", "warning");
                return;
              }

              // Calculate total amount for selected items
              const totalAmount = payload.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
              
              if (totalAmount <= 0) {
                showToast("Selected items total must be greater than 0.", "warning");
                return;
              }

              setShowPickItems(false);

              // Get total bill amount
              // CRITICAL: For item split, if there's already a payment in progress,
              // use the original bill amount from balance data (stored in first payment)
              // Otherwise, use the current fullGrand
              // This ensures we always use the ORIGINAL bill amount, not a recalculated one
              let totalBillAmount = fullGrand;
              
              // Fetch balance data to get original bill amount if payment is in progress
              try {
                const balanceData = await getBalance(meta.tableId, kotMasterID);
                if (balanceData?.originalBillAmount && balanceData.originalBillAmount > 0) {
                  totalBillAmount = balanceData.originalBillAmount;
                }
              } catch {
                // Fallback to fullGrand if balance fetch fails
              }

              const paymentPayload = {
                items: payload,
                tableId: meta.tableId,
                kotMasterID: kotMasterID,
                totalBillAmount: totalBillAmount // Pass original bill amount to backend
              };
              startTelrSession({
                mode: "split-items",
                amount: totalAmount,
                tipAmount: tip,
                tableId: meta.tableId,
                kotMasterID,
                token,
                brand: meta.brand,
                items: payload,
                originalBillAmount: totalBillAmount,
                splitPayload: { paymentPayload, totalAmount },
              });
            } catch (err) {
              logError("Item split payment error:", err);
              const errorMsg = err?.response?.data?.error || err.message || "Payment failed. Please try again.";
              showToast(errorMsg, "error", "Payment Failed");
            }
          }}
        />
      )}

      {showCustomSheet && (
        <SplitCustomAmountSheet
          total={grand}
          currency="AED"
          serviceFeeRate={serviceFeeRate}
          onClose={() => setShowCustomSheet(false)}
          onRemoveSplit={() => {
            setShowCustomSheet(false);
            setSplitTransId(null); // Reset TransID when removing split
          }}
          onConfirm={async (paidAmount, tip = 0) => {
            try {
              const paymentPayload = {
                billAmount: grand,
                paidAmount: paidAmount,
                kotMasterID: kotMasterID, // Use kotMasterID as TransID
                transId: splitTransId, // Fallback to existing TransID if kotMasterID not available
                tableId: meta.tableId
              };
              setShowCustomSheet(false);
              startTelrSession({
                mode: "split-custom",
                amount: paidAmount,
                tipAmount: tip,
                tableId: meta.tableId,
                kotMasterID,
                token,
                brand: meta.brand,
                originalBillAmount: grand,
                items: lines.map((it) => ({
                  name: it.ShortDescription || `Item #${it.ProductID}`,
                  qty: it.Qty,
                  unitPrice: it.UnitPrice,
                  total: it.LineTotal,
                })),
                splitPayload: { paymentPayload, paidAmount },
              });
            } catch (err) {
              logError("Custom split payment error:", err);
              const errorMsg = err?.response?.data?.error || err.message || "Payment failed. Please try again.";
              showToast(errorMsg, "error", "Payment Failed");
            }
          }}
        />
      )}

      {/* Confirm Modal - replaces window.confirm() */}
      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />

      {/* Toast - replaces alert() */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Shown while /telr/create is in flight and just before the redirect to Telr */}
      <PaymentProcessingOverlay show={isPaymentProcessing} />

      {/* Payment Complete Screen - Hidden */}
      <PaymentSuccess
        open={showPaymentComplete}
        onClose={() => {
          setShowPaymentComplete(false);
          setPaymentCompleteData(null);
        }}
        paymentData={paymentCompleteData}
      />

    </div>
  );
}
