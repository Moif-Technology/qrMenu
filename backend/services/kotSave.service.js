// backend/services/kotSave.service.js
import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";

const T_IDCTRL = "dbo.IDControlManager";
const T_KOTM = "dbo.KOTMaster";
const T_KOTC = "dbo.KOTChild";
const q = (n) => `[${n}]`;

/* ---------------- helpers ---------------- */

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function toInt(n, d = 0) {
  const v = Number.parseInt(n, 10);
  return Number.isFinite(v) ? v : d;
}
function toNum(n, d = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
}

/** Extract a numeric TableID if QR sends like "TABLE-02" */
function resolveTableId(anyId) {
  if (anyId == null) return 0;
  const digits = String(anyId).match(/\d+/g);
  if (!digits) return toInt(anyId, 0);
  return toInt(digits.join(""), 0);
}

// VB-style counter with row lock
async function getNextIdTx(controlName, tx) {
  const req = new mssql.Request(tx);
  req.input("name", mssql.VarChar, String(controlName));

  const sql = `
    IF EXISTS (
      SELECT 1
      FROM ${T_IDCTRL} WITH (UPDLOCK, HOLDLOCK)
      WHERE ${q("ControlName")} = @name
    )
    BEGIN
      UPDATE ${T_IDCTRL}
        SET ${q("ControlValue")} = ${q("ControlValue")} + 1
      WHERE ${q("ControlName")} = @name;

      SELECT ${q("ControlValue")} AS val
      FROM ${T_IDCTRL}
      WHERE ${q("ControlName")} = @name;
    END
    ELSE
    BEGIN
      INSERT INTO ${T_IDCTRL} (${q("ControlName")}, ${q("ControlValue")})
      VALUES (@name, 1);

      SELECT CAST(1 AS INT) AS val;
    END
  `;

  const rs = await req.query(sql);
  return Number(rs.recordset[0].val);
}

/** Compute one line (unit price is tax-inclusive; tax1 only) */
function computeLine(line) {
  const qty = toNum(line.qty, 1);
  const gross = toNum(line.unitPrice ?? line.lineTotal ?? line.price, 0);

  const raw = (line.product && (line.product._raw || {})) || {};
  const tax1Rate =
    toNum(raw["pc.Tax1Rate"]) ||
    toNum(line.product?.pc?.Tax1Rate) ||
    toNum(line.product?.tax1Rate) ||
    0;

  const baseUnit = tax1Rate > 0 ? gross / (1 + tax1Rate / 100) : gross;
  const subTotal = r2(baseUnit * qty);
  const tax1Amount = r2(gross * qty - subTotal);
  const lineTotal = r2(gross * qty);

  return {
    qty,
    tax1Rate,
    unitBase: r2(baseUnit),
    subTotal,
    tax1Amount,
    lineTotal,
  };
}

