// backend/services/settlement.service.js
//
// After a KOT is fully paid via QR menu, this service:
//   1. Reads KOTMaster + KOTChild from Moifcore
//   2. Inserts one SalesMaster row
//   3. Inserts one SalesChild row per KOTChild item
//   4. Deletes the KOTMaster row  (trigger on KOTMaster cascades KOTChild deletion)
//
// Everything runs inside a single Moifcore transaction.
// On any failure the transaction is rolled back and the error is logged
// – the payment record in PaymentGateway is already committed and safe.

import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";

const T_IDCTRL   = "dbo.IDControlManager";
const T_SALESM   = "dbo.SalesMaster";
const T_SALESC   = "dbo.SalesChild";
const T_SALESPS  = "dbo.SalesPaymentSplit";
const T_KOTM     = "dbo.KOTMaster";
const T_KOTC     = "dbo.KOTChild";
const q          = (n) => `[${n}]`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function toInt(n, d = 0) {
  const v = Number.parseInt(n, 10);
  return Number.isFinite(v) ? v : d;
}
function toNum(n, d = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
}
function toStr(v, d = "0") {
  return v != null && String(v).trim() !== "" ? String(v).trim() : d;
}

/**
 * VB-style row-locked counter from IDControlManager.
 * Increments ControlValue by 1 and returns the NEW value.
 * If the row does not exist it is created starting at 1.
 */
async function getNextIdTx(controlName, tx) {
  const req = new mssql.Request(tx);
  req.input("name", mssql.VarChar, String(controlName));

  const sql = `
    IF EXISTS (
      SELECT 1
      FROM   ${T_IDCTRL} WITH (UPDLOCK, HOLDLOCK)
      WHERE  ${q("ControlName")} = @name
    )
    BEGIN
      UPDATE ${T_IDCTRL}
        SET  ${q("ControlValue")} = ${q("ControlValue")} + 1
      WHERE  ${q("ControlName")} = @name;

      SELECT ${q("ControlValue")} AS val
      FROM   ${T_IDCTRL}
      WHERE  ${q("ControlName")} = @name;
    END
    ELSE
    BEGIN
      INSERT INTO ${T_IDCTRL} (${q("ControlName")}, ${q("ControlValue")})
      VALUES (@name, 1);

      SELECT CAST(1 AS BIGINT) AS val;
    END
  `;

  const rs = await req.query(sql);
  return Number(rs.recordset[0].val);
}

/**
 * Get next BillNo = MAX(BillNo)+1 from SalesMaster (within the transaction).
 * Falls back to 1 if the table is empty.
 */
async function getNextBillNo(tx) {
  const req = new mssql.Request(tx);
  const sql = `
    SELECT ISNULL(MAX(${q("BillNo")}), 0) + 1 AS nextBillNo
    FROM   ${T_SALESM}
  `;
  const rs = await req.query(sql);
  return Number(rs.recordset[0].nextBillNo);
}

/* ------------------------------------------------------------------ */
/*  Main export                                                         */
/* ------------------------------------------------------------------ */

/**
 * Settle a fully-paid KOT into SalesMaster / SalesChild, then delete it.
 *
 * @param {number} kotMasterID
 * @param {{ tipAmount?: number }} [opts] - POS-side tip to record in SalesPaymentSplit
 * @returns {{ salesID: number, billNo: number, salesChildCount: number }}
 */
