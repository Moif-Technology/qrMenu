// backend/scripts/settle-one.js
//
// One-off manual rescue for a single stuck PaymentSession row (Status
// PENDING/AUTHORISED that never reached SETTLED). Re-verifies with Telr
// before writing anything, then goes through the same atomic claimAndSettle()
// path used by the redirect handler, webhook, and reconcile-pending-payments.js
// - so this can never double-write dbo.Payment even if one of those fires at
// the same moment.
//
// Usage: node scripts/settle-one.js <orderRef>
import "dotenv/config";
import axios from "axios";
import {
  savePayFullPayment,
  saveEqualSplitPayment,
  saveCustomSplitPayment,
  saveItemSplitPayment,
} from "../services/payment.service.js";
import { claimAndSettle } from "../services/paymentSessionStore.js";

const TELR_ENDPOINT = "https://secure.telr.com/gateway/order.json";
const sanitizedStoreId = process.env.TELR_STORE_ID?.toString().trim();
const sanitizedAuthKey = process.env.TELR_AUTH_KEY?.toString().trim();
const isTestMode = ["1", "true"].includes((process.env.TELR_TEST_MODE ?? "").toString().trim().toLowerCase());

async function telrCheck(orderRef) {
  const form = new URLSearchParams({
    ivp_method: "check",
    ivp_store: sanitizedStoreId,
    ivp_authkey: sanitizedAuthKey,
    order_ref: String(orderRef),
  });
  if (isTestMode) form.set("ivp_test", "1");
  const { data } = await axios.post(TELR_ENDPOINT, form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!data?.order?.ref) throw new Error("Unexpected Telr response: " + JSON.stringify(data));
  return data;
}

async function settleAnyModeFromPayload(payload, telrRef) {
  const mode = payload?.mode || "pay-full";
  if (!mode || mode === "pay-full") {
    const result = await savePayFullPayment({
      billAmount: payload.billAmount ?? payload.amount,
      tableId: payload.tableId,
      kotMasterID: payload.kotMasterID,
      serviceFeeAmount: payload.serviceFeeAmount,
      tipAmount: payload.tipAmount,
      ...telrRef,
    });
    return { ok: true, result };
  }
  if (mode === "split-equal") {
    const fullBillAmount = payload.originalBillAmount ?? payload.billAmount ?? payload.amount;
    const result = await saveEqualSplitPayment({
      billAmount: fullBillAmount,
      paidAmount: payload.billAmount ?? payload.amount,
      numberOfPeople: payload.numberOfPeople,
      kotMasterID: payload.kotMasterID,
      tableId: payload.tableId,
      serviceFeeAmount: payload.serviceFeeAmount,
      tipAmount: payload.tipAmount,
      ...telrRef,
    });
    return { ok: true, result };
  }
  if (mode === "split-custom") {
    const fullBillAmount = payload.originalBillAmount ?? payload.billAmount ?? payload.amount;
    const result = await saveCustomSplitPayment({
      billAmount: fullBillAmount,
      paidAmount: payload.billAmount ?? payload.amount,
      kotMasterID: payload.kotMasterID,
      tableId: payload.tableId,
      serviceFeeAmount: payload.serviceFeeAmount,
      tipAmount: payload.tipAmount,
      ...telrRef,
    });
    return { ok: true, result };
  }
  if (mode === "split-items") {
    const result = await saveItemSplitPayment({
      items: payload.items,
      tableId: payload.tableId,
      kotMasterID: payload.kotMasterID,
      totalBillAmount: payload.originalBillAmount ?? payload.billAmount ?? payload.amount,
      serviceFeeAmount: payload.serviceFeeAmount,
      tipAmount: payload.tipAmount,
      ...telrRef,
    });
    return { ok: true, result };
  }
  return { ok: false, error: `Unknown mode: ${mode}` };
}

async function main() {
  const orderRef = process.argv[2];
  if (!orderRef) {
    console.error("Usage: node scripts/settle-one.js <orderRef>");
    process.exit(1);
  }
  if (!sanitizedStoreId || !sanitizedAuthKey) {
    console.error("Missing TELR_STORE_ID/TELR_AUTH_KEY");
    process.exit(1);
  }

  console.log("[SettleOne] Checking Telr for orderRef:", orderRef);
  const telrData = await telrCheck(orderRef);
  const transactionStatus = telrData?.transaction?.status?.code;
  const orderStatusCode = Number(telrData?.order?.status?.code);
  const authorised = transactionStatus === "A" || orderStatusCode === 3;
  console.log("[SettleOne] Telr response:", JSON.stringify(telrData, null, 2));

  if (!authorised) {
    console.error("[SettleOne] Telr does NOT show this as authorised. Aborting - not settling.");
    process.exit(1);
  }

  const telrRef = {
    orderRef,
    tranRef: telrData?.transaction?.ref ?? null,
    authCode: telrData?.transaction?.auth ?? null,
  };

  const claimed = await claimAndSettle(orderRef, telrRef, settleAnyModeFromPayload);
  console.log("[SettleOne] Result:", JSON.stringify(claimed, null, 2));
  process.exit(claimed.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[SettleOne] Fatal error:", err);
  process.exit(1);
});
