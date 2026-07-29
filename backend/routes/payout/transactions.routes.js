// backend/routes/payout/transactions.routes.js
// Transaction listing + summary. Company sees everything, restaurant users
// are hard-scoped to their own ShopID regardless of query params.
import express from "express";
import { query, mssql } from "../../utils/payoutDb.js";
import { requireAuth } from "../../middleware/payoutAuth.middleware.js";
import { parseWallClock } from "../../utils/payoutDates.js";

const router = express.Router();

const METHOD_NAMES = { 1: "Pay Full", 2: "Equal Split", 3: "Item Split", 4: "Custom Split" };

// Whitelisted sortable columns over the unioned result set (payments plus
// failed attempts); anything else falls back to the row id.
const SORT_COLUMNS = {
  id: "RowID",
  bill: "BillAmount",
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

async function queryTransactions(req, { paginate = true } = {}) {
    const shopId = resolveShopScope(req);
    const { status, payoutStatus, from, to, methodId, search, minAmount, maxAmount, batch } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = paginate
      ? Math.min(200, Math.max(1, Number(req.query.pageSize) || 50))
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
    const fromDate = from ? parseWallClock(from) : null;
    if (fromDate) {
      conditions.push("p.CreatedAt >= @from");
      attemptConds.push("a.CreatedAt >= @from");
      params.from = { type: mssql.DateTime2, value: fromDate };
    }
    // Date-only value means "inclusive end of that day"; an explicit
    // time (e.g. 2026-07-12T14:30) is respected as given.
    const toDate = to ? parseWallClock(to, { endOfDay: true }) : null;
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
          p.BillAmount, p.PaidAmount, p.PaidBillAmount, p.BalanceAmount, p.PaidStatus,
          p.TableID, tm.TableNO AS TableNo, p.CreatedAt,
          sm.BillNo AS BillNo,
          CAST(NULL AS NVARCHAR(100)) AS OrderRef,
          rm.Name  AS RestaurantName,
          rm.Slug  AS RestaurantSlug,
          ps.PayoutID, ps.Status AS PayoutStatus, ps.Amount AS PayoutAmount,
          ps.TransferRef, ps.TransferDate, ps.TransferredBy, ps.Notes AS PayoutNotes,
          ps.BatchNo, ps.ScheduledDate,
          ISNULL(p.ServiceFeeAmount, 0) AS ServiceFeeAmount,
          ISNULL(p.TipAmount, 0)        AS TipAmount,
          p.PlatformFeeAmount,
          -- PaidAmount is the REAL total charged per leg (bill-share + fee +
          -- tip). Tip belongs to the restaurant (kept in), only DeynoQR's own
          -- service fee and the flat platform fee come out.
          (p.PaidAmount - ISNULL(p.ServiceFeeAmount,0) - p.PlatformFeeAmount) AS RestaurantPayoutAmount
        FROM dbo.Payment p
        LEFT JOIN dbo.PayoutStatus    ps ON ps.PaymentID = p.PaymentID
        LEFT JOIN dbo.RestaurantMaster rm ON rm.RestaurantID = p.ShopID
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
          a.TableID, tm2.TableNO AS TableNo, a.CreatedAt,
          CAST(NULL AS NUMERIC(18,0)) AS BillNo,
          a.OrderRef,
          rm.Name  AS RestaurantName,
          rm.Slug  AS RestaurantSlug,
          NULL, NULL, NULL, NULL, NULL, NULL, NULL,
          CAST(NULL AS BIGINT) AS BatchNo, CAST(NULL AS DATE) AS ScheduledDate,
          CAST(0 AS MONEY) AS ServiceFeeAmount,
          CAST(0 AS MONEY) AS TipAmount,
          CAST(0 AS MONEY) AS PlatformFeeAmount,
          CAST(0 AS MONEY) AS RestaurantPayoutAmount
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
    const transactions = rows.map((r) => {
      const failed = r.Kind === "A";
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
        restaurantPayoutAmount: failed ? null : Number(r.RestaurantPayoutAmount),
        // DECLINED and CANCELLED both surface as FAILED to keep it simple.
        paidStatus: failed ? "FAILED" : r.PaidStatus,
        failReason: failed ? r.PaidStatus : null,
        orderRef: r.OrderRef || null,
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
                amount: Number(r.PayoutAmount),
                transferRef: r.TransferRef,
                transferDate: r.TransferDate,
                transferredBy: r.TransferredBy,
                notes: r.PayoutNotes,
                batchNo: r.BatchNo != null ? Number(r.BatchNo) : null,
                scheduledDate: r.ScheduledDate || null
              }
            : { status: "PENDING", amount: Number(r.PaidAmount), batchNo: null, scheduledDate: null }
      };
    });

    return { page, pageSize, total, transactions };
}

/**
 * GET /api/payout/transactions
 * Query params: shopId (company only), status (payment PaidStatus),
 * payoutStatus (PENDING|PROCESSING|SCHEDULED|TRANSFERRED), batch (numeric BatchNo), from, to (ISO dates),
 * sort (id|bill|paid|date|restaurant), dir (asc|desc), page, pageSize.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { page, pageSize, total, transactions } = await queryTransactions(req, { paginate: true });
    res.json({ ok: true, page, pageSize, total, transactions });
  } catch (err) {
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
    const { total, transactions } = await queryTransactions(req, { paginate: false });
    res.json({ ok: true, total, truncated: total > MAX_EXPORT_ROWS, transactions });
  } catch (err) {
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
    const netExpr = "(p.PaidAmount - ISNULL(p.ServiceFeeAmount,0) - p.PlatformFeeAmount)";

    const totals = await query(
      `
      SELECT
        COUNT(*)                                                            AS txnCount,
        ISNULL(SUM(p.PaidAmount), 0)                                        AS totalCollected,
        ISNULL(SUM(CASE WHEN ps.Status = 'TRANSFERRED' THEN ${netExpr} END), 0) AS totalTransferred,
        ISNULL(SUM(CASE WHEN ps.PayoutID IS NULL OR ps.Status <> 'TRANSFERRED'
                        THEN ${netExpr} END), 0)                            AS totalPendingPayout,
        ISNULL(SUM(p.PlatformFeeAmount), 0)                                 AS totalPlatformFees,
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
