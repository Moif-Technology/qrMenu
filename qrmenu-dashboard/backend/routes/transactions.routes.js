// qrmenu-dashboard/backend/routes/transactions.routes.js
// Transaction listing + summary. Company sees everything, restaurant users
// are hard-scoped to their own ShopID regardless of query params.
import express from "express";
import { query, mssql } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

const METHOD_NAMES = { 1: "Pay Full", 2: "Equal Split", 3: "Item Split", 4: "Custom Split" };

function resolveShopScope(req) {
  // Restaurant users can only ever see their own shop.
  if (req.user.role === "restaurant") return req.user.shopId;
  // Company users may filter by ?shopId= or see all.
  const q = req.query.shopId;
  return q !== undefined && q !== "" ? Number(q) : null;
}

/**
 * GET /api/transactions
 * Query params: shopId (company only), status (payment PaidStatus),
 * payoutStatus (PENDING|APPROVED|TRANSFERRED|NONE), from, to (ISO dates),
 * page, pageSize.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const shopId = resolveShopScope(req);
    const { status, payoutStatus, from, to } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

    const conditions = [];
    const params = {};

    if (shopId != null && Number.isFinite(shopId)) {
      conditions.push("p.ShopID = @shopId");
      params.shopId = { type: mssql.BigInt, value: shopId };
    }
    if (status) {
      conditions.push("p.PaidStatus = @status");
      params.status = { type: mssql.VarChar(50), value: String(status) };
    }
    if (payoutStatus === "NONE") {
      conditions.push("ps.PayoutID IS NULL");
    } else if (payoutStatus) {
      conditions.push("ps.Status = @payoutStatus");
      params.payoutStatus = { type: mssql.VarChar(20), value: String(payoutStatus) };
    }
    if (from) {
      conditions.push("p.CreatedAt >= @from");
      params.from = { type: mssql.DateTime2, value: new Date(from) };
    }
    if (to) {
      // inclusive end of day
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push("p.CreatedAt <= @to");
      params.to = { type: mssql.DateTime2, value: toDate };
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.offset = { type: mssql.Int, value: (page - 1) * pageSize };
    params.pageSize = { type: mssql.Int, value: pageSize };

    const rows = await query(
      `
      SELECT
        p.PaymentID, p.ShopID, p.TransID, p.MethodID,
        p.BillAmount, p.PaidAmount, p.BalanceAmount, p.PaidStatus,
        p.TableID, p.CreatedAt,
        rm.Name  AS RestaurantName,
        rm.Slug  AS RestaurantSlug,
        ps.PayoutID, ps.Status AS PayoutStatus, ps.Amount AS PayoutAmount,
        ps.ApprovedBy, ps.ApprovedAt, ps.TransferRef, ps.TransferDate,
        ps.TransferredBy, ps.Notes AS PayoutNotes,
        COUNT(*) OVER () AS TotalRows
      FROM dbo.Payment p
      LEFT JOIN dbo.PayoutStatus    ps ON ps.PaymentID = p.PaymentID
      LEFT JOIN dbo.RestaurantMaster rm ON rm.RestaurantID = p.ShopID
      ${whereClause}
      ORDER BY p.PaymentID DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `,
      params
    );

    const total = rows.length ? Number(rows[0].TotalRows) : 0;
    const transactions = rows.map((r) => ({
      paymentId: Number(r.PaymentID),
      shopId: Number(r.ShopID),
      restaurantName: r.RestaurantName || `Shop ${r.ShopID}`,
      restaurantSlug: r.RestaurantSlug || null,
      kotMasterId: Number(r.TransID),
      methodId: Number(r.MethodID),
      methodName: METHOD_NAMES[Number(r.MethodID)] || `Method ${r.MethodID}`,
      billAmount: Number(r.BillAmount),
      paidAmount: Number(r.PaidAmount),
      balanceAmount: Number(r.BalanceAmount),
      paidStatus: r.PaidStatus,
      tableId: r.TableID != null ? Number(r.TableID) : null,
      createdAt: r.CreatedAt,
      payout: r.PayoutID
        ? {
            payoutId: Number(r.PayoutID),
            status: r.PayoutStatus,
            amount: Number(r.PayoutAmount),
            approvedBy: r.ApprovedBy,
            approvedAt: r.ApprovedAt,
            transferRef: r.TransferRef,
            transferDate: r.TransferDate,
            transferredBy: r.TransferredBy,
            notes: r.PayoutNotes
          }
        : { status: "PENDING", amount: Number(r.PaidAmount) }
    }));

    res.json({ ok: true, page, pageSize, total, transactions });
  } catch (err) {
    console.error("[DASH:TXN] List error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load transactions" });
  }
});

/**
 * GET /api/transactions/summary
 * Totals: collected, pending payout, approved, transferred.
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

    const totals = await query(
      `
      SELECT
        COUNT(*)                                                            AS txnCount,
        ISNULL(SUM(p.PaidAmount), 0)                                        AS totalCollected,
        ISNULL(SUM(CASE WHEN ps.Status = 'TRANSFERRED' THEN ps.Amount END), 0) AS totalTransferred,
        ISNULL(SUM(CASE WHEN ps.Status = 'APPROVED'    THEN ps.Amount END), 0) AS totalApproved,
        ISNULL(SUM(CASE WHEN ps.PayoutID IS NULL OR ps.Status = 'PENDING'
                        THEN p.PaidAmount END), 0)                          AS totalPendingPayout
      FROM dbo.Payment p
      LEFT JOIN dbo.PayoutStatus ps ON ps.PaymentID = p.PaymentID
      ${shopFilter}
      `,
      params
    );

    let byRestaurant = [];
    if (req.user.role === "company") {
      byRestaurant = await query(
        `
        SELECT
          p.ShopID                                                          AS shopId,
          ISNULL(rm.Name, CONCAT('Shop ', p.ShopID))                        AS restaurantName,
          COUNT(*)                                                          AS txnCount,
          ISNULL(SUM(p.PaidAmount), 0)                                      AS totalCollected,
          ISNULL(SUM(CASE WHEN ps.Status = 'TRANSFERRED' THEN ps.Amount END), 0) AS totalTransferred,
          ISNULL(SUM(CASE WHEN ps.PayoutID IS NULL OR ps.Status IN ('PENDING','APPROVED')
                          THEN p.PaidAmount END), 0)                        AS totalOwed
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
    console.error("[DASH:TXN] Summary error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to load summary" });
  }
});

export default router;