export async function settleKotToSales(kotMasterID, opts = {}) {
  const kmID = toInt(kotMasterID);
  if (kmID <= 0) throw new Error(`settleKotToSales: invalid kotMasterID (${kotMasterID})`);
  const tipAmount = r2(toNum(opts?.tipAmount, 0));

  const pool = await connectToDb();
  const tx   = new mssql.Transaction(pool);

  try {
    await tx.begin();

    /* ---- 1. Load KOTMaster ---- */
    // UPDLOCK+HOLDLOCK: without a lock here, two concurrent calls for the
    // same kotMasterID (this genuinely happens - saveItemSplitPayment fires
    // this off in the background the moment balance hits zero, and another
    // caller can land at the same time) can both pass this SELECT before
    // either commits its DELETE below, producing two SalesMaster entries for
    // one bill. Same pattern getNextIdTx() already uses correctly in this
    // file - the lock makes the second caller wait, then find the row gone.
    const kmReq = new mssql.Request(tx);
    kmReq.input("kotMasterID", mssql.BigInt, kmID);
    const kmSql = `
      SELECT *
      FROM   ${T_KOTM} WITH (UPDLOCK, HOLDLOCK)
      WHERE  ${q("kotMasterID")} = @kotMasterID
    `;
    const kmResult = await kmReq.query(kmSql);
    const km = kmResult.recordset[0];

    if (!km) {
      await tx.rollback();
      console.warn(`[SETTLEMENT] KOTMaster not found for kotMasterID=${kmID}. Already settled?`);
      return { alreadySettled: true };
    }

    /* ---- 2. Load KOTChild rows ---- */
    const kcReq = new mssql.Request(tx);
    kcReq.input("kotMasterID", mssql.BigInt, kmID);
    const kcSql = `
      SELECT *
      FROM   ${T_KOTC}
      WHERE  ${q("kotMasterID")} = @kotMasterID
      ORDER BY ${q("KotChildID")} ASC
    `;
    const kcResult = await kcReq.query(kcSql);
    const kotChildren = kcResult.recordset || [];

    console.log(`[SETTLEMENT] Settling kotMasterID=${kmID}, items=${kotChildren.length}`);

    /* ---- 3. Generate IDs ---- */
    const salesID  = await getNextIdTx("SalesMaster", tx);
    const billNo   = await getNextBillNo(tx);

    console.log(`[SETTLEMENT] salesID=${salesID}, billNo=${billNo}`);

    /* ---- 4. Build HoldStatus = KotPrefix + KotNumber (max 10 chars) ---- */
    const holdStatus = (toStr(km.KotPrefix, "") + toStr(km.KotNumber, "")).substring(0, 10).padEnd(10, " ");

    /* ---- 5. Insert SalesMaster ---- */
    const counterNo = toNum(km.CounterNo, 0);  // KOTMaster.CounterNo is varchar, cast to numeric
    const customerID = toInt(km.CustomerID, 0) > 0 ? toInt(km.CustomerID) : 1;

    const smReq = new mssql.Request(tx);
    smReq.input("SalesID",                mssql.BigInt,           salesID);
    smReq.input("SalesManID",             mssql.BigInt,           toInt(km.SalesManID, 0));
    smReq.input("CounterNo",              mssql.Numeric(18, 0),   counterNo);
    smReq.input("BillNo",                 mssql.Numeric(18, 0),   billNo);
    smReq.input("CustomerID",             mssql.BigInt,           customerID);
    smReq.input("PaymentMode",            mssql.VarChar(50),      "ONLINE");
    smReq.input("CreditCardNO",           mssql.VarChar(50),      "0");
    smReq.input("CreditCardTypeID",       mssql.BigInt,           0);
    smReq.input("Amount",                 mssql.Money,            r2(toNum(km.Amount)));
    smReq.input("DiscountAmount",         mssql.Money,            r2(toNum(km.BillDiscount)));
    smReq.input("PostStatus",             mssql.VarChar(50),      "POSTED");
    smReq.input("HoldStatus",             mssql.Char(10),         holdStatus);
    smReq.input("PaidAmount",             mssql.Money,            r2(toNum(km.Amount)));
    smReq.input("BalancePaid",            mssql.Money,            0);
    smReq.input("TransactionType",        mssql.VarChar(1),       "S");
    smReq.input("PaidCurrency",           mssql.VarChar(50),      "AED");
    smReq.input("StationID",             mssql.BigInt,           10);
    smReq.input("DBLocation",             mssql.VarChar(50),      "0");
    smReq.input("UploadStatusM",          mssql.VarChar(50),      "PENDING");
    smReq.input("CounterCloseStatus",     mssql.VarChar(50),      "PENDING");
    smReq.input("CrBy",                   mssql.VarChar(50),      "QR_MENU");
    smReq.input("ModBy",                  mssql.VarChar(50),      "QR_MENU");
    smReq.input("StaffID",               mssql.BigInt,           0);
    smReq.input("WaiterID",              mssql.BigInt,           toInt(km.WaiterID, 0));
    smReq.input("TableID",               mssql.BigInt,           toInt(km.TableID, 0));
    smReq.input("AreaID",                mssql.BigInt,           toInt(km.AreaID, 0));
    smReq.input("HoldNo",                mssql.VarChar(50),      String(kmID));
    smReq.input("NofCustomer",           mssql.BigInt,           toInt(km.NofCustomer, 0));
    smReq.input("ServerStatus",          mssql.VarChar(50),      "PENDING");
    smReq.input("SubTotalM",             mssql.Money,            r2(toNum(km.SubTotalM)));
    smReq.input("TaxableAmount",         mssql.Money,            r2(toNum(km.SubTotalM)));
    smReq.input("Tax1AmountM",           mssql.Money,            r2(toNum(km.Tax1AmountM)));
    smReq.input("Tax2AmountM",           mssql.Money,            r2(toNum(km.Tax2AmountM)));
    smReq.input("Tax3AmountM",           mssql.Money,            r2(toNum(km.Tax3AmountM)));
    smReq.input("Tax1RateM",             mssql.Numeric(18, 2),   toNum(km.Tax1RateM));
    smReq.input("Tax2RateM",             mssql.Numeric(18, 2),   toNum(km.Tax2RateM));
    smReq.input("Tax3RateM",             mssql.Numeric(18, 2),   toNum(km.Tax3RateM));
    smReq.input("RoundOffAdj",           mssql.Money,            r2(toNum(km.RoundOffAdj)));
    smReq.input("DeliveryBoyID",         mssql.BigInt,           toInt(km.DeliveryBoyId, 0));
    smReq.input("Remarks",               mssql.VarChar(200),     "QR MENU PAYMENT");
    // Bill amount actually collected online (excludes service fee — that's
    // tracked separately in PaymentGateway.dbo.Payment.ServiceFeeAmount).
    smReq.input("OnlinePaymentAmount",   mssql.Money,            r2(toNum(km.Amount)));

    const smSql = `
      INSERT INTO ${T_SALESM} (
        ${q("SalesID")}, ${q("SalesManID")}, ${q("CounterNo")}, ${q("BillNo")},
        ${q("BillDate")}, ${q("BillTime")},
        ${q("CustomerID")}, ${q("PaymentMode")}, ${q("CreditCardNO")}, ${q("CreditCardTypeID")},
        ${q("Amount")}, ${q("CashAmount")}, ${q("CreditAmount")}, ${q("CreditCardAmount")},
        ${q("VoucherAmount")}, ${q("CoupenQty")}, ${q("OSBalance")},
        ${q("DiscountAmount")}, ${q("PostStatus")}, ${q("HoldStatus")},
        ${q("PaidAmount")}, ${q("BalancePaid")}, ${q("TransactionType")},
        ${q("PaidCurrency")}, ${q("StationID")}, ${q("DBLocation")},
        ${q("UploadStatusM")}, ${q("CounterCloseStatus")},
        ${q("CrBy")}, ${q("CrOn")}, ${q("ModBy")}, ${q("ModOn")},
        ${q("StaffID")}, ${q("WaiterID")}, ${q("TableID")}, ${q("AreaID")},
        ${q("HoldNo")}, ${q("NofCustomer")},
        ${q("ComplimentAmount")}, ${q("ServerStatus")}, ${q("SupervisorID")},
        ${q("CustomerLpoNo")}, ${q("QuotationNo")}, ${q("DONO")}, ${q("LocalBillNo")},
        ${q("DummyDiscountAmount")}, ${q("ReturnNo")}, ${q("Remarks")},
        ${q("PrintCount")}, ${q("ReceiptId")}, ${q("RStatusM")}, ${q("Prefix")},
        ${q("JobCardID")}, ${q("VehicleID")}, ${q("LPORefNo")}, ${q("EstimationNo")},
        ${q("InvoiceParty")}, ${q("ExcessAmount")},
        ${q("LabourDiscount")}, ${q("PartsDiscount")}, ${q("MiscellaneousDiscount")},
        ${q("SubletDiscount")}, ${q("LubricantDiscount")},
        ${q("LabourNet")}, ${q("PartsNet")}, ${q("MiscellaneousNet")},
        ${q("SubletNet")}, ${q("LubricantNet")},
        ${q("DeliveryBoyID")}, ${q("DeliveryTime")},
        ${q("SubTotalM")}, ${q("TaxableAmount")},
        ${q("Tax1AmountM")}, ${q("Tax2AmountM")}, ${q("Tax3AmountM")},
        ${q("Tax1RateM")}, ${q("Tax2RateM")}, ${q("Tax3RateM")},
        ${q("ReturnSalesID")}, ${q("RoundOffAdj")}, ${q("InvoiceNo")},
        ${q("OnlineMasterID")}, ${q("OnlinePaymentAmount")},
        ${q("LoyaltyUploadStatus")}, ${q("AgentTransactionID")}
      ) VALUES (
        @SalesID, @SalesManID, @CounterNo, @BillNo,
        GETDATE(), GETDATE(),
        @CustomerID, @PaymentMode, @CreditCardNO, @CreditCardTypeID,
        @Amount, 0, 0, 0,
        0, 0, 0,
        @DiscountAmount, @PostStatus, @HoldStatus,
        @PaidAmount, @BalancePaid, @TransactionType,
        @PaidCurrency, @StationID, @DBLocation,
        @UploadStatusM, @CounterCloseStatus,
        @CrBy, GETDATE(), @ModBy, GETDATE(),
        @StaffID, @WaiterID, @TableID, @AreaID,
        @HoldNo, @NofCustomer,
        0, @ServerStatus, 0,
        '0', 0, 0, 0,
        0, 0, @Remarks,
        0, 0, 'QR_PENDING', 'Q',
        0, 0, '0', '0',
        '0', 0,
        0, 0, 0,
        0, 0,
        0, 0, 0,
        0, 0,
        @DeliveryBoyID, GETDATE(),
        @SubTotalM, @TaxableAmount,
        @Tax1AmountM, @Tax2AmountM, @Tax3AmountM,
        @Tax1RateM, @Tax2RateM, @Tax3RateM,
        0, @RoundOffAdj, '0',
        0, @OnlinePaymentAmount,
        ' ', 0
      )
    `;

    await smReq.query(smSql);
    console.log(`[SETTLEMENT] SalesMaster inserted: SalesID=${salesID}, BillNo=${billNo}`);

    /* ---- 5b. Insert SalesPaymentSplit — records the online payment + tip ---- */
    const spsReq = new mssql.Request(tx);
    spsReq.input("SalesID",       mssql.BigInt,       salesID);
    spsReq.input("PayerNo",       mssql.Int,          1);
    spsReq.input("PayMode",       mssql.VarChar(20),  "ONLINE");
    spsReq.input("BillAmount",    mssql.Money,        r2(toNum(km.Amount)));
    spsReq.input("TipAmount",     mssql.Money,        tipAmount);
    spsReq.input("RefNo",         mssql.VarChar(100), "QR MENU");
    spsReq.input("StationID",     mssql.BigInt,       toInt(km.StationID, 0));
    spsReq.input("CounterID",     mssql.BigInt,       counterNo);
    spsReq.input("StaffID",       mssql.BigInt,       0);
    spsReq.input("SalesManID",    mssql.BigInt,       toInt(km.SalesManID, 0));
    spsReq.input("CounterCloseStatus", mssql.VarChar(20), "PENDING");
    spsReq.input("CreditCardTypeID",   mssql.BigInt,      0);

    await spsReq.query(`
      INSERT INTO ${T_SALESPS} (
        ${q("SalesID")}, ${q("PayerNo")}, ${q("PayMode")},
        ${q("BillAmount")}, ${q("TipAmount")}, ${q("RefNo")},
        ${q("StationID")}, ${q("CounterID")}, ${q("StaffID")}, ${q("SalesManID")},
        ${q("PayDate")}, ${q("IsCancelled")}, ${q("CounterCloseStatus")}, ${q("CreditCardTypeID")}
      ) VALUES (
        @SalesID, @PayerNo, @PayMode,
        @BillAmount, @TipAmount, @RefNo,
        @StationID, @CounterID, @StaffID, @SalesManID,
        GETDATE(), 0, @CounterCloseStatus, @CreditCardTypeID
      )
    `);
    console.log(`[SETTLEMENT] SalesPaymentSplit inserted: SalesID=${salesID}, TipAmount=${tipAmount}`);

    /* ---- 6. Insert SalesChild for each KOTChild ---- */
    let salesChildCount = 0;

    for (const kc of kotChildren) {
      const salesChildID = await getNextIdTx("SalesChild", tx);

      const scReq = new mssql.Request(tx);
      scReq.input("SalesChildID",         mssql.BigInt,           salesChildID);
      scReq.input("SalesID",              mssql.BigInt,           salesID);
      scReq.input("ProductID",            mssql.BigInt,           toInt(kc.ProductID, 0));
      scReq.input("SerialNo",             mssql.VarChar(100),     "0");
      scReq.input("UniqueMultiProductID", mssql.BigInt,           toInt(kc.UniqueProductID, 0));
      scReq.input("ShortDescription",     mssql.VarChar(50),      toStr(kc.ShortDescription, "0").substring(0, 50));
      scReq.input("GroupID",              mssql.BigInt,           toInt(kc.GroupID, 0));
      scReq.input("Qty",                  mssql.Numeric(19, 4),   toNum(kc.Qty, 0));
      scReq.input("UnitPrice",            mssql.Money,            r2(toNum(kc.UnitPrice)));
      scReq.input("UnitCost",             mssql.Money,            r2(toNum(kc.UnitCost)));
      scReq.input("PackQty",              mssql.Numeric(18, 4),   toNum(kc.PackQty, 0));
      scReq.input("Discount",             mssql.Money,            r2(toNum(kc.ItemDiscount)));
      scReq.input("LineTotal",            mssql.Money,            r2(toNum(kc.LineTotal)));
      scReq.input("HasBarCode",           mssql.VarChar(25),      toStr(kc.BarCode, "0").substring(0, 25));
      scReq.input("ArabicDescription",    mssql.NVarChar(200),    toStr(kc.DescriptionArabic, "0").substring(0, 200));
      scReq.input("DummyQty",             mssql.Numeric(19, 4),   toNum(kc.Qty, 0));
      scReq.input("DummyPrice",           mssql.Money,            r2(toNum(kc.UnitPrice)));
      scReq.input("DummyDiscount",        mssql.Money,            r2(toNum(kc.ItemDiscount)));
      scReq.input("Tax1AmountC",          mssql.Money,            r2(toNum(kc.Tax1AmountC)));
      scReq.input("Tax2AmountC",          mssql.Money,            r2(toNum(kc.Tax2AmountC)));
      scReq.input("Tax3AmountC",          mssql.Money,            r2(toNum(kc.Tax3AmountC)));
      scReq.input("Tax1RateC",            mssql.Numeric(18, 2),   toNum(kc.Tax1RateC));
      scReq.input("Tax2RateC",            mssql.Numeric(18, 2),   toNum(kc.Tax2RateC));
      scReq.input("Tax3RateC",            mssql.Numeric(18, 2),   toNum(kc.Tax3RateC));
      scReq.input("SubTotalC",            mssql.Numeric(18, 2),   toNum(kc.SubTotalC));
      scReq.input("Modifier",             mssql.VarChar(mssql.MAX), toStr(kc.Modifier, " "));

      const scSql = `
        INSERT INTO ${T_SALESC} (
          ${q("SalesChildID")}, ${q("SalesID")}, ${q("ProductID")},
          ${q("SerialNo")}, ${q("UniqueMultiProductID")}, ${q("ShortDescription")},
          ${q("GroupID")}, ${q("Qty")}, ${q("UnitPrice")}, ${q("UnitCost")},
          ${q("PackQty")}, ${q("Discount")}, ${q("LineTotal")},
          ${q("PostStatus")}, ${q("StockOnHand")}, ${q("HasBarCode")},
          ${q("StationID")}, ${q("UploadStatusC")},
          ${q("CrBy")}, ${q("CrOn")}, ${q("ModBy")}, ${q("ModOn")},
          ${q("SupplierID")}, ${q("ArabicDescription")},
          ${q("DummyQty")}, ${q("DummyPrice")}, ${q("Unit")}, ${q("PacketDetails")},
          ${q("DummyDiscount")}, ${q("QuotationID")}, ${q("DOID")},
          ${q("RStatusC")}, ${q("ItemType")}, ${q("ProductCode")},
          ${q("Tax1AmountC")}, ${q("Tax2AmountC")}, ${q("Tax3AmountC")},
          ${q("Tax1RateC")}, ${q("Tax2RateC")}, ${q("Tax3RateC")},
          ${q("SubTotalC")}, ${q("Modifier")}, ${q("ServerStatusC")}
        ) VALUES (
          @SalesChildID, @SalesID, @ProductID,
          @SerialNo, @UniqueMultiProductID, @ShortDescription,
          @GroupID, @Qty, @UnitPrice, @UnitCost,
          @PackQty, @Discount, @LineTotal,
          'POSTED', 0, @HasBarCode,
          0, 'PENDING',
          'QR MENU', GETDATE(), 'QR MENU', GETDATE(),
          0, @ArabicDescription,
          @DummyQty, @DummyPrice, '0', '0',
          @DummyDiscount, 0, 0,
          '0', '0', '0',
          @Tax1AmountC, @Tax2AmountC, @Tax3AmountC,
          @Tax1RateC, @Tax2RateC, @Tax3RateC,
          @SubTotalC, @Modifier, 'POSTED'
        )
      `;

      await scReq.query(scSql);
      salesChildCount++;
    }

    console.log(`[SETTLEMENT] SalesChild inserted: ${salesChildCount} rows`);

    /* ---- 7. Delete KOTMaster (trigger cascades KOTChild deletion) ---- */
    const delReq = new mssql.Request(tx);
    delReq.input("kotMasterID", mssql.BigInt, kmID);
    await delReq.query(`DELETE FROM ${T_KOTM} WHERE ${q("kotMasterID")} = @kotMasterID`);

    console.log(`[SETTLEMENT] KOTMaster deleted: kotMasterID=${kmID}`);

    await tx.commit();

    console.log(`[SETTLEMENT] ✅ Settlement complete: kotMasterID=${kmID} → SalesID=${salesID}, BillNo=${billNo}, ${salesChildCount} items`);

    return { salesID, billNo, salesChildCount };

  } catch (err) {
    await tx.rollback();
    console.error(`[SETTLEMENT] ❌ Settlement failed for kotMasterID=${kmID}:`, err.message, err.stack);
    throw err;
  }
}
