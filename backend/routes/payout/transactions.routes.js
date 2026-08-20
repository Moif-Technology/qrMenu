// backend/routes/payout/transactions.routes.js
// Transaction listing + summary. Company sees everything, restaurant users
// are hard-scoped to their own ShopID regardless of query params.
import express from "express";
import { query, mssql } from "../../utils/payoutDb.js";
import { requireAuth } from "../../middleware/payoutAuth.middleware.js";
import { parseWallClock } from "../../utils/payoutDates.js";

const router = express.Router();

const METHOD_NAMES = { 1: "Pay Full", 2: "Equal Split", 3: "Item Split", 4: "Custom Split" };

// Thrown for caller-supplied input the query cannot honour. The route handlers
// turn it into a 400 rather than letting it read as a server fault.
class BadRequest extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// Whitelisted sortable columns over the unioned result set (payments plus
// failed attempts); anything else falls back to the row id.
const SORT_COLUMNS = {
  id: "RowID",
  // Sorts the per-leg share, matching what the Bill paid column renders.
  // BillAmount is the whole-bill snapshot repeated on every leg of a split.
  bill: "PaidBillAmount",
  paid: "PaidAmount",
  date: "CreatedAt",
  restaurant: "RestaurantName"
};

function buildOrderClause(sortKey, dirRaw) {
  const col = SORT_COLUMNS[sortKey] || SORT_COLUMNS.id;
  const dir = String(dirRaw).toLowerCase() === "asc" ? "ASC" : "DESC";
  if (sortKey === "date") {
    // Legacy payments have NULL CreatedAt - keep them at the end either way.
    return `ORDER BY CASE WHEN CreatedAt IS NULL THEN 1 ELSE 0 END ASC, CreatedAt ${dir}, RowID ${dir}`;
  }
  if (col === SORT_COLUMNS.id) {
    // No tiebreaker: SQL Server rejects the same column twice in ORDER BY.
    return `ORDER BY RowID ${dir}`;
  }
  return `ORDER BY ${col} ${dir}, RowID DESC`;
}

const MODE_LABELS = {
  "pay-full": "Pay Full",
  "equal-split": "Equal Split",
  "item-split": "Item Split",
  "custom-split": "Custom Split"
};

function resolveShopScope(req) {
  // Restaurant users can only ever see their own shop.
  if (req.user.role === "restaurant") return req.user.shopId;
  // Super admin may filter by ?shopId= or see all.
  const q = req.query.shopId;
  return q !== undefined && q !== "" ? Number(q) : null;
}

/**
 * Builds and runs the unioned transactions query shared by the list and
 * export endpoints. Pass paginate: false to fetch every matching row
 * (capped at MAX_EXPORT_ROWS) instead of a page.
 */
const MAX_EXPORT_ROWS = 20000;
const MAX_PAGE_SIZE = 200;