/* 🔹 NEW: make a clean, trimmed, comma-separated modifier string (names only) */
function joinMods(mods, maxLen = 200) {
  if (!Array.isArray(mods) || mods.length === 0) return "";
  const names = mods
    .map(
      (m) =>
        m?.name ??
        m?.label ??
        m?.Modifier ??
        m?.raw?.Modifier ??
        (typeof m === "string" ? m : "")
    )
    .map((s) => String(s).trim())
    .filter(Boolean);

  if (names.length === 0) return "";

  let s = names.join(", ");
  // hard truncate to fit NVARCHAR column length
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/* ---------------- service ---------------- */

/**
 * Save KOT (master + child) in a single transaction.
 * Payload:
 * {
 *   header: { tableId, subtotal, itemsCount, note, currency },
 *   items: [ { qty, unitPrice, lineTotal, product:{ ... , _raw:{...} }, mods:[] }, ... ]
 * }
 */
export async function saveKot(payload) {
  const header = payload?.header || {};
  const items = Array.isArray(payload?.items) ? payload.items : [];

  console.log("[KOT:SVC] start", {
    items: items.length,
    tableId: header?.tableId,
    chairId: header?.chairId,
    chairNo: header?.chairNo,
  });
  if (!header || items.length === 0)
    throw new Error("header and at least one item are required");

  const tableId = resolveTableId(header.tableId);
  if (!tableId) throw new Error("Valid numeric TableID required from QR");

  // Get ChairNo from header, default to 1
  const chairNo = toInt(header?.chairId || header?.chairNo || 1, 1);

  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);
  await tx.begin();

  try {
    // 1) Check if there's an existing KOTMasterID for this TableID and ChairNo
    // Only check for unpaid KOTs (BillID = 0) that are not cancelled
    const checkExistingReq = new mssql.Request(tx);
    checkExistingReq.input("TableID", mssql.Int, tableId);
    checkExistingReq.input("ChairNo", mssql.Int, chairNo);
    
    const checkExistingSql = `
      SELECT TOP 1 ${q("kotMasterID")}
      FROM ${T_KOTM}
      WHERE ${q("TableID")} = @TableID
        AND ${q("ChairNo")} = @ChairNo
        AND ISNULL(${q("BillID")}, 0) = 0
        AND ISNULL(${q("KotStatus")}, '') <> 'CANCELLED'
      ORDER BY ${q("kotMasterID")} DESC
    `;
    
    const existingKotResult = await checkExistingReq.query(checkExistingSql);
    let kotMasterID = null;
    let isExistingKot = false;
    
    if (existingKotResult.recordset.length > 0) {
      kotMasterID = toInt(existingKotResult.recordset[0].kotMasterID);
      isExistingKot = true;
      console.log("[KOT:SVC] Found existing KOTMasterID =", kotMasterID, "for TableID:", tableId, "ChairNo:", chairNo);
    } else {
      // Generate new master ID via VB logic
      kotMasterID = await getNextIdTx("KOTMaster", tx);
      isExistingKot = false;
      console.log("[KOT:SVC] Creating new KOTMasterID =", kotMasterID);
    }

    // 2) Totals
    let subTotalM = 0,
      tax1M = 0,
      amountM = 0;
    for (const it of items) {
      const c = computeLine(it);
      subTotalM += c.subTotal;
      tax1M += c.tax1Amount;
      amountM += c.lineTotal;
    }
    subTotalM = r2(subTotalM);
    tax1M = r2(tax1M);
    amountM = r2(amountM);

    // Prefer station from first item if present
    const firstRaw = (items[0]?.product && (items[0].product._raw || {})) || {};
    const stationId =
      toInt(firstRaw["pm.StationID"]) || toInt(firstRaw["pc.StationID"]) || 0;

    // 🔹 Ensure remarks is a bounded NVARCHAR(500)
    let remarks = String(header.note || "");
    if (remarks.length > 500) remarks = remarks.slice(0, 500);

    // 3) Insert or Update Master
    if (!isExistingKot) {
      // Insert new Master record
      const reqM = new mssql.Request(tx);
      reqM.input("kotMasterID", mssql.BigInt, kotMasterID);
      reqM.input("KotStatus", mssql.VarChar(50), "SUBMIT");
      reqM.input("Dummy", mssql.VarChar(50), "PENDING");
      reqM.input("Upload", mssql.VarChar(50), "PENDING");
      reqM.input("TableID", mssql.Int, tableId);
      reqM.input("ChairNo", mssql.Int, chairNo);
      reqM.input("SubTotalM", mssql.Decimal(18, 2), subTotalM);
      reqM.input("Tax1AmountM", mssql.Decimal(18, 2), tax1M);
      reqM.input("Amount", mssql.Decimal(18, 2), amountM);
      reqM.input("StationID", mssql.Int, stationId);
      reqM.input("CrBy", mssql.VarChar(50), "DIGIMENU");
      reqM.input("ModBy", mssql.VarChar(50), "DIGIMENU");
      reqM.input("Remarks", mssql.NVarChar(500), remarks);

      const sqlM = `
       DECLARE @now DATETIME2(0) = SYSDATETIME();  -- one precise timestamp
        INSERT INTO ${T_KOTM} (
          ${q("kotMasterID")},
          ${q("KotStatus")}, ${q("KotDate")}, ${q("KotTime")},
          ${q("CustomerID")}, ${q("DeliveryBoyId")}, ${q("Deliverytime")},
          ${q("TableID")}, ${q("ChairNo")}, ${q("WaiterID")}, ${q(
        "SalesManID"
      )},
          ${q("UploadStatusM")}, ${q("BillDiscount")},
          ${q("SubTotalM")}, ${q("Tax1AmountM")}, ${q("Tax2AmountM")}, ${q(
        "Tax3AmountM"
      )},
          ${q("Tax1RateM")}, ${q("Tax2RateM")}, ${q("Tax3RateM")},
          ${q("Amount")}, ${q("StationID")}, ${q("BillID")},
          ${q("CrBy")}, ${q("CrOn")}, ${q("ModBy")}, ${q("ModOn")},
          ${q("NofCustomer")}, ${q("Remarks")},
          ${q("RoundOffAdj")}, ${q("DummyBillPrintStatus")}
        )
        VALUES (
          @kotMasterID,
          @KotStatus,
          @now,            
          @now,               
          1,
          0,
          CONVERT(time(1), '00:00:00'),
          @TableID, @ChairNo, 0, 0,
          @Upload, 0,
          @SubTotalM, @Tax1AmountM, 0, 0,
          0, 0, 0,
          @Amount, @StationID, 0,
          @CrBy, GETDATE(), @ModBy, GETDATE(),
          1, @Remarks,
          0, @Dummy
        )
      `;
      await reqM.query(sqlM);
    } else {
      // Update existing Master record - add to totals
      const reqM = new mssql.Request(tx);
      reqM.input("kotMasterID", mssql.BigInt, kotMasterID);
      reqM.input("SubTotalM", mssql.Decimal(18, 2), subTotalM);
      reqM.input("Tax1AmountM", mssql.Decimal(18, 2), tax1M);
      reqM.input("Amount", mssql.Decimal(18, 2), amountM);
      reqM.input("ModBy", mssql.VarChar(50), "DIGIMENU");
      reqM.input("Remarks", mssql.NVarChar(500), remarks);

      const updateSql = `
        UPDATE ${T_KOTM}
        SET ${q("SubTotalM")} = ${q("SubTotalM")} + @SubTotalM,
            ${q("Tax1AmountM")} = ${q("Tax1AmountM")} + @Tax1AmountM,
            ${q("Amount")} = ${q("Amount")} + @Amount,
            ${q("ModBy")} = @ModBy,
            ${q("ModOn")} = GETDATE(),
            ${q("Remarks")} = CASE 
              WHEN @Remarks = '' THEN ${q("Remarks")}
              ELSE ${q("Remarks")} + CHAR(13) + CHAR(10) + @Remarks
            END
        WHERE ${q("kotMasterID")} = @kotMasterID
      `;
      await reqM.query(updateSql);
      console.log("[KOT:SVC] Updated existing KOTMaster totals");
    }

    // 4) Insert Child rows
    for (const [idx, line] of items.entries()) {
      const raw = (line.product && (line.product._raw || {})) || {};

      // Accept your frontend’s product shape (MenuCard -> product.id)
      const productIdNum = toInt(
        line.product?.product_id ??
          line.product?.pm?.ProductID ??
          raw["pc.ProductID"] ??
          raw["pm.ProductID"] ??
          line.product?.id, // fallback
        0
      );

      if (!productIdNum) {
        throw new Error(`Missing ProductID for item index ${idx}`);
      }

      // barcode: keep as text to preserve leading zeros / avoid int range issues
      const barcodeRaw =
        (line.product?.pm?.BarCode != null
          ? String(line.product.pm.BarCode)
          : raw["pm.BarCode"] != null
          ? String(raw["pm.BarCode"])
          : "") || "";

      const uniqId = toInt(
        raw["pc.UniqueMultiProductID"] ?? raw["pm.UniqueMultiProductID"]
      );
      const shortDesc = String(
        line.product?.name ?? line.product?.pm?.ShortDescription ?? ""
      );
      const packQty = toNum(raw["pc.PackQty"] ?? 1, 1);

      // GroupID can also exceed Int32 in some datasets – bind as BigInt
      const groupIdNum = toInt(
        line.product?.group_id ?? line.product?.categoryId ?? raw["pm.GroupID"]
      );

      const { qty, tax1Rate, unitBase, subTotal, tax1Amount, lineTotal } =
        computeLine(line);

      // Child ID via VB counter
      const kotChildID = await getNextIdTx("KOTChild", tx);
      console.log("[KOT:SVC] child #", idx, "KotChildID =", kotChildID);

      const reqC = new mssql.Request(tx);
      reqC.input("KotChildID", mssql.BigInt, kotChildID);
      reqC.input("kotMasterID", mssql.BigInt, kotMasterID);

      // 🔑 BIG IDs here:
      reqC.input("ProductID", mssql.BigInt, productIdNum);
      reqC.input("GroupID", mssql.BigInt, groupIdNum || 0);

      // barcode as text (safer)
      reqC.input("BarCode", mssql.VarChar(50), barcodeRaw);

      // unique id can be large too
      reqC.input("UniqueProductID", mssql.BigInt, uniqId || 0);

      reqC.input("ShortDescription", mssql.NVarChar(200), shortDesc);
      reqC.input("Qty", mssql.Decimal(18, 3), qty);
      reqC.input("PackQty", mssql.Decimal(18, 3), packQty);
      reqC.input("UnitCost", mssql.Decimal(18, 3), 0);
      reqC.input("UnitPrice", mssql.Decimal(18, 3), unitBase); // pre-tax
      reqC.input("Amount", mssql.Decimal(18, 2), 0);
      reqC.input("ItemDiscount", mssql.Decimal(18, 2), 0);
      reqC.input("SubTotalC", mssql.Decimal(18, 2), subTotal);
      reqC.input("Tax1AmountC", mssql.Decimal(18, 2), tax1Amount);
      reqC.input("Tax2AmountC", mssql.Decimal(18, 2), 0);
      reqC.input("Tax3AmountC", mssql.Decimal(18, 2), 0);
      reqC.input("Tax1RateC", mssql.Decimal(9, 3), tax1Rate);
      reqC.input("Tax2RateC", mssql.Decimal(9, 3), 0);
      reqC.input("Tax3RateC", mssql.Decimal(9, 3), 0);
      reqC.input("LineTotal", mssql.Decimal(18, 2), lineTotal);

      /* 🔹 CHANGED: build Modifier as names-only, comma-separated, max 200 chars */
      const modifierText = joinMods(line.mods, 200);
      reqC.input("Modifier", mssql.NVarChar(200), modifierText);

      reqC.input("Androidprint", mssql.VarChar(50), "SUBMIT");
      reqC.input("PrintCount", mssql.Int, 0);
      reqC.input("UploadStatusC", mssql.VarChar(50), "PENDING");
      reqC.input("CrBy", mssql.VarChar(50), "DIGIMENU");
      reqC.input("ModBy", mssql.VarChar(50), "DIGIMENU");
      reqC.input("DescriptionArabic", mssql.NVarChar(200), "");
      reqC.input("KOTDisplayStatus", mssql.VarChar(50), "PENDING");
      reqC.input("TransactionID", mssql.Int, 0);

      const sqlC = `
        INSERT INTO ${T_KOTC} (
          ${q("KotChildID")}, ${q("kotMasterID")},
          ${q("ProductID")}, ${q("BarCode")}, ${q("UniqueProductID")},
          ${q("ShortDescription")}, ${q("Qty")}, ${q("PackQty")},
          ${q("UnitCost")}, ${q("UnitPrice")}, ${q("Amount")}, ${q(
        "ItemDiscount"
      )},
          ${q("SubTotalC")}, ${q("Tax1AmountC")}, ${q("Tax2AmountC")}, ${q(
        "Tax3AmountC"
      )},
          ${q("Tax1RateC")}, ${q("Tax2RateC")}, ${q("Tax3RateC")},
          ${q("LineTotal")}, ${q("GroupID")}, ${q("Modifier")},
          ${q("Androidprint")}, ${q("PrintCount")}, ${q("UploadStatusC")},
          ${q("CrBy")}, ${q("CrOn")}, ${q("ModBy")}, ${q("ModOn")},
          ${q("DescriptionArabic")}, ${q("KOTDisplayStatus")}, ${q(
        "TransactionID"
      )}
        )
        VALUES (
          @KotChildID, @kotMasterID,
          @ProductID, @BarCode, @UniqueProductID,
          @ShortDescription, @Qty, @PackQty,
          @UnitCost, @UnitPrice, @Amount, @ItemDiscount,
          @SubTotalC, @Tax1AmountC, @Tax2AmountC, @Tax3AmountC,
          @Tax1RateC, @Tax2RateC, @Tax3RateC,
          @LineTotal, @GroupID, @Modifier,
          @Androidprint, @PrintCount, @UploadStatusC,
          @CrBy, GETDATE(), @ModBy, GETDATE(),
          @DescriptionArabic, @KOTDisplayStatus, @TransactionID
        )
      `;
      await reqC.query(sqlC);
    }

    await tx.commit();
    console.log("[KOT:SVC] committed");
    return {
      ok: true,
      kotMasterID,
      tableId,
      totals: { subTotalM, tax1M, amountM },
      rows: items.length,
    };
  } catch (err) {
    try {
      await tx.rollback();
      console.error("[KOT:SVC] rolled back");
    } catch {}
    console.error(
      "[KOT:SVC] ERROR:",
      err?.originalError?.info?.message || err?.message || err
    );
    throw err;
  }
}

// alias if you prefer
export const sendKot = saveKot;
