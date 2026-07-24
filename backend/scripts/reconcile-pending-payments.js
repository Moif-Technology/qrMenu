// backend/scripts/reconcile-pending-payments.js
//
// Finds dbo.PaymentSession rows stuck PENDING/AUTHORISED for longer than a
// genuine Telr checkout should take, re-verifies each directly against Telr,
// and either settles them (through the same atomic claim used by the redirect
// handler and webhook, so this can never double-write dbo.Payment) or marks
// them EXPIRED with a matching dbo.PaymentAttempts row so they still surface
// on the payout dashboard like any other failed attempt.
//
// Run manually or on a schedule (cron / Windows Task Scheduler):
//   node backend/scripts/reconcile-pending-payments.js
import "dotenv/config";
import axios from "axios";
import { queryPaymentDb } from "../config/dbConfig.js";
import {
  savePayFullPayment,
  saveEqualSplitPayment,
  saveCustomSplitPayment,
  saveItemSplitPayment,
} from "../services/payment.service.js";
import { findStaleSessions, markSessionExpired, claimAndSettle } from "../services/paymentSessionStore.js";

const STALE_MINUTES = 30;

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
  if (!data?.order?.ref) throw new Error("Unexpected Telr response for " + orderRef);
  return data;
}

// Same mode dispatch as telr.routes.js's settleAnyModeFromPayload / settleSplitFromSession,
// duplicated here (not imported) to keep this script runnable standalone without
// pulling in the whole telr.routes.js router (which registers Express routes on import).
async function settleAnyModeFromPayload(payload, telrRef) {
  const mode = payload?.mode || "pay-full";
  try {
    if (!mode || mode === "pay-full") {
      if (!(payload?.amount && (payload?.tableId || payload?.kotMasterID))) {
        return { ok: false, error: "Missing data for pay-full settlement" };
      }
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
      if (!(Array.isArray(payload.items) && payload.items.length > 0 && payload.kotMasterID)) {
        return { ok: false, error: "Missing items for item split settlement" };
      }
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
    return { ok: false, error: `Unknown split mode: ${mode}` };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function recordExpiredAttempt(row) {
  try {
    await queryPaymentDb(
      `INSERT INTO dbo.PaymentAttempts (ShopID, TransID, TableID, Amount, Mode, Status, OrderRef, CreatedAt)
       VALUES (@ShopID, @TransID, @TableID, @Amount, @Mode, 'CANCELLED', @OrderRef, GETDATE())`,
      {
        ShopID: row.ShopID,
        TransID: row.TransID,
        TableID: row.TableID,
        Amount: row.Amount,
        Mode: row.Mode,
        OrderRef: row.OrderRef,
      }
    );
  } catch (err) {
    console.error("[Reconcile] Failed to record PaymentAttempts row for expired session:", row.OrderRef, err.message);
  }
}

async function reconcileOne(row) {
  console.log(`[Reconcile] Checking orderRef=${row.OrderRef} mode=${row.Mode} status=${row.Status} createdAt=${row.CreatedAt}`);
  let telrData;
  try {
    telrData = await telrCheck(row.OrderRef);
  } catch (err) {
    console.error(`[Reconcile] telrCheck failed for ${row.OrderRef}, leaving for next run:`, err.message);
    return;
  }

  const transactionStatus = telrData?.transaction?.status?.code;
  const orderStatusCode = Number(telrData?.order?.status?.code);
  const authorised = transactionStatus === "A" || orderStatusCode === 3;
  // Telr order status codes: 2 = pending/awaiting checkout completion (NOT
  // terminal - customer may still be mid 3-D-Secure/OTP). Only treat as
  // terminal-failed when Telr shows an explicit non-authorised terminal code.
  const stillInProgress = orderStatusCode === 2;

  if (authorised) {
    const telrRef = {
      orderRef: row.OrderRef,
      tranRef: telrData?.transaction?.ref ?? null,
      authCode: telrData?.transaction?.auth ?? null,
    };
    const claimed = await claimAndSettle(row.OrderRef, telrRef, settleAnyModeFromPayload);
    if (claimed.ok) {
      console.log(`[Reconcile] Settled ${row.OrderRef} (was stuck ${row.Status}).`);
    } else {
      console.log(`[Reconcile] Claim did not settle ${row.OrderRef} (reason: ${claimed.reason || claimed.error}) - likely already settled concurrently, which is correct.`);
    }
    return;
  }

  if (stillInProgress) {
    console.log(`[Reconcile] ${row.OrderRef} still in progress at Telr (order status 2) - leaving for next run.`);
    return;
  }

  console.log(`[Reconcile] ${row.OrderRef} is terminal non-authorised at Telr - marking EXPIRED.`);
  await markSessionExpired(row.OrderRef);
  await recordExpiredAttempt(row);
}

async function main() {
  if (!sanitizedStoreId || !sanitizedAuthKey) {
    console.error("[Reconcile] Missing TELR_STORE_ID/TELR_AUTH_KEY - aborting.");
    process.exit(1);
  }

  const stale = await findStaleSessions(STALE_MINUTES);
  console.log(`[Reconcile] Found ${stale.length} stale session(s) older than ${STALE_MINUTES} minutes.`);

  for (const row of stale) {
    await reconcileOne(row);
  }

  console.log("[Reconcile] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[Reconcile] Fatal error:", err);
  process.exit(1);
});