async function queryTransactions(req, { paginate = true } = {}) {
    const shopId = resolveShopScope(req);
    const { status, payoutStatus, from, to, methodId, search, minAmount, maxAmount, batch, transferRef } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    // Silently clamping an over-sized pageSize is how a payout run once paid
    // 200 of a 250-transaction batch and reported success: the caller asked for
    // 500, got 200, and had no way to tell. A caller that needs every row must
    // page for it or use an endpoint that is set-based server-side.
    if (paginate && Number(req.query.pageSize) > MAX_PAGE_SIZE) {
      throw new BadRequest(`pageSize cannot exceed ${MAX_PAGE_SIZE}. Page through the results instead.`);
    }
    const pageSize = paginate
      ? Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || 50))
      : MAX_EXPORT_ROWS;

    const conditions = [];
    const attemptConds = [];
    const params = {};

    // Failed Telr attempts appear alongside payments, except when a filter
    // only makes sense for real payments (payout pipeline, PAID/PENDING).
    let includeAttempts = true;

    if (shopId != null && Number.isFinite(shopId)) {
      conditions.push("p.ShopID = @shopId");
      attemptConds.push("a.ShopID = @shopId");
      params.shopId = { type: mssql.BigInt, value: shopId };
    }
    if (status === "FAILED") {
      // Only the failed attempts branch should return rows.
      conditions.push("1 = 0");
    } else if (status === "PAID") {
      conditions.push("(p.PaidStatus = @status OR pss.Status = 'SETTLED')");
      params.status = { type: mssql.VarChar(50), value: String(status) };
      includeAttempts = false;
    } else if (status === "PENDING") {
      conditions.push("(p.PaidStatus = @status AND ISNULL(pss.Status, '') <> 'SETTLED')");
      params.status = { type: mssql.VarChar(50), value: String(status) };
      includeAttempts = false;
    } else if (status) {
      conditions.push("p.PaidStatus = @status");
      params.status = { type: mssql.VarChar(50), value: String(status) };
      includeAttempts = false;
    }
    if (methodId && Number.isFinite(Number(methodId))) {
      conditions.push("p.MethodID = @methodId");
      params.methodId = { type: mssql.BigInt, value: Number(methodId) };
      const mode = { 1: "pay-full", 2: "equal-split", 3: "item-split", 4: "custom-split" }[Number(methodId)];
      if (mode) {
        attemptConds.push("a.Mode = @attemptMode");
        params.attemptMode = { type: mssql.VarChar(30), value: mode };
      } else {
        includeAttempts = false;
      }
    }
    if (search && String(search).trim()) {
      // Match payment ID, KOT (TransID) or table number
      conditions.push("(CAST(p.PaymentID AS VARCHAR(30)) LIKE @search OR CAST(p.TransID AS VARCHAR(30)) LIKE @search OR CAST(tm.TableNO AS VARCHAR(30)) = @searchExact)");
      attemptConds.push("(CAST(a.TransID AS VARCHAR(30)) LIKE @search OR CAST(tm2.TableNO AS VARCHAR(30)) = @searchExact)");
      const term = String(search).trim();
      params.search = { type: mssql.VarChar(40), value: `%${term}%` };
      params.searchExact = { type: mssql.VarChar(30), value: term };
    }
    if (payoutStatus === "PENDING") {
      // Pending is implicit: no PayoutStatus row has been created yet.
      conditions.push("ps.PayoutID IS NULL");
      includeAttempts = false;
    } else if (payoutStatus === "PROCESSING" || payoutStatus === "SCHEDULED") {
      conditions.push("ps.Status = @payoutStatus");
      params.payoutStatus = { type: mssql.VarChar(20), value: payoutStatus };
      includeAttempts = false;
    } else if (payoutStatus === "TRANSFERRED") {
      conditions.push("ps.Status = 'TRANSFERRED'");
      includeAttempts = false;
    }
    if (batch !== undefined && batch !== "" && Number.isFinite(Number(batch))) {
      conditions.push("ps.BatchNo = @batch");
      params.batch = { type: mssql.BigInt, value: Number(batch) };
      includeAttempts = false;
    }
    // Narrows a batch to one settlement. A batch normally has exactly one
    // transfer reference (resolveBatchNo mints a fresh batch for any partial
    // selection), but if one were ever settled under two references, drilling
    // in from a payout-history row must show that row's transactions only.
    if (transferRef !== undefined && String(transferRef).trim() !== "") {
      conditions.push("ps.TransferRef = @transferRef");
      params.transferRef = { type: mssql.NVarChar(400), value: String(transferRef).trim() };
      includeAttempts = false;
    }
    // parseWallClock returns null for anything it cannot read (an ISO string
    // with milliseconds, a dd/mm/yyyy, a stray "Z"). Silently dropping the
    // predicate would answer an all-time query under a date-range heading, so
    // a malformed boundary is rejected instead.
    const fromDate = from ? parseWallClock(from) : null;
    if (from && !fromDate) throw new BadRequest("Invalid 'from' date. Use YYYY-MM-DD or YYYY-MM-DDTHH:mm.");
    if (fromDate) {
      conditions.push("p.CreatedAt >= @from");
      attemptConds.push("a.CreatedAt >= @from");
      params.from = { type: mssql.DateTime2, value: fromDate };
    }
    // Date-only value means "inclusive end of that day"; an explicit
    // time (e.g. 2026-07-12T14:30) is respected as given.
    const toDate = to ? parseWallClock(to, { endOfDay: true }) : null;
    if (to && !toDate) throw new BadRequest("Invalid 'to' date. Use YYYY-MM-DD or YYYY-MM-DDTHH:mm.");
    if (toDate) {
      conditions.push("p.CreatedAt <= @to");
      attemptConds.push("a.CreatedAt <= @to");
      params.to = { type: mssql.DateTime2, value: toDate };
    }
    // Amount range filters on the paid amount (attempts use the attempted amount).
    if (minAmount !== undefined && minAmount !== "" && Number.isFinite(Number(minAmount))) {
      conditions.push("p.PaidAmount >= @minAmount");
      attemptConds.push("a.Amount >= @minAmount");
      params.minAmount = { type: mssql.Money, value: Number(minAmount) };
    }
    if (maxAmount !== undefined && maxAmount !== "" && Number.isFinite(Number(maxAmount))) {
      conditions.push("p.PaidAmount <= @maxAmount");
      attemptConds.push("a.Amount <= @maxAmount");
      params.maxAmount = { type: mssql.Money, value: Number(maxAmount) };
    }

    if (!includeAttempts) attemptConds.push("1 = 0");

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const attemptWhere = attemptConds.length ? `WHERE ${attemptConds.join(" AND ")}` : "";
    params.offset = { type: mssql.Int, value: paginate ? (page - 1) * pageSize : 0 };
    params.pageSize = { type: mssql.Int, value: pageSize };

    const rows = await query(
      `
      WITH txns AS (
        SELECT
          p.PaymentID              AS RowID,
          'P'                      AS Kind,
          p.ShopID, p.TransID, p.MethodID,
          CAST(NULL AS VARCHAR(30)) AS ModeName,
          p.BillAmount, p.PaidAmount, ISNULL(p.PaidBillAmount, 0) AS PaidBillAmount,
          p.BalanceAmount, p.PaidStatus,
          pss.Status AS TelrStatus,
          pss.Mode AS TelrMode,
          p.TableID, tm.TableNO AS TableNo, p.CreatedAt,
          sm.BillNo AS BillNo,
          p.OrderRef AS OrderRef,
          CASE
            WHEN sm.SalesID IS NULL THEN 'OPEN_IN_POS'
            WHEN CAST(ISNULL(sm.PaidAmount, 0) AS DECIMAL(18,4)) >= CAST(ISNULL(sm.Amount, 0) AS DECIMAL(18,4)) THEN 'CLOSED_IN_POS'
            ELSE 'PARTIAL_IN_POS'
          END AS PosBillStatus,
          rm.Name  AS RestaurantName,
          rm.Slug  AS RestaurantSlug,
          ps.PayoutID, ps.Status AS PayoutStatus, ps.Amount AS PayoutAmount,
          ps.TransferRef, ps.TransferDate, ps.TransferredBy, ps.Notes AS PayoutNotes,
          ps.BatchNo, ps.ScheduledDate,
          ISNULL(p.ServiceFeeAmount, 0) AS ServiceFeeAmount,
          ISNULL(p.TipAmount, 0)        AS TipAmount,
          ISNULL(p.PlatformFeeAmount, 0) AS PlatformFeeAmount,
          -- PaidAmount is the REAL total charged per leg (bill-share + fee +
          -- tip). Tip belongs to the restaurant (kept in), only DeynoQR's own
          -- service fee and the flat platform fee come out.
          (p.PaidAmount - ISNULL(p.ServiceFeeAmount,0)) AS RestaurantGrossAmount,
          (p.PaidAmount - ISNULL(p.ServiceFeeAmount,0) - ISNULL(p.PlatformFeeAmount,0)) AS RestaurantPayoutAmount,
          p.TranRef, p.AuthCode,
          -- Split position counted over EVERY leg of the order, not just the legs
          -- that survived the date/status filters. A window function here would
          -- see the filtered set only, so a split straddling the range boundary
          -- would report "1 of 2" for what is really leg 3 of 5.
          (SELECT COUNT(*) FROM dbo.Payment lc
             WHERE lc.TransID = p.TransID AND lc.ShopID = p.ShopID) AS OrderLegCount,
          (SELECT COUNT(*) FROM dbo.Payment li
             WHERE li.TransID = p.TransID AND li.ShopID = p.ShopID
               AND li.PaymentID <= p.PaymentID)                     AS OrderLegIndex
        FROM dbo.Payment p
        LEFT JOIN dbo.PayoutStatus    ps ON ps.PaymentID = p.PaymentID
        LEFT JOIN dbo.RestaurantMaster rm ON rm.RestaurantID = p.ShopID
        LEFT JOIN dbo.PaymentSession pss ON pss.OrderRef = p.OrderRef
        LEFT JOIN Moifcore.dbo.TableMaster tm ON tm.TableID = p.TableID
        LEFT JOIN Moifcore.dbo.SalesMaster sm ON sm.SalesID = p.SalesID
        ${whereClause}

        UNION ALL

        SELECT
          -a.AttemptID             AS RowID,
          'A'                      AS Kind,
          a.ShopID, a.TransID,
          CAST(NULL AS BIGINT)     AS MethodID,
          a.Mode                   AS ModeName,
          a.Amount                 AS BillAmount,
          CAST(0 AS MONEY)         AS PaidAmount,
          CAST(0 AS MONEY)         AS PaidBillAmount,
          a.Amount                 AS BalanceAmount,
          a.Status                 AS PaidStatus,
          a.Status                 AS TelrStatus,
          a.Mode                   AS TelrMode,
          a.TableID, tm2.TableNO AS TableNo, a.CreatedAt,
          CAST(NULL AS NUMERIC(18,0)) AS BillNo,
          a.OrderRef,
          CAST('OPEN_IN_POS' AS VARCHAR(20)) AS PosBillStatus,
          rm.Name  AS RestaurantName,
          rm.Slug  AS RestaurantSlug,
          NULL, NULL, NULL, NULL, NULL, NULL, NULL,
          CAST(NULL AS BIGINT) AS BatchNo, CAST(NULL AS DATE) AS ScheduledDate,
          CAST(0 AS MONEY) AS ServiceFeeAmount,
          CAST(0 AS MONEY) AS TipAmount,
          CAST(0 AS MONEY) AS PlatformFeeAmount,
          CAST(0 AS MONEY) AS RestaurantGrossAmount,
          CAST(0 AS MONEY) AS RestaurantPayoutAmount,
          -- PaymentAttempts never reached Telr authorisation, so it carries no
          -- reference and belongs to no split group. Typed NULLs keep the UNION
          -- column shape aligned with the payments branch above.
          CAST(NULL AS NVARCHAR(100)) AS TranRef,
          CAST(NULL AS NVARCHAR(50))  AS AuthCode,
          CAST(0 AS INT) AS OrderLegCount,
          CAST(0 AS INT) AS OrderLegIndex
        FROM dbo.PaymentAttempts a
        LEFT JOIN dbo.RestaurantMaster rm ON rm.RestaurantID = a.ShopID
        LEFT JOIN Moifcore.dbo.TableMaster tm2 ON tm2.TableID = a.TableID
        ${attemptWhere}
      )
      SELECT *, COUNT(*) OVER () AS TotalRows
      FROM txns
      ${buildOrderClause(req.query.sort, req.query.dir)}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `,
      params
    );

    const total = rows.length ? Number(rows[0].TotalRows) : 0;
    // Telr's transaction reference and acquirer auth code identify a charge on
    // the shared DeynoQR merchant account. Restaurant users have no UI for them
    // and no reason to receive them, so they never leave the mapper for that role.
    const exposeTelrRefs = req.user.role === "superadmin";
    const transactions = rows.map((r) => {
      const failed = r.Kind === "A";
      const legCount = Number(r.OrderLegCount || 0);
      return {
        paymentId: Number(r.RowID),
        failed,
        shopId: Number(r.ShopID),
        restaurantName: r.RestaurantName || `Shop ${r.ShopID}`,
        restaurantSlug: r.RestaurantSlug || null,
        kotMasterId: r.TransID != null ? Number(r.TransID) : null,
        billNo: r.BillNo != null ? Number(r.BillNo) : null,
        methodId: r.MethodID != null ? Number(r.MethodID) : null,
        methodName: failed
          ? MODE_LABELS[r.ModeName] || "Telr"
          : METHOD_NAMES[Number(r.MethodID)] || `Method ${r.MethodID}`,
        billAmount: Number(r.BillAmount),
        paidAmount: Number(r.PaidAmount),
        paidBillAmount: failed ? null : Number(r.PaidBillAmount),
        balanceAmount: Number(r.BalanceAmount),
        serviceFeeAmount: failed ? null : Number(r.ServiceFeeAmount),
        tipAmount: failed ? null : Number(r.TipAmount),
        platformFeeAmount: failed ? null : Number(r.PlatformFeeAmount),
        restaurantGrossAmount: failed ? null : Number(r.RestaurantGrossAmount),
        restaurantPayoutAmount: failed ? null : Number(r.RestaurantPayoutAmount),
        // DECLINED and CANCELLED both surface as FAILED to keep it simple.
        // For split payments, Payment.PaidStatus can remain PENDING because
        // QR did not pay the whole bill. PaymentSession.SETTLED is the actual
        // Telr success signal for this leg.
        paidStatus: failed ? "FAILED" : (r.TelrStatus === "SETTLED" ? "PAID" : r.PaidStatus),
        qrBillStatus: failed ? null : r.PaidStatus,
        telrStatus: failed ? r.TelrStatus : (r.TelrStatus || null),
        telrMode: failed ? r.TelrMode : (r.TelrMode || null),
        posBillStatus: failed ? null : (r.PosBillStatus || null),
        failReason: failed ? r.PaidStatus : null,
        orderRef: r.OrderRef || null,
        ...(exposeTelrRefs ? { tranRef: r.TranRef || null, authCode: r.AuthCode || null } : {}),
        // A leg count above 1 means this order was paid by several people.
        // Counted over the whole order, so it stays true when a sibling leg
        // falls outside the requested date range.
        splitLegCount: failed ? null : legCount,
        splitLegIndex: failed ? null : Number(r.OrderLegIndex || 0),
        isSplitLeg: failed ? false : legCount > 1,
        // TableID is TableMaster's internal PK from the QR token; TableNo is
        // the physical table number printed on receipts - show that instead,
        // falling back to the raw ID if the table row is gone.
        tableMasterId: r.TableID != null ? Number(r.TableID) : null,
        tableNo: r.TableNo != null ? Number(r.TableNo) : null,
        tableId: r.TableNo != null ? Number(r.TableNo) : (r.TableID != null ? Number(r.TableID) : null),
        createdAt: r.CreatedAt,
        payout: failed
          ? null
          : r.PayoutID
            ? {
                payoutId: Number(r.PayoutID),
                // Anything unrecognized (e.g. a legacy APPROVED row) falls back to PENDING.
                status: ["PROCESSING", "SCHEDULED", "TRANSFERRED"].includes(r.PayoutStatus)
                  ? r.PayoutStatus
                  : "PENDING",
                amount: Number(r.RestaurantPayoutAmount),
                transferRef: r.TransferRef,
                transferDate: r.TransferDate,
                transferredBy: r.TransferredBy,
                notes: r.PayoutNotes,
                batchNo: r.BatchNo != null ? Number(r.BatchNo) : null,
                scheduledDate: r.ScheduledDate || null
              }
            : { status: "PENDING", amount: Number(r.RestaurantPayoutAmount), batchNo: null, scheduledDate: null }
      };
    });

    // Echo the boundaries actually applied so a report header can print the
    // range that produced the numbers rather than the range the user typed.
    return {
      page,
      pageSize,
      total,
      transactions,
      appliedFrom: fromDate ? fromDate.toISOString() : null,
      appliedTo: toDate ? toDate.toISOString() : null
    };
}

