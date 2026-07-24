// backend/scripts/reconcile-stuck-settlements.js
//
// settleKotToSales() (services/settlement.service.js) is fired-and-forgotten
// from updateKotMasterQrPayment() the instant a KOT's QR payment reaches
// PAID: it posts SalesMaster/SalesChild and deletes the KOTMaster row, which
// is what makes the table show free again. Because it isn't awaited by the
// request and isn't backed by a durable queue, a backend restart/crash
// between "payment committed" and "settlement finished" silently drops it -
// the KOTMaster row survives with QrPaymentStatus='PAID' forever, the table
// stays stuck "Occupied", and no sale is ever posted. (This is exactly what
// happened to table 38 / kotMasterID 18622 on 2026-07-24.)
//
// Detection is unambiguous: settleKotToSales ALWAYS deletes the KOTMaster
// row the moment it succeeds, so any row with QrPaymentStatus='PAID' still
// present is proof settlement didn't finish - not a guess.
//
// Before trusting that flag, this script independently re-checks the real
// payment data in PaymentGateway.dbo.Payment (source of truth) and only
// settles when that agrees the bill-share is fully paid. If the flag and
// the real payment rows disagree, it does NOT touch the KOT - it just logs
// a mismatch for a human to look at, since silently posting a sale for an
// order that isn't actually fully paid would be a real money bug.
//
// Run manually or on a schedule (cron / Windows Task Scheduler):
//   node backend/scripts/reconcile-stuck-settlements.js
import "dotenv/config";
import { connectToDb, queryPaymentDb } from "../config/dbConfig.js";
import { settleKotToSales } from "../services/settlement.service.js";

const T_PAYMENT = "dbo.Payment";
const q = (n) => `[${n}]`;

// Skip anything modified too recently - a genuine in-flight settlement (the
// normal fire-and-forget call that just hasn't finished yet) can still be
// running. settleKotToSales has no locking of its own, so racing it here
// with a live in-flight call could insert the sale twice.
const MIN_STALE_MINUTES = 5;

function r2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function findStuckKots() {
  const pool = await connectToDb();
  const rs = await pool.request().query(`
    SELECT kotMasterID, TableID, Amount, QrPaidAmount, ModOn
    FROM dbo.KOTMaster
    WHERE QrPaymentStatus = 'PAID'
      AND ModOn <= DATEADD(MINUTE, -${MIN_STALE_MINUTES}, GETDATE())
  `);
  return rs.recordset || [];
}

// Independently re-derives "is this bill actually fully paid" straight from
// PaymentGateway.dbo.Payment - the same source updateKotMasterQrPayment's
// caller computed paidStatus from - instead of trusting the KOTMaster flag.
async function verifyFullyPaid(kotMasterID, billAmount) {
  const rows = await queryPaymentDb(
    `
      SELECT SUM(${q("PaidAmount")}) AS TotalPaid,
             SUM(ISNULL(${q("ServiceFeeAmount")}, 0)) AS TotalFee,
             SUM(ISNULL(${q("TipAmount")}, 0)) AS TotalTip
      FROM ${T_PAYMENT}
      WHERE ${q("TransID")} = @TransID
    `,
    { TransID: kotMasterID }
  );
  const row = rows?.[0];
  if (!row || row.TotalPaid == null) {
    return { ok: false, reason: "No Payment rows found for this TransID" };
  }

  const billSharePaid = r2(Number(row.TotalPaid) - Number(row.TotalFee || 0) - Number(row.TotalTip || 0));
  const tipAmount = r2(Number(row.TotalTip || 0));

  if (billSharePaid + 0.01 < r2(billAmount)) {
    return {
      ok: false,
      reason: `Payment rows show only ${billSharePaid} paid toward a ${r2(billAmount)} bill`,
    };
  }

  return { ok: true, tipAmount };
}

async function reconcileOne(row) {
  const kotMasterID = Number(row.kotMasterID);
  console.log(`[ReconcileSettlements] Checking kotMasterID=${kotMasterID} TableID=${row.TableID} Amount=${row.Amount} ModOn=${row.ModOn}`);

  const verified = await verifyFullyPaid(kotMasterID, row.Amount);
  if (!verified.ok) {
    console.error(
      `[ReconcileSettlements] MISMATCH - kotMasterID=${kotMasterID} has QrPaymentStatus='PAID' but Payment rows disagree: ${verified.reason}. Leaving untouched for manual review.`
    );
    return;
  }

  try {
    const result = await settleKotToSales(kotMasterID, { tipAmount: verified.tipAmount });
    if (result?.alreadySettled) {
      console.log(`[ReconcileSettlements] kotMasterID=${kotMasterID} was already settled by the time we got to it - fine.`);
      return;
    }
    console.log(
      `[ReconcileSettlements] Settled stuck kotMasterID=${kotMasterID} -> SalesID=${result.salesID}, BillNo=${result.billNo}, items=${result.salesChildCount}`
    );

    await queryPaymentDb(`UPDATE ${T_PAYMENT} SET ${q("SalesID")} = @SalesID WHERE ${q("TransID")} = @TransID`, {
      SalesID: result.salesID,
      TransID: kotMasterID,
    });
    console.log(`[ReconcileSettlements] Stamped SalesID=${result.salesID} on Payment rows for TransID=${kotMasterID}`);
  } catch (err) {
    console.error(`[ReconcileSettlements] settleKotToSales failed for kotMasterID=${kotMasterID}:`, err.message);
  }
}

async function main() {
  const stuck = await findStuckKots();
  console.log(`[ReconcileSettlements] Found ${stuck.length} KOT(s) marked PAID but still open (older than ${MIN_STALE_MINUTES} min).`);

  for (const row of stuck) {
    await reconcileOne(row);
  }

  console.log("[ReconcileSettlements] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[ReconcileSettlements] Fatal error:", err);
  process.exit(1);
});
