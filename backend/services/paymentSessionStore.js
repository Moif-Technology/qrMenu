// backend/services/paymentSessionStore.js
//
// Durable, DB-backed twin of the in-memory session store (telrSessionStore.js).
// The in-memory Map is lost on process restart; if that happens between
// /api/telr/create and the customer's redirect/webhook, Telr may have already
// charged the card with nothing left server-side to recover it from. This
// table is the backstop, and claimAndSettle() is the single atomic path every
// caller (redirect handler, webhook, reconciliation script) goes through so
// two of them racing the same orderRef can never both write dbo.Payment.
import mssql from "mssql";
import { queryPaymentDb, connectToPaymentDb } from "../config/dbConfig.js";

const MAX_ITEM_SPLIT_LINES = 200;

function toNum(n, d = null) {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
}

/**
 * Insert the PENDING row right after Telr returns order.ref. Retried once on
 * failure (transient DB blip) before giving up - this table is the whole
 * point of the feature, so a single silent failure here would defeat it for
 * exactly the request most likely to need it. Never throws: caller proceeds
 * with checkout regardless (the in-memory session is still the fast path),
 * but logs at error level so a persistent failure is visible in server logs.
 */
export async function createPendingSession(session) {
  const {
    orderRef, sessionKey, shopId = 1, transId = null, tableId = null, token = null,
    mode = "pay-full", billAmount = null, amount, serviceFeeAmount = null, tipAmount = null,
    numberOfPeople = null, items = null, originalBillAmount = null,
  } = session;

  let itemsJson = null;
  if (Array.isArray(items) && items.length > 0) {
    const capped = items.length > MAX_ITEM_SPLIT_LINES ? items.slice(0, MAX_ITEM_SPLIT_LINES) : items;
    itemsJson = JSON.stringify(capped);
  }

  const params = {
    ShopID: shopId,
    OrderRef: String(orderRef).slice(0, 100),
    SessionKey: String(sessionKey).slice(0, 80),
    TransID: toNum(transId),
    TableID: toNum(tableId),
    Token: token ? String(token).slice(0, 100) : null,
    Mode: String(mode).slice(0, 30),
    BillAmount: toNum(billAmount),
    Amount: toNum(amount, 0),
    ServiceFeeAmount: toNum(serviceFeeAmount, 0),
    TipAmount: toNum(tipAmount, 0),
    NumberOfPeople: toNum(numberOfPeople),
    ItemsJson: itemsJson,
    OriginalBillAmount: toNum(originalBillAmount),
  };

  const sql = `
    INSERT INTO dbo.PaymentSession
      (ShopID, OrderRef, SessionKey, TransID, TableID, Token, Mode, BillAmount, Amount,
       ServiceFeeAmount, TipAmount, NumberOfPeople, ItemsJson, OriginalBillAmount, Status, CreatedAt, UpdatedAt)
    VALUES
      (@ShopID, @OrderRef, @SessionKey, @TransID, @TableID, @Token, @Mode, @BillAmount, @Amount,
       @ServiceFeeAmount, @TipAmount, @NumberOfPeople, @ItemsJson, @OriginalBillAmount, 'PENDING', GETDATE(), GETDATE())
  `;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await queryPaymentDb(sql, params);
      return true;
    } catch (err) {
      if (attempt === 2) {
        console.error("[PaymentSession] createPendingSession failed after retry - durable backstop missing for orderRef:", orderRef, err.message);
        return false;
      }
      console.warn("[PaymentSession] createPendingSession failed, retrying once:", err.message);
    }
  }
  return false;
}

/**
 * Atomically claim a session row for settlement. Single UPDATE statement -
 * SQL Server's row-level exclusive lock on the UPDATE is the actual mutex, so
 * two callers (redirect handler + webhook, or webhook + reconciliation) racing
 * the same orderRef serialize automatically. Returns the claimed row, or null
 * if 0 rows matched (already claimed by someone else, already terminal, or
 * the row doesn't exist e.g. process never got past /create).
 */
async function claimSession(orderRef, allowedStatuses = ["PENDING", "AUTHORISED"]) {
  const pool = await connectToPaymentDb();
  const req = pool.request();
  req.input("OrderRef", mssql.NVarChar(100), orderRef);
  const statusList = allowedStatuses.map((_, i) => `@s${i}`).join(",");
  allowedStatuses.forEach((s, i) => req.input(`s${i}`, mssql.VarChar(20), s));
  const rs = await req.query(`
    UPDATE dbo.PaymentSession
    SET Status = 'SETTLING', UpdatedAt = GETDATE()
    OUTPUT INSERTED.*
    WHERE OrderRef = @OrderRef AND Status IN (${statusList})
  `);
  return rs.recordset?.[0] || null;
}

