// Adds PaymentGateway.dbo.Payment.PaidBillAmount (money, NULL) to prod + both
// local instances, then backfills existing rows with the pure bill share paid:
//   PaidBillAmount = PaidAmount - ISNULL(ServiceFeeAmount,0) - ISNULL(TipAmount,0)
// Idempotent: column add + backfill guarded so re-running is safe.
import mssql from "mssql";

const TARGETS = [
  { name: "PROD moifopaia", cfg: { user: "sa", password: "gtarc", server: "moifopaia.selfip.com", port: 1433, database: "PaymentGateway", options: { encrypt: false, trustServerCertificate: true } } },
  { name: "LOCAL MOIF2019", cfg: { user: "sa", password: "motech", server: "MOIF", database: "PaymentGateway", options: { encrypt: false, trustServerCertificate: true, instanceName: "SQLEXPRESS2019" } } },
  { name: "LOCAL SB",       cfg: { user: "sa", password: "gtarc",  server: "SB",   database: "PaymentGateway", options: { encrypt: false, trustServerCertificate: true, instanceName: "SQLEXPRESS" } } },
];

const ADD_COL = `
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_NAME='Payment' AND COLUMN_NAME='PaidBillAmount' AND TABLE_SCHEMA='dbo')
    ALTER TABLE dbo.Payment ADD PaidBillAmount money NULL;
`;
const BACKFILL = `
  UPDATE dbo.Payment
  SET PaidBillAmount = PaidAmount - ISNULL(ServiceFeeAmount,0) - ISNULL(TipAmount,0)
  WHERE PaidBillAmount IS NULL;
`;

async function run({ name, cfg }) {
  const pool = await new mssql.ConnectionPool(cfg).connect();
  await pool.request().batch(ADD_COL);
  const r = await pool.request().query(BACKFILL);
  const rows = r.rowsAffected?.[0] ?? 0;
  const chk = await pool.request().query("SELECT COUNT(*) total, SUM(CASE WHEN PaidBillAmount IS NULL THEN 1 ELSE 0 END) stillNull FROM dbo.Payment");
  console.log(`${name}: column ensured, backfilled ${rows} rows | total=${chk.recordset[0].total} stillNull=${chk.recordset[0].stillNull}`);
  await pool.close();
}

async function main() {
  for (const t of TARGETS) {
    try { await run(t); }
    catch (e) { console.error(`${t.name}: FAILED -> ${e.message}`); }
  }
  process.exit(0);
}
main();