/**
 * GET /api/payout/transactions
 * Query params: shopId (company only), status (effective online status),
 * payoutStatus (PENDING|PROCESSING|SCHEDULED|TRANSFERRED), batch (numeric BatchNo),
 * transferRef (narrows a batch to one settlement), from, to (ISO dates),
 * sort (id|bill|paid|date|restaurant), dir (asc|desc), page, pageSize.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { page, pageSize, total, transactions, appliedFrom, appliedTo } =
      await queryTransactions(req, { paginate: true });
    res.json({ ok: true, page, pageSize, total, transactions, appliedFrom, appliedTo });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ ok: false, error: err.message });
    console.error("[PAYOUT:TXN] List error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load transactions" });
  }
});

/**
 * GET /api/payout/transactions/export
 * Same filters as the list endpoint but returns every matching row (capped
 * at MAX_EXPORT_ROWS) instead of a page, for PDF/Excel export.
 */
router.get("/export", requireAuth, async (req, res) => {
  try {
    const { total, transactions, appliedFrom, appliedTo } =
      await queryTransactions(req, { paginate: false });
    // Rows are ordered newest-first, so a truncated result silently drops the
    // OLDEST rows - the start of the requested range. Callers must treat
    // truncated: true as "these totals are not the whole range".
    res.json({
      ok: true,
      total,
      returned: transactions.length,
      cap: MAX_EXPORT_ROWS,
      truncated: total > MAX_EXPORT_ROWS,
      appliedFrom,
      appliedTo,
      transactions
    });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ ok: false, error: err.message });
    console.error("[PAYOUT:TXN] Export error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load transactions for export" });
  }
});