async function releaseSessionBackToAuthorised(orderRef) {
  try {
    await queryPaymentDb(
      `UPDATE dbo.PaymentSession SET Status = 'AUTHORISED', UpdatedAt = GETDATE()
       WHERE OrderRef = @OrderRef AND Status = 'SETTLING'`,
      { OrderRef: orderRef }
    );
  } catch (err) {
    console.error("[PaymentSession] Failed to release claim back to AUTHORISED for orderRef:", orderRef, err.message);
  }
}

/** Best-effort DB status sync for the in-memory fast path - no atomicity
 * needed here since the in-process `session.processed` flag already governs
 * who's allowed to settle; this just keeps the durable row's Status accurate
 * for observability and so it doesn't linger PENDING/AUTHORISED forever.
 * Broader WHERE than markSettled() (any non-terminal state, not just
 * SETTLING) because the fast path never goes through claimSession(). */
export async function markSessionSettled(orderRef, paymentId) {
  try {
    await queryPaymentDb(
      `UPDATE dbo.PaymentSession SET Status = 'SETTLED', PaymentID = @PaymentID, UpdatedAt = GETDATE()
       WHERE OrderRef = @OrderRef AND Status IN ('PENDING', 'AUTHORISED', 'SETTLING')`,
      { OrderRef: orderRef, PaymentID: toNum(paymentId) }
    );
  } catch (err) {
    console.error("[PaymentSession] Failed to sync SETTLED (fast path) for orderRef:", orderRef, err.message);
  }
}

async function markSettled(orderRef, paymentId) {
  try {
    await queryPaymentDb(
      `UPDATE dbo.PaymentSession SET Status = 'SETTLED', PaymentID = @PaymentID, UpdatedAt = GETDATE()
       WHERE OrderRef = @OrderRef AND Status = 'SETTLING'`,
      { OrderRef: orderRef, PaymentID: toNum(paymentId) }
    );
  } catch (err) {
    console.error("[PaymentSession] Failed to mark SETTLED for orderRef:", orderRef, err.message);
  }
}

/** Rebuilds the exact shape settleSplitFromSession()/savePayFullPayment() expect from a claimed row. */
function sessionRowToSettlePayload(row) {
  let items = null;
  if (row.ItemsJson) {
    try { items = JSON.parse(row.ItemsJson); } catch { items = null; }
  }
  return {
    mode: row.Mode,
    billAmount: row.BillAmount ?? row.Amount,
    amount: row.Amount,
    serviceFeeAmount: row.ServiceFeeAmount ?? 0,
    tipAmount: row.TipAmount ?? 0,
    numberOfPeople: row.NumberOfPeople,
    items,
    originalBillAmount: row.OriginalBillAmount,
    tableId: row.TableID,
    kotMasterID: row.TransID,
  };
}

/**
 * The single settlement entry point for the DB-backed fallback path (used
 * when the in-memory session is gone - process restart, TTL expiry, etc).
 * Callers: telr.routes.js webhook handler, reconciliation script. (The
 * redirect handler keeps using the in-memory session directly when present -
 * this is specifically the "in-memory session is gone" recovery path.)
 *
 * settleFn: async (payload, telrRef) => { ok, result } - pass
 * settleSplitFromSession or an adapter around savePayFullPayment.
 *
 * Returns { ok:true, result } on settlement, { ok:false, reason } if already
 * claimed/terminal/missing, or { ok:false, error } if settlement itself failed
 * (claim is released back to AUTHORISED so a later attempt can retry).
 */
