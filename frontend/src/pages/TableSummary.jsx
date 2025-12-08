// src/pages/TableSummaryPremium.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import SplitCustomAmountSheet from "../component/SplitCustomAmountSheet";
import SplitEqualSheet from "../component/SplitEqualSheet";
import SplitOptionsSheet from "../component/SplitOptionSheet";
import SplitPickItemsSheet from "../component/SplitPickItemsSheet";
import PaymentSuccess from "../component/PaymentSuccess";
import { API } from "../lib/api";
import { useCart } from "../store/cartStore";
import { getPaymentMethods, processEqualSplit, processCustomSplit, processItemSplit, getPaidItems, getBalance, createTelrSession, checkTelrStatus } from "../services/payment.service";
import cardIcon from "../assets/payment/card.png";
import applePayIcon from "../assets/payment/apple-pay.png";
import samsungPayIcon from "../assets/payment/samsung-pay.png";
import googlePayIcon from "../assets/payment/google-pay.png";

const fmt = (n) => Number(n || 0).toFixed(2);

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
  onPaymentComplete,
  brand,
  paidKotChildIds = [],
  lines = [],
  equalSplitInfo = null,
  onCardPay,
}) {
  const [processing, setProcessing] = useState(false);
  
  // Check if there's a custom split in progress (remainingBalance exists and is less than full total)
  const hasCustomSplitInProgress = remainingBalance !== null && fullGrandTotal !== null && remainingBalance < fullGrandTotal;
  
  // Check if there's an item split in progress (some items are paid)
  const hasItemSplitInProgress = paidKotChildIds.length > 0;
  
  // Check if all items are paid (item split complete)
  const allItemsPaid = lines.length > 0 && lines.every(item => {
    const kotChildId = item.KotChildID || item.kotChildID || item.kotChildId || null;
    return kotChildId && paidKotChildIds.includes(Number(kotChildId));
  });
  
  // Check if there's an equal split in progress (remainingBalance exists and is less than full total)
  // Equal split is similar to custom split - both use remainingBalance
  const hasEqualSplitInProgress = remainingBalance !== null && fullGrandTotal !== null && remainingBalance < fullGrandTotal;
  
  const hasSplitInProgress = hasCustomSplitInProgress || hasEqualSplitInProgress || (hasItemSplitInProgress && !allItemsPaid);
  const buttonText = hasSplitInProgress ? "Pay remaining balance" : "Pay fully";

  const handlePayFull = async () => {
    if (processing || disabled || grandTotal <= 0) return;
    
    // If there's a custom split in progress, use custom split to pay the remaining balance
    if (hasCustomSplitInProgress) {
      const confirmed = window.confirm(
        `Confirm payment of ${fmt(grandTotal)} AED?\n\nThis will pay the remaining balance and complete the payment.`
      );
      if (!confirmed) return;
      
      try {
        setProcessing(true);
        console.log("[FRONTEND] PayFullButton - Paying remaining balance via custom split");
        const paymentPayload = {
          billAmount: grandTotal, // This is the remaining balance
          paidAmount: grandTotal, // Pay the full remaining amount
          kotMasterID: kotMasterID,
          tableId: tableId
        };
        console.log("[FRONTEND] Pay Remaining Balance - Sending payload:", paymentPayload);
        const result = await processCustomSplit(paymentPayload);
        
        if (result.ok) {
          // Check both uppercase and lowercase property names
          const balance = result.balanceAmount || result.BalanceAmount || 0;
          const paidStatus = result.paidStatus || result.PaidStatus || "PENDING";
          
          // If payment is complete (balance = 0), show payment complete screen
          if (balance <= 0 && paidStatus === "PAID") {
            if (onPaymentComplete) {
              onPaymentComplete({
                paymentId: result.paymentId,
                amountPaid: grandTotal,
                status: paidStatus
              });
            }
          } else {
            // Partial payment - show alert and reload
            const message = `✅ Payment Successful!\n\nPayment ID: ${result.paymentId}\nAmount Paid: ${fmt(grandTotal)} AED\nRemaining Balance: ${fmt(result.balanceAmount)} AED\nStatus: ${result.paidStatus}`;
            alert(message);
            window.location.reload();
          }
        } else {
          throw new Error(result.error || "Payment processing failed");
        }
      } catch (err) {
        console.error("Pay remaining balance error:", err);
        const errorMsg = err?.response?.data?.error || err.message || "Payment failed. Please try again.";
        alert(`❌ Payment Failed\n\n${errorMsg}`);
      } finally {
        setProcessing(false);
      }
    } else if (hasItemSplitInProgress && !allItemsPaid) {
      // Item split in progress - pay for all remaining unpaid items
      const confirmed = window.confirm(
        `Confirm payment of ${fmt(grandTotal)} AED?\n\nThis will pay for all remaining unpaid items and complete the payment.`
      );
      if (!confirmed) return;
      
      try {
        setProcessing(true);
        console.log("[FRONTEND] PayFullButton - Paying remaining items via item split");
        
        // Get all unpaid items
        const unpaidItems = lines
          .filter(item => {
            const kotChildId = item.KotChildID || item.kotChildID || item.kotChildId || null;
            return !kotChildId || !paidKotChildIds.includes(Number(kotChildId));
          })
          .map(item => ({
            kotChildId: item.KotChildID || item.kotChildID || item.kotChildId || null,
            productId: item.ProductID || null,
            qty: Number(item.Qty || 0),
            unitPrice: Number(item.UnitPrice || 0),
            tax: Number(item.Tax1AmountC || 0),
            service: Number(item.ServiceFee || 0),
            lineTotal: Number(item.LineTotal || 0),
            desc: item.ShortDescription || `Item #${item.ProductID}`,
            modifier: item.Modifier || null,
          }));
        
        if (unpaidItems.length === 0) {
          alert("All items are already paid.");
          setProcessing(false);
          return;
        }
        
        const paymentPayload = {
          items: unpaidItems,
          tableId: tableId,
          kotMasterID: kotMasterID,
          totalBillAmount: fullGrandTotal // Use full grand total as original bill amount
        };
        
        console.log("[FRONTEND] Pay Remaining Items - Sending payload:", paymentPayload);
        const result = await processItemSplit(paymentPayload);
        
        if (result.ok) {
          // Check both uppercase and lowercase property names
          const balance = result.balanceAmount || result.BalanceAmount || 0;
          const paidStatus = result.paidStatus || result.PaidStatus || "PENDING";
          
          // If payment is complete (balance = 0), show payment complete screen
          if (balance <= 0 && paidStatus === "PAID") {
            if (onPaymentComplete) {
              onPaymentComplete({
                paymentId: result.paymentId,
                amountPaid: result.PaidAmount || result.paidAmount || result.itemsPaid || grandTotal,
                status: paidStatus
              });
            }
          } else {
            // Partial payment - show alert and reload
            const message = `✅ Payment Successful!\n\nPayment ID: ${result.paymentId}\nAmount Paid: ${fmt(result.itemsPaid || grandTotal)} AED\nRemaining Balance: ${fmt(balance)} AED\nStatus: ${paidStatus}`;
            alert(message);
            window.location.reload();
          }
        } else {
          throw new Error(result.error || "Payment processing failed");
        }
      } catch (err) {
        console.error("Pay remaining items error:", err);
        const errorMsg = err?.response?.data?.error || err.message || "Payment failed. Please try again.";
        alert(`❌ Payment Failed\n\n${errorMsg}`);
      } finally {
        setProcessing(false);
      }
    } else {
      onCardPay?.({
        amount: Number(grandTotal),
        tableId,
        kotMasterID,
        token,
        brand,
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

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({
    ok: false,
    tableId: null,
    brand: "Restaurant",
  });
  const [lines, setLines] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [kotMasterID, setKotMasterID] = useState(null); // Store kotMasterID from order lines
  const [splitTransId, setSplitTransId] = useState(null); // Store TransID for split payments
  const [remainingBalance, setRemainingBalance] = useState(null); // Remaining balance from pending payments

  // sheets
  const [showSplitOptions, setShowSplitOptions] = useState(false);
  const [showEqualSheet, setShowEqualSheet] = useState(false);
  const [showPickItems, setShowPickItems] = useState(false);
  const [showCustomSheet, setShowCustomSheet] = useState(false);
  const [showEqualSplitModal, setShowEqualSplitModal] = useState(false);
  const [showPaymentComplete, setShowPaymentComplete] = useState(false);
  const [paymentCompleteData, setPaymentCompleteData] = useState(null);
  const [paidKotChildIds, setPaidKotChildIds] = useState([]); // Track which items are paid
  const [equalSplitInfo, setEqualSplitInfo] = useState(null); // Track equal split information
  const [telrReturnStatus, setTelrReturnStatus] = useState(null);
  const [searchParams] = useSearchParams();
  const isTelrAuthParam = searchParams.get("telrStatus") === "AUTH";
  const telrHandledKeyRef = useRef(null);
  const [showPaymentMethodsSheet, setShowPaymentMethodsSheet] = useState(false);
  const [paymentSheetData, setPaymentSheetData] = useState(null);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);

  const handlePaymentComplete = useCallback((data) => {
    setPaymentCompleteData(data);
    setShowPaymentComplete(true);
  }, []);

  const handleAlternativeMethod = useCallback((method) => {
    setShowPaymentMethodsSheet(false);
    setPaymentSheetData(null);
    alert(`${method} payment is coming soon. Please ask staff for assistance.`);
  }, []);

  const handlePayFullRequest = useCallback((payload) => {
    setPaymentSheetData({
      ...payload,
      mode: "pay-full",
      note: "Secured via Telr",
    });
    setShowPaymentMethodsSheet(true);
  }, []);

  const startTelrSession = useCallback(
    async (payload) => {
      if (!payload) return;

      const {
        amount,
        tableId,
        kotMasterID,
        token: payloadToken,
        brand: payloadBrand,
        mode = "pay-full",
        splitPayload = null,
      } = payload;

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
          currency: "AED",
          cartId,
          description,
          tableId,
          kotMasterID,
          token: payloadToken,
          customer: {},
        };

        console.log("[FRONTEND] Telr - creating session with payload:", telrPayload);
        const session = await createTelrSession(telrPayload);
        console.log("[FRONTEND] Telr - session response:", session);

        if (!session?.url || !session?.orderRef) {
          throw new Error("Invalid Telr session response");
        }

        sessionStorage.setItem(
          "telr:lastSession",
          JSON.stringify({
            orderRef: session.orderRef,
            amount: Number(amount),
            tableId,
            kotMasterID,
            token: payloadToken,
            mode,
            splitPayload,
            createdAt: Date.now(),
          }),
        );

        window.location.href = session.url;
      } catch (err) {
        console.error("Telr session error:", err);
        const errorMsg = err?.response?.data?.error || err?.message || "Payment failed. Please try again.";
        alert(`❌ Payment Failed\n\n${errorMsg}`);
      } finally {
        setIsPaymentProcessing(false);
        setShowPaymentMethodsSheet(false);
        setPaymentSheetData(null);
      }
    },
    [],
  );

  const completeSplitPaymentFromTelr = useCallback(
    async ({ mode, splitPayload, telrPaymentId, amountPaid }) => {
      if (!mode || !splitPayload) {
        console.warn("[FRONTEND] Missing split context for Telr completion", { mode, splitPayload });
        return false;
      }

      try {
        if (mode === "split-equal") {
          const { paymentPayload, amountPerPerson, numberOfPeople } = splitPayload;
          const result = await processEqualSplit(paymentPayload);

          if (!result.ok) {
            throw new Error(result.error || "Equal split payment processing failed");
          }

          const balance = result.balanceAmount || result.BalanceAmount || 0;
          const paidStatus = result.paidStatus || result.PaidStatus || "PENDING";
          const paidValue = result.PaidAmount || result.paidAmount || amountPerPerson || amountPaid;

          if (balance <= 0 && paidStatus === "PAID") {
            handlePaymentComplete({
              paymentId: telrPaymentId || result.paymentId,
              amountPaid: paidValue,
              status: paidStatus,
            });
          } else {
            const message = `✅ Payment Successful!\n\nPayment ID: ${result.paymentId}\nAmount Paid: ${fmt(paidValue)} AED\nRemaining Balance: ${fmt(balance)} AED\nStatus: ${paidStatus}\n\nOther people can continue with equal split (${fmt(amountPerPerson || paidValue)} AED each) or use another payment method.`;
            alert(message);
            setRemainingBalance(balance);
            if (numberOfPeople > 0) {
              setEqualSplitInfo({
                amountPerPerson: amountPerPerson || paidValue,
                numberOfPeople,
              });
            }
            window.location.reload();
          }
          return true;
        }

        if (mode === "split-items") {
          const { paymentPayload, totalAmount } = splitPayload;
          const result = await processItemSplit(paymentPayload);

          if (!result.ok) {
            throw new Error(result.error || "Item split payment processing failed");
          }

          const balance = result.BalanceAmount || result.balanceAmount || 0;
          const paidStatus = result.PaidStatus || result.paidStatus || "PENDING";
          const paidValue = result.PaidAmount || result.paidAmount || result.itemsPaid || totalAmount || amountPaid;

          if (balance <= 0 && paidStatus === "PAID") {
            handlePaymentComplete({
              paymentId: telrPaymentId || result.paymentId,
              amountPaid: paidValue,
              status: paidStatus,
            });
          } else {
            const message = `✅ Payment Successful!\n\nPayment ID: ${result.paymentId}\nAmount Paid: ${fmt(result.itemsPaid || paidValue)} AED\nRemaining Balance: ${fmt(balance)} AED\nStatus: ${paidStatus}\n\nOther users can continue paying for remaining items.`;
            alert(message);
            if (paymentPayload?.kotMasterID) {
              try {
                const paidItems = await getPaidItems(paymentPayload.kotMasterID);
                setPaidKotChildIds(paidItems);
              } catch (err) {
                console.error("Error refreshing paid items:", err);
              }
            }
            window.location.reload();
          }
          return true;
        }

        if (mode === "split-custom") {
          const { paymentPayload, paidAmount } = splitPayload;
          const result = await processCustomSplit(paymentPayload);

          if (!result.ok) {
            throw new Error(result.error || "Payment processing failed");
          }

          if (!splitTransId && result.transId) {
            setSplitTransId(result.transId);
          }

          const balance = result.balanceAmount || result.BalanceAmount || 0;
          const paidStatus = result.paidStatus || result.PaidStatus || "PENDING";
          const totalPaid = result.paidAmount || result.PaidAmount || result.billAmount || result.BillAmount || amountPaid || paidAmount;

          if (balance <= 0 && paidStatus === "PAID") {
            handlePaymentComplete({
              paymentId: telrPaymentId || result.paymentId,
              amountPaid: totalPaid,
              status: paidStatus,
              totalPaid,
              billAmount: result.originalBillAmount || result.billAmount || result.BillAmount,
            });
            setRemainingBalance(null);
            setSplitTransId(null);
          } else {
            const message = `✅ Payment Successful!\n\nPayment ID: ${result.paymentId}\nAmount Paid: ${fmt(paidAmount || amountPaid)} AED\nRemaining Balance: ${fmt(balance)} AED\nStatus: ${paidStatus}\n\nOther users can continue paying the remaining balance.`;
            alert(message);
            setRemainingBalance(balance);
            setSplitTransId(result.transId);
            window.location.reload();
          }
          return true;
        }

        console.warn("[FRONTEND] Unknown split mode for Telr completion:", mode);
        return false;
      } catch (err) {
        console.error("Split payment completion error:", err);
        const errorMsg = err?.response?.data?.error || err.message || "Payment failed. Please try again.";
        alert(`❌ Payment Failed\n\n${errorMsg}`);
        return false;
      }
    },
    [
      handlePaymentComplete,
      setEqualSplitInfo,
      setPaidKotChildIds,
      setRemainingBalance,
      setSplitTransId,
      splitTransId,
    ],
  );

  const triggerCardPay = useCallback(async () => {
    if (isPaymentProcessing || !paymentSheetData) return;

    const basePayload = {
      amount: paymentSheetData.amount,
      tableId: meta.tableId,
      kotMasterID,
      token,
      brand: meta.brand,
      mode: paymentSheetData.mode,
      splitPayload: paymentSheetData.mode === "pay-full" ? null : paymentSheetData.payload,
    };

    startTelrSession(basePayload);
  }, [isPaymentProcessing, kotMasterID, meta.brand, meta.tableId, paymentSheetData, startTelrSession, token]);

  useEffect(() => {
    const status = searchParams.get("telrStatus");
    const orderRef = searchParams.get("orderRef");
    const paymentIdParam = searchParams.get("paymentId");
    const sessionKeyParam = searchParams.get("sessionKey");

    console.log("[Telr] Return params detected:", {
      status,
      orderRef,
      paymentIdParam,
      sessionKeyParam,
    });

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
        console.log("[Telr] Auth already handled for session:", handledKeyCandidate);
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

          console.log("[Telr] Check response:", {
            transactionStatus,
            orderStatusCode,
            authorised,
            telrData,
          });

          if (!authorised) {
            alert("We could not confirm the payment yet. Please contact a staff member.");
            telrHandledKeyRef.current = null;
          } else {
            const amountPaid =
              stored?.amount ??
              Number(telrData?.order?.amount) ??
              Number(telrData?.order?.total);

            const paymentIdValue =
              paymentIdParam ||
              telrData?.order?.tranid ||
              telrData?.order?.trans_ref ||
              telrData?.transaction?.ref ||
              telrData?.order?.ref;

            const mode = stored?.mode || "pay-full";
            const splitPayload = stored?.splitPayload || null;

            if (mode && mode !== "pay-full") {
              await completeSplitPaymentFromTelr({
                mode,
                splitPayload,
                telrPaymentId: paymentIdValue,
                amountPaid: Number.isFinite(amountPaid) ? amountPaid : undefined,
              });
            } else {
              handlePaymentComplete({
                paymentId: paymentIdValue,
                amountPaid: Number.isFinite(amountPaid) ? amountPaid : undefined,
                billAmount: Number.isFinite(amountPaid) ? amountPaid : undefined,
                status: "PAID",
                telrOrderRef: orderRef || telrData?.order?.ref || stored?.orderRef,
              });
            }
            setTelrReturnStatus("AUTH");
          }
        } catch (err) {
          console.error("Telr callback handling failed:", err);
          alert("Payment authorised, but we could not verify the status. Please check with staff.");
          telrHandledKeyRef.current = null;
        } finally {
          setIsPaymentProcessing(false);
          setShowPaymentMethodsSheet(false);
          setPaymentSheetData(null);
          if (stored?.orderRef === orderRef) {
            sessionStorage.removeItem("telr:lastSession");
          }
          clearParams();
        }
      })();
    } else {
      sessionStorage.removeItem("telr:lastSession");

      if (status === "CANCEL") {
        alert("Payment was cancelled.");
      } else if (status === "DECLINED") {
        alert("Payment was declined. Please try again with a different card.");
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
        console.error("Failed to load payment methods:", err);
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

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data } = await API.post("/r/resolve", { token });
        console.log("Resolved data:", data);
        const tableId = data.tableId;
        const linesData = data.lines || [];
        
        // Store tableId and token in cart store for use in order submission and navigation
        if (tableId) {
          setTableId(tableId, data.area ?? null);
        }
        if (token) {
          setToken(token);
        }
        
        // If no orders exist, redirect to menu page
        // But allow users to navigate back to menu even if there are orders
        if (linesData.length === 0) {
          navigate("/");
          return;
        }
        // If there are orders, still allow navigation to menu via the "Menu" button
        
        // Extract kotMasterID from first line (all lines should have the same kotMasterID)
        // Check for different possible property names
        const firstLine = linesData.length > 0 ? linesData[0] : null;
        let kotMasterID = null;
        
        if (firstLine) {
          // Try different property name variations
          kotMasterID = firstLine.kotMasterID || firstLine.kotMasterId || firstLine.KotMasterID || firstLine.KotMasterId || null;
          console.log("[FRONTEND] First line item:", firstLine);
          console.log("[FRONTEND] Available properties:", Object.keys(firstLine));
          console.log("[FRONTEND] Extracted kotMasterID:", kotMasterID);
        }
        
        setMeta({
          ok: !!data.ok,
          tableId: tableId,
          brand: data.brand || "Restaurant",
        });
        setLines(linesData);
        setKotMasterID(kotMasterID);
        console.log("[FRONTEND] Final kotMasterID state:", kotMasterID);
        
        // Fetch remaining balance and check if table is fully paid
        // IMPORTANT: If there are unpaid KOTs (lines.length > 0), we should show the payment page
        // regardless of payment history, because there are new orders to pay
        if (tableId && kotMasterID) {
          try {
            // Pass kotMasterID to get balance for this specific KOT
            const balanceData = await getBalance(tableId, kotMasterID);
            
            console.log("[FRONTEND] Balance data:", balanceData);
            
            // Check if this specific kotMasterID is fully paid (PaidStatus = "PAID")
            // If paid, silently redirect to menu - this KOT is settled, next order will be new kotMasterID
            if (balanceData.isFullyPaid && balanceData.paidStatus === "PAID" && !isTelrAuthParam && telrReturnStatus !== "AUTH" && !showPaymentComplete) {
              // Silently redirect to menu for new customer/scan
              navigate("/");
              return;
            }
            
            // Only redirect if table is fully paid AND there are NO unpaid KOTs
            if (balanceData.isFullyPaid && !balanceData.hasUnpaidKots && linesData.length === 0 && !isTelrAuthParam && telrReturnStatus !== "AUTH" && !showPaymentComplete) {
              // Silently redirect to menu
              navigate("/");
              return;
            }
            
            // If there are unpaid KOTs, log it but continue showing the payment page
            if (balanceData.hasUnpaidKots) {
              console.log("[FRONTEND] Found unpaid KOTs, showing payment page for new orders");
            }
            
            // CRITICAL: Only show balance if it's > 0 (payment not complete)
            // When balance = 0, payment is complete - clear remainingBalance
            if (balanceData.balance > 0 && !balanceData.isFullyPaid) {
              // Payment is pending - show balance
              setRemainingBalance(balanceData.balance);
              setSplitTransId(balanceData.transId);
              // Set equal split info if available (only if balance > 0)
              if (balanceData.equalSplitInfo) {
                setEqualSplitInfo(balanceData.equalSplitInfo);
                // Show modal to ask user if they want to continue equal split
                setShowEqualSplitModal(true);
              }
            } else {
              // Payment is complete (balance = 0) - clear everything
              setRemainingBalance(null);
              setEqualSplitInfo(null);
              setSplitTransId(null);
            }
          } catch (err) {
            console.error("Error fetching balance:", err);
            setRemainingBalance(null);
          }
        }
        
        // Fetch paid items for item split (if kotMasterID exists)
        if (kotMasterID) {
          try {
            const paidItems = await getPaidItems(kotMasterID);
            setPaidKotChildIds(paidItems);
            console.log("[FRONTEND] Paid kotChildIDs:", paidItems);
          } catch (err) {
            console.error("Error fetching paid items:", err);
            setPaidKotChildIds([]);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [token, setTableId, navigate, telrReturnStatus, isTelrAuthParam, showPaymentComplete]);

  const totals = useMemo(
    () =>
      lines.reduce(
        (a, x) => {
          a.sub += Number(x.Qty || 0) * Number(x.UnitPrice || 0);
          a.tax += Number(x.Tax1AmountC || 0);
          a.svc += Number(x.ServiceFee || 0);
          a.sum += Number(x.LineTotal || 0);
          return a;
        },
        { sub: 0, tax: 0, svc: 0, sum: 0 }
      ),
    [lines]
  );

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

  const fullGrand = totals.sum + totals.svc;
  
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

  const cardButtonLabel = isPaymentProcessing
    ? paymentSheetData?.mode === "pay-full"
      ? "Launching Telr..."
      : "Processing..."
    : "Card";

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

  if (!meta.ok) {
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
        <div className="mx-auto max-w-md px-6 py-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[12px] text-gray-500">{meta.brand}</div>
              <div
                className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-medium"
                style={{
                  background: "var(--grad-start-soft)",
                  color: "var(--text-rose)",
                  borderColor: "var(--grad-end-soft)",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Active table
              </div>
            </div>
            <button
              onClick={() => navigate("/")}
              className="btn-pill-outline h-9 px-4"
            >
              Menu
            </button>
          </div>

          <div className="text-center">
            <div className="text-[11px] text-gray-500 tracking-[.18em] mb-1">
              TABLE
            </div>
            <h1 className="text-[40px] leading-none font-light text-gray-900 tracking-tight">
              #{meta.tableId}
            </h1>
            <p className="text-[13px] text-gray-600 mt-2">
              {lines.length} items • Ready for payment
            </p>
          </div>
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

          <ul className="grid gap-2">
            {lines.map((item, index) => (
              <ItemRow 
                key={`${item.KotChildID || index}`} 
                item={item} 
                paidKotChildIds={paidKotChildIds}
              />
            ))}
          </ul>
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
            <div className="text-[11px] text-gray-500 mb-1 tracking-wide">
              {(remainingBalance !== null || hasItemSplitInProgress || hasEqualSplitInProgress) ? "REMAINING BALANCE" : "TOTAL AMOUNT"}
            </div>
            <div className="text-[38px] font-light text-gray-900">
              {fmt(grand)}
            </div>
            <div className="text-[12px] text-gray-500">AED</div>
            {(remainingBalance !== null || hasItemSplitInProgress || hasEqualSplitInProgress) && (
              <div className="text-[10px] text-red-600 mt-1 font-medium">
                Total bill amount: {fmt(fullGrand)} AED
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
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
                  {fmt(totals.tax)}
                </div>
              </div>
              <div
                className="rounded-xl p-3 border"
                style={{ borderColor: "var(--grad-end-soft)" }}
              >
                <div className="text-[11px] text-gray-500 mb-1">Service</div>
                <div className="text-sm font-semibold text-gray-900">
                  {fmt(totals.svc)}
                </div>
              </div>
            </div>

          {/* Actions */}
          <div className="mt-4 flex gap-3">
            {showSplitBill && (
              <button
                onClick={() => setShowSplitOptions(true)}
                disabled={grand <= 0}
                className="flex-1 btn-pill-outline h-12 disabled:opacity-50"
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
                disabled={grand <= 0}
                className={`flex-1 btn-pill h-12 disabled:opacity-50 ${!showSplitBill ? 'w-full' : ''}`}
                onPaymentComplete={handlePaymentComplete}
                brand={meta.brand}
                onCardPay={handlePayFullRequest}
              />
            )}
          </div>

          <div className="mt-3 text-center text-[12px] text-gray-500">
            Pay your bill now in 10 seconds. No need to call the waiter!
          </div>
        </div>
        <div className="h-2 safe-bottom" />
      </div>

      {/* Sheets */}
      {showSplitOptions && (
        <SplitOptionsSheet
          variant="pill" // 'pill' | 'cards' | 'radio' | 'grid'
          onClose={() => setShowSplitOptions(false)}
          onEqual={showSplitEqually ? () => {
            setShowSplitOptions(false);
            setShowEqualSheet(true);
          } : undefined}
          onItems={showSplitItems ? () => {
            setShowSplitOptions(false);
            setShowPickItems(true);
          } : undefined}
          onCustom={showCustomAmount ? () => {
            setShowSplitOptions(false);
            setShowCustomSheet(true);
          } : undefined}
        />
      )}

      {/* Equal Split Modal - Shows when equal split is in progress */}
      {showEqualSplitModal && equalSplitInfo && (
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
          onClose={() => setShowEqualSheet(false)}
          onConfirm={async (shares) => {
            try {
              console.log("[FRONTEND] Equal Split Payment - Shares:", shares);
              
              if (!shares || shares.length === 0) {
                alert("Please set up equal split with at least one person.");
                return;
              }

              // Calculate amount per person (use first share amount)
              const amountPerPerson = Number(shares[0]?.amount || 0);
              
              if (amountPerPerson <= 0) {
                alert("Amount per person must be greater than 0.");
                return;
              }

              const numberOfPeople = shares.length;
              
              const confirmed = window.confirm(
                `Confirm payment of ${fmt(amountPerPerson)} AED?\n\nThis is your equal share (${numberOfPeople} people splitting the bill).\n\nOther people can continue with equal split or use another payment method.`
              );
              
              if (!confirmed) return;

              setShowEqualSheet(false);

              // Ensure we have valid values
              if (!kotMasterID) {
                alert("Error: KOT Master ID is missing. Please refresh the page and try again.");
                return;
              }
              
              if (!fullGrand || fullGrand <= 0) {
                alert("Error: Bill amount is invalid. Please refresh the page and try again.");
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

              console.log("[FRONTEND] Equal Split Payment - Sending payload:", paymentPayload);
              setPaymentSheetData({
                mode: "split-equal",
                amount: amountPerPerson,
                note: `Equal split · ${numberOfPeople} ${numberOfPeople === 1 ? "person" : "people"}`,
                payload: {
                  paymentPayload,
                  amountPerPerson,
                  numberOfPeople,
                },
              });
              setShowPaymentMethodsSheet(true);
            } catch (err) {
              console.error("Equal split payment error:", err);
              const errorMsg = err?.response?.data?.error || err.message || "Payment failed. Please try again.";
              alert(`❌ Payment Failed\n\n${errorMsg}`);
            }
          }}
        />
      )}

      {showPickItems && (
        <SplitPickItemsSheet
          items={lines}
          paidKotChildIds={paidKotChildIds}
          currency="AED"
          onClose={() => setShowPickItems(false)}
          onRemoveSplit={() => setShowPickItems(false)}
          onConfirm={async (payload) => {
            try {
              console.log("[FRONTEND] Item Split Payment - Selected items payload:", payload);
              
              if (!payload || payload.length === 0) {
                alert("Please select at least one item to pay for.");
                return;
              }

              // Calculate total amount for selected items
              const totalAmount = payload.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
              
              if (totalAmount <= 0) {
                alert("Selected items total must be greater than 0.");
                return;
              }

              const confirmed = window.confirm(
                `Confirm payment of ${fmt(totalAmount)} AED for selected items?\n\nThis will process the payment for the items you selected.`
              );
              
              if (!confirmed) return;

              setShowPickItems(false);

              // Get total bill amount (grand total including all items)
              const totalBillAmount = fullGrand; // Use the full grand total as bill amount

              const paymentPayload = {
                items: payload,
                tableId: meta.tableId,
                kotMasterID: kotMasterID,
                totalBillAmount: totalBillAmount // Pass total bill amount to backend
              };

              console.log("[FRONTEND] Item Split Payment - Sending payload:", paymentPayload);
              setPaymentSheetData({
                mode: "split-items",
                amount: totalAmount,
                note: "Selected items",
                payload: {
                  paymentPayload,
                  totalAmount,
                },
              });
              setShowPaymentMethodsSheet(true);
            } catch (err) {
              console.error("Item split payment error:", err);
              const errorMsg = err?.response?.data?.error || err.message || "Payment failed. Please try again.";
              alert(`❌ Payment Failed\n\n${errorMsg}`);
            }
          }}
        />
      )}

      {showCustomSheet && (
        <SplitCustomAmountSheet
          total={grand}
          currency="AED"
          onClose={() => setShowCustomSheet(false)}
          onRemoveSplit={() => {
            setShowCustomSheet(false);
            setSplitTransId(null); // Reset TransID when removing split
          }}
          onConfirm={async (paidAmount) => {
            try {
              const paymentPayload = {
                billAmount: grand,
                paidAmount: paidAmount,
                kotMasterID: kotMasterID, // Use kotMasterID as TransID
                transId: splitTransId, // Fallback to existing TransID if kotMasterID not available
                tableId: meta.tableId
              };
              console.log("[FRONTEND] Custom Split Payment - Sending payload:", paymentPayload);
              setPaymentSheetData({
                mode: "split-custom",
                amount: paidAmount,
                note: "Custom amount",
                payload: {
                  paymentPayload,
                  paidAmount,
                },
              });
              setShowCustomSheet(false);
              setShowPaymentMethodsSheet(true);
            } catch (err) {
              console.error("Custom split payment error:", err);
              const errorMsg = err?.response?.data?.error || err.message || "Payment failed. Please try again.";
              alert(`❌ Payment Failed\n\n${errorMsg}`);
            }
          }}
        />
      )}

      {/* Payment Complete Screen */}
      <PaymentSuccess
        open={showPaymentComplete}
        onClose={() => {
          setShowPaymentComplete(false);
          setPaymentCompleteData(null);
        }}
        paymentData={paymentCompleteData}
      />

      {showPaymentMethodsSheet && (
        <div className="payment-sheet-overlay" role="dialog" aria-modal="true">
          <button
            type="button"
            className="payment-sheet-backdrop"
            onClick={() => {
              if (!isPaymentProcessing) {
                setShowPaymentMethodsSheet(false);
                setPaymentSheetData(null);
              }
            }}
            aria-label="Close payment methods"
          />
          <div className="payment-sheet">
            <div className="payment-sheet__handle" />
            <div className="payment-sheet__header">
              <div>
                <p className="payment-sheet__title">Choose payment method</p>
                <p className="payment-sheet__caption">
                  Table {meta.tableId} · {String(meta?.brand ?? "Dining")}
                </p>
              </div>
              <button
                type="button"
                className="payment-sheet__close"
                onClick={() => {
                  if (!isPaymentProcessing) {
                    setShowPaymentMethodsSheet(false);
                    setPaymentSheetData(null);
                  }
                }}
                aria-label="Close payment methods"
              >
                ×
              </button>
            </div>

            <div className="payment-sheet__amount-row">
              <span className="payment-sheet__amount">
                {fmt(paymentSheetData?.amount ?? grand)}
              </span>
              <span className="payment-sheet__note">
                AED · {paymentSheetData?.note || "Secured via Telr"}
              </span>
            </div>

            <div className="payment-sheet__option-list">
              <button
                type="button"
                className="payment-sheet__option payment-sheet__option--primary"
                onClick={triggerCardPay}
                disabled={isPaymentProcessing}
              >
                <div className="payment-sheet__icon">
                  <img src={cardIcon} alt="Card payment" className="payment-sheet__icon-image" />
                </div>
                <div className="payment-sheet__copy">
                  <span className="payment-sheet__option-title">
                    {cardButtonLabel}
                  </span>
                  <span className="payment-sheet__option-desc">
                    Visa · Mastercard · AMEX
                  </span>
                </div>
                {isPaymentProcessing && <span className="payment-sheet__spinner" />}
              </button>

              <button
                type="button"
                className="payment-sheet__option"
                onClick={() => handleAlternativeMethod("Apple Pay")}
                disabled={isPaymentProcessing}
              >
                <div className="payment-sheet__icon">
                  <img src={applePayIcon} alt="Apple Pay" className="payment-sheet__icon-image" />
                </div>
                <div className="payment-sheet__copy">
                  <span className="payment-sheet__option-title">Apple Pay</span>
                  <span className="payment-sheet__option-desc">
                    Tap &amp; pay with Face ID
                  </span>
                </div>
                <span className="payment-sheet__tag">Soon</span>
              </button>

              <button
                type="button"
                className="payment-sheet__option"
                onClick={() => handleAlternativeMethod("Samsung Pay")}
                disabled={isPaymentProcessing}
              >
                <div className="payment-sheet__icon">
                  <img src={samsungPayIcon} alt="Samsung Pay" className="payment-sheet__icon-image" />
                </div>
                <div className="payment-sheet__copy">
                  <span className="payment-sheet__option-title">Samsung Pay</span>
                  <span className="payment-sheet__option-desc">
                    NFC tap on Galaxy devices
                  </span>
                </div>
                <span className="payment-sheet__tag">Soon</span>
              </button>

              <button
                type="button"
                className="payment-sheet__option"
                onClick={() => handleAlternativeMethod("Google Pay")}
                disabled={isPaymentProcessing}
              >
                <div className="payment-sheet__icon">
                  <img src={googlePayIcon} alt="Google Pay" className="payment-sheet__icon-image" />
                </div>
                <div className="payment-sheet__copy">
                  <span className="payment-sheet__option-title">Google Pay</span>
                  <span className="payment-sheet__option-desc">
                    Wallet &amp; tap on Android
                  </span>
                </div>
                <span className="payment-sheet__tag">Soon</span>
              </button>

              <button
                type="button"
                className="payment-sheet__option"
                onClick={() => handleAlternativeMethod("Pay at counter")}
                disabled={isPaymentProcessing}
              >
                <div className="payment-sheet__icon">🏷️</div>
                <div className="payment-sheet__copy">
                  <span className="payment-sheet__option-title">Pay at counter</span>
                  <span className="payment-sheet__option-desc">
                    Cash · Chip &amp; PIN available
                  </span>
                </div>
                <span className="payment-sheet__tag">Ask staff</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