/**
 * GET /api/payout/transactions/summary
 * Totals: collected, awaiting transfer, transferred.
 * Company additionally gets a per-restaurant breakdown.
 */
router.get("/summary", requireAuth, async (req, res) => {
  try {
    const shopId = resolveShopScope(req);
    const params = {};
    let shopFilter = "";
    if (shopId != null && Number.isFinite(shopId)) {
      shopFilter = "WHERE p.ShopID = @shopId";
      params.shopId = { type: mssql.BigInt, value: shopId };
    }

    // Restaurant's actual share, net of our service fee cut and the flat
    // platform fee - not the raw amount the customer paid via QR.
    const netExpr = "(p.PaidAmount - ISNULL(p.ServiceFeeAmount,0) - ISNULL(p.PlatformFeeAmount,0))";
    const todayExpr = "CAST(p.CreatedAt AS date) = CAST(SYSDATETIME() AS date)";

    const totals = await query(
      `
      SELECT
        COUNT(*)                                                            AS txnCount,
        ISNULL(SUM(p.PaidAmount), 0)                                        AS totalCollected,
        ISNULL(SUM(p.PaidAmount - ISNULL(p.ServiceFeeAmount, 0)), 0)        AS totalCollectedExcludingServiceFee,
        ISNULL(SUM(ISNULL(p.ServiceFeeAmount, 0)), 0)                       AS totalServiceFeeAmount,
        ISNULL(SUM(ISNULL(p.TipAmount, 0)), 0)                              AS totalTipAmount,
        ISNULL(SUM(CASE WHEN ${todayExpr} THEN 1 ELSE 0 END), 0)            AS todayTxnCount,
        ISNULL(SUM(CASE WHEN ${todayExpr} THEN p.PaidAmount ELSE 0 END), 0) AS todayCollected,
        ISNULL(SUM(CASE WHEN ${todayExpr} THEN p.PaidAmount - ISNULL(p.ServiceFeeAmount, 0) ELSE 0 END), 0) AS todayCollectedExcludingServiceFee,
        ISNULL(SUM(CASE WHEN ${todayExpr} THEN ISNULL(p.ServiceFeeAmount, 0) ELSE 0 END), 0) AS todayServiceFeeAmount,
        ISNULL(SUM(CASE WHEN ${todayExpr} THEN ISNULL(p.TipAmount, 0) ELSE 0 END), 0) AS todayTipAmount,
        ISNULL(SUM(CASE WHEN ps.Status = 'TRANSFERRED' THEN ${netExpr} END), 0) AS totalTransferred,
        ISNULL(SUM(CASE WHEN ps.Status = 'SCHEDULED' THEN ${netExpr} END), 0) AS totalScheduledPayout,
        MIN(CASE WHEN ps.Status = 'SCHEDULED' THEN ps.ScheduledDate END)    AS nextScheduledDate,
        ISNULL(SUM(CASE WHEN ps.Status = 'PROCESSING' THEN ${netExpr} END), 0) AS totalProcessingPayout,
        ISNULL(SUM(CASE WHEN ps.PayoutID IS NULL OR ps.Status NOT IN ('PROCESSING', 'SCHEDULED', 'TRANSFERRED')
                        THEN ${netExpr} END), 0)                            AS totalAwaitingPayout,
        ISNULL(SUM(CASE WHEN ps.PayoutID IS NULL OR ps.Status <> 'TRANSFERRED'
                        THEN ${netExpr} END), 0)                            AS totalPendingPayout,
        ISNULL(SUM(ISNULL(p.PlatformFeeAmount, 0)), 0)                      AS totalPlatformFees,
        ISNULL(SUM(${netExpr}), 0)                                          AS totalRestaurantPayoutDue
      FROM dbo.Payment p
      LEFT JOIN dbo.PayoutStatus ps ON ps.PaymentID = p.PaymentID
      ${shopFilter}
      `,
      params
    );

    let byRestaurant = [];
    if (req.user.role === "superadmin") {
      byRestaurant = await query(
        `
        SELECT
          p.ShopID                                                          AS shopId,
          ISNULL(rm.Name, CONCAT('Shop ', p.ShopID))                        AS restaurantName,
          COUNT(*)                                                          AS txnCount,
          ISNULL(SUM(p.PaidAmount), 0)                                      AS totalCollected,
          ISNULL(SUM(CASE WHEN ps.Status = 'TRANSFERRED' THEN ${netExpr} END), 0) AS totalTransferred,
          ISNULL(SUM(CASE WHEN ps.PayoutID IS NULL OR ps.Status <> 'TRANSFERRED'
                          THEN ${netExpr} END), 0)                          AS totalOwed
        FROM dbo.Payment p
        LEFT JOIN dbo.PayoutStatus    ps ON ps.PaymentID = p.PaymentID
        LEFT JOIN dbo.RestaurantMaster rm ON rm.RestaurantID = p.ShopID
        GROUP BY p.ShopID, rm.Name
        ORDER BY p.ShopID
        `
      );
    }

    res.json({ ok: true, totals: totals[0], byRestaurant });
  } catch (err) {
    console.error("[PAYOUT:TXN] Summary error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load summary" });
  }
});

export default router;