async function settleClaimedRow(orderRef, row, telrRef, settleFn) {
  try {
    const payload = sessionRowToSettlePayload(row);
    const settle = await settleFn(payload, telrRef);
    if (settle?.ok) {
      const paymentId = settle.result?.paymentId || settle.result?.PaymentID;
      await markSettled(orderRef, paymentId);
      return { ok: true, result: settle.result };
    }
    await releaseSessionBackToAuthorised(orderRef);
    return { ok: false, error: settle?.error || "settleFn returned not-ok" };
  } catch (err) {
    await releaseSessionBackToAuthorised(orderRef);
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function claimAndSettle(orderRef, telrRef, settleFn) {
  const row = await claimSession(orderRef);
  if (!row) {
    return { ok: false, reason: "already-claimed-or-missing" };
  }
  return settleClaimedRow(orderRef, row, telrRef, settleFn);
}

/**
 * Same atomic claim-then-settle as claimAndSettle(), but only for sessions
 * already marked AUTHORISED. Used to gate the public /api/payment/* endpoints,
 * whose caller is the customer's own browser and so can never be trusted to
 * assert on its own that Telr authorised a charge - the stored AUTHORISED
 * status (set only after the redirect/webhook handler independently re-checks
 * with Telr) is the sole proof accepted here. PENDING is deliberately excluded
 * (unlike claimAndSettle, whose callers have already re-verified with Telr
 * directly before calling it, so a not-yet-synced PENDING row is still safe
 * for them to settle).
 */
export async function claimAndSettlePublic(orderRef, telrRef, settleFn) {
  const row = await claimSession(orderRef, ["AUTHORISED"]);
  if (!row) {
    return { ok: false, reason: "no-authorised-session-for-orderref" };
  }
  return settleClaimedRow(orderRef, row, telrRef, settleFn);
}

/**
 * kotChildIDs currently claimed by another in-flight item-split checkout on
 * this KOT (Status PENDING/AUTHORISED/SETTLING) - checked at /api/telr/create
 * time so a second guest can't even start paying for an item someone else is
 * already mid-checkout on, closing the window that let two guests both reach
 * Telr and both get charged for the same item (root cause of the 2026-07-25
 * Table 15 incident). Fails open (returns []) on any DB error so a hiccup
 * here never blocks checkout - same tolerance as the rest of this file.
 */
export async function getClaimedItemIds(kotMasterID) {
  const transId = toNum(kotMasterID);
  if (!transId || transId <= 0) return [];
  try {
    const rows = await queryPaymentDb(
      `SELECT ItemsJson FROM dbo.PaymentSession
       WHERE TransID = @TransID AND Mode = 'split-items' AND Status IN ('PENDING', 'AUTHORISED', 'SETTLING')`,
      { TransID: transId }
    );
    const claimed = new Set();
    for (const row of rows) {
      if (!row.ItemsJson) continue;
      let items;
      try { items = JSON.parse(row.ItemsJson); } catch { continue; }
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        const id = toNum(it?.kotChildId ?? it?.kotChildID);
        if (id && id > 0) claimed.add(id);
      }
    }
    return Array.from(claimed);
  } catch (err) {
    console.error("[PaymentSession] getClaimedItemIds failed for kotMasterID:", kotMasterID, err.message);
    return [];
  }
}

/** Marks a session CANCELLED/DECLINED - mirrors recordFailedAttempt's terminal states. */
export async function markSessionFailed(orderRef, status) {
  if (!orderRef) return;
  try {
    await queryPaymentDb(
      `UPDATE dbo.PaymentSession SET Status = @Status, UpdatedAt = GETDATE()
       WHERE OrderRef = @OrderRef AND Status IN ('PENDING', 'AUTHORISED')`,
      { OrderRef: orderRef, Status: status === "CANCEL" ? "CANCELLED" : "DECLINED" }
    );
  } catch (err) {
    console.error("[PaymentSession] Failed to mark failed status for orderRef:", orderRef, err.message);
  }
}

/** Marks a session AUTHORISED (Telr confirmed the charge) - called before attempting settlement. */
export async function markSessionAuthorised(orderRef) {
  if (!orderRef) return;
  try {
    await queryPaymentDb(
      `UPDATE dbo.PaymentSession SET Status = 'AUTHORISED', UpdatedAt = GETDATE()
       WHERE OrderRef = @OrderRef AND Status = 'PENDING'`,
      { OrderRef: orderRef }
    );
  } catch (err) {
    console.error("[PaymentSession] Failed to mark AUTHORISED for orderRef:", orderRef, err.message);
  }
}

/**
 * Stale PENDING/AUTHORISED rows for the reconciliation script - sessions
 * older than olderThanMinutes that never reached a terminal state.
 */
export async function findStaleSessions(olderThanMinutes = 30) {
  return queryPaymentDb(
    `SELECT * FROM dbo.PaymentSession
     WHERE Status IN ('PENDING', 'AUTHORISED')
       AND CreatedAt < DATEADD(MINUTE, -@Minutes, GETDATE())
     ORDER BY CreatedAt ASC`,
    { Minutes: olderThanMinutes }
  );
}

/** Marks a stale session EXPIRED after reconciliation confirms Telr shows a terminal non-authorised state. */
export async function markSessionExpired(orderRef) {
  try {
    await queryPaymentDb(
      `UPDATE dbo.PaymentSession SET Status = 'EXPIRED', UpdatedAt = GETDATE()
       WHERE OrderRef = @OrderRef AND Status IN ('PENDING', 'AUTHORISED')`,
      { OrderRef: orderRef }
    );
  } catch (err) {
    console.error("[PaymentSession] Failed to mark EXPIRED for orderRef:", orderRef, err.message);
  }
}
