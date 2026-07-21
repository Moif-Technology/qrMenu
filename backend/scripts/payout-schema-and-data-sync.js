// backend/scripts/payout-schema-and-data-sync.js
// One-off: creates the payout tables on SB\SQLEXPRESS (the DB the merged
// backend now points at) if missing, then copies DashboardUsers,
// RestaurantMaster and ServiceFeeConfig rows over from MOIF\SQLEXPRESS2019
// (where the original qrmenu-dashboard was set up). Idempotent - safe to
// re-run, skips rows that already exist on the target.
import mssql from "mssql";

const SOURCE = { server: "MOIF\\SQLEXPRESS2019", user: "sa", password: "motech" };
const TARGET = { server: "SB\\SQLEXPRESS", user: "sa", password: "gtarc" };

function buildConfig(base, database) {
  const [host, instanceName] = base.server.split("\\");
  return {
    user: base.user,
    password: base.password,
    server: host,
    database,
    options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true, instanceName },
    connectionTimeout: 15000,
    requestTimeout: 30000
  };
}

async function ensureSchema(target) {
  const ddl = `
IF OBJECT_ID('dbo.DashboardUsers') IS NULL
CREATE TABLE [dbo].[DashboardUsers] (
  [UserID] bigint IDENTITY(1,1) NOT NULL,
  [Username] varchar(100) NOT NULL,
  [PasswordHash] varchar(200) NOT NULL,
  [Role] varchar(20) NOT NULL,
  [ShopID] bigint NULL,
  [DisplayName] nvarchar(200) NULL,
  [Status] varchar(20) NOT NULL,
  [CreatedAt] datetime2 NOT NULL,
  CONSTRAINT [PK_DashboardUsers] PRIMARY KEY ([UserID])
);

IF OBJECT_ID('dbo.PaymentAttempts') IS NULL
CREATE TABLE [dbo].[PaymentAttempts] (
  [AttemptID] bigint IDENTITY(1,1) NOT NULL,
  [ShopID] bigint NOT NULL,
  [TransID] bigint NULL,
  [TableID] bigint NULL,
  [Amount] money NULL,
  [Mode] varchar(30) NULL,
  [Status] varchar(20) NOT NULL,
  [OrderRef] nvarchar(100) NULL,
  [CreatedAt] datetime2 NOT NULL,
  CONSTRAINT [PK_PaymentAttempts] PRIMARY KEY ([AttemptID])
);

IF OBJECT_ID('dbo.PayoutStatus') IS NULL
CREATE TABLE [dbo].[PayoutStatus] (
  [PayoutID] bigint IDENTITY(1,1) NOT NULL,
  [PaymentID] bigint NOT NULL,
  [ShopID] bigint NOT NULL,
  [Amount] money NOT NULL,
  [Status] varchar(20) NOT NULL,
  [ApprovedBy] nvarchar(100) NULL,
  [ApprovedAt] datetime2 NULL,
  [TransferRef] nvarchar(200) NULL,
  [TransferDate] date NULL,
  [TransferredBy] nvarchar(100) NULL,
  [Notes] nvarchar(500) NULL,
  [UpdatedAt] datetime2 NOT NULL,
  CONSTRAINT [PK_PayoutStatus] PRIMARY KEY ([PayoutID])
);

IF OBJECT_ID('dbo.RestaurantMaster') IS NULL
CREATE TABLE [dbo].[RestaurantMaster] (
  [RestaurantID] bigint NOT NULL,
  [Slug] varchar(50) NOT NULL,
  [Name] nvarchar(200) NOT NULL,
  [ContactPerson] nvarchar(200) NULL,
  [ContactPhone] varchar(50) NULL,
  [BankName] nvarchar(200) NULL,
  [BankAccount] nvarchar(100) NULL,
  [BankIBAN] nvarchar(100) NULL,
  [Status] varchar(20) NOT NULL,
  [CreatedAt] datetime2 NOT NULL,
  CONSTRAINT [PK_RestaurantMaster] PRIMARY KEY ([RestaurantID])
);

IF OBJECT_ID('dbo.ServiceFeeConfig') IS NULL
CREATE TABLE [dbo].[ServiceFeeConfig] (
  [ID] int NOT NULL,
  [RatePercent] decimal(5,2) NOT NULL,
  [UpdatedBy] varchar(50) NULL,
  [UpdatedOn] datetime NOT NULL,
  CONSTRAINT [PK_ServiceFeeConfig] PRIMARY KEY ([ID])
);

IF COL_LENGTH('dbo.Payment', 'CreatedAt') IS NULL
ALTER TABLE [dbo].[Payment] ADD [CreatedAt] datetime2 NULL;
`;
  // mssql can't run multiple batches with GO separators in one request;
  // these statements don't need GO since each is self-contained IF/CREATE.
  const batches = ddl.split(/\n(?=IF )/).map(b => b.trim()).filter(Boolean);
  for (const batch of batches) {
    await target.request().query(batch);
  }
  console.log("[SCHEMA] Payout tables ensured on target.");
}

async function copyDashboardUsers(source, target) {
  const rows = (await source.request().query(
    `SELECT Username, PasswordHash, Role, ShopID, DisplayName, Status, CreatedAt FROM dbo.DashboardUsers`
  )).recordset;

  let copied = 0, skipped = 0;
  for (const r of rows) {
    const existing = await target.request()
      .input("username", r.Username)
      .query(`SELECT UserID FROM dbo.DashboardUsers WHERE Username = @username`);
    if (existing.recordset.length) { skipped++; continue; }

    await target.request()
      .input("username", r.Username)
      .input("hash", r.PasswordHash)
      .input("role", r.Role)
      .input("shopId", mssql.BigInt, r.ShopID)
      .input("displayName", r.DisplayName)
      .input("status", r.Status)
      .input("createdAt", mssql.DateTime2, r.CreatedAt)
      .query(`INSERT INTO dbo.DashboardUsers (Username, PasswordHash, Role, ShopID, DisplayName, Status, CreatedAt)
              VALUES (@username, @hash, @role, @shopId, @displayName, @status, @createdAt)`);
    copied++;
  }
  console.log(`[DashboardUsers] copied ${copied}, skipped ${skipped} (already existed).`);
}

async function copyRestaurantMaster(source, target) {
  const rows = (await source.request().query(`SELECT * FROM dbo.RestaurantMaster`)).recordset;

  let copied = 0, skipped = 0;
  for (const r of rows) {
    const existing = await target.request()
      .input("id", mssql.BigInt, r.RestaurantID)
      .query(`SELECT RestaurantID FROM dbo.RestaurantMaster WHERE RestaurantID = @id`);
    if (existing.recordset.length) { skipped++; continue; }

    await target.request()
      .input("id", mssql.BigInt, r.RestaurantID)
      .input("slug", r.Slug)
      .input("name", r.Name)
      .input("contactPerson", r.ContactPerson)
      .input("contactPhone", r.ContactPhone)
      .input("bankName", r.BankName)
      .input("bankAccount", r.BankAccount)
      .input("bankIban", r.BankIBAN)
      .input("status", r.Status)
      .input("createdAt", mssql.DateTime2, r.CreatedAt)
      .query(`INSERT INTO dbo.RestaurantMaster
                (RestaurantID, Slug, Name, ContactPerson, ContactPhone, BankName, BankAccount, BankIBAN, Status, CreatedAt)
              VALUES
                (@id, @slug, @name, @contactPerson, @contactPhone, @bankName, @bankAccount, @bankIban, @status, @createdAt)`);
    copied++;
  }
  console.log(`[RestaurantMaster] copied ${copied}, skipped ${skipped} (already existed).`);
}

async function copyServiceFeeConfig(source, target) {
  const rows = (await source.request().query(`SELECT * FROM dbo.ServiceFeeConfig`)).recordset;

  let copied = 0, skipped = 0;
  for (const r of rows) {
    const existing = await target.request()
      .input("id", mssql.Int, r.ID)
      .query(`SELECT ID FROM dbo.ServiceFeeConfig WHERE ID = @id`);
    if (existing.recordset.length) { skipped++; continue; }

    await target.request()
      .input("id", mssql.Int, r.ID)
      .input("rate", mssql.Decimal(5, 2), r.RatePercent)
      .input("updatedBy", r.UpdatedBy)
      .input("updatedOn", mssql.DateTime, r.UpdatedOn)
      .query(`INSERT INTO dbo.ServiceFeeConfig (ID, RatePercent, UpdatedBy, UpdatedOn)
              VALUES (@id, @rate, @updatedBy, @updatedOn)`);
    copied++;
  }
  console.log(`[ServiceFeeConfig] copied ${copied}, skipped ${skipped} (already existed).`);
}

async function main() {
  const source = await new mssql.ConnectionPool(buildConfig(SOURCE, "PaymentGateway")).connect();
  const target = await new mssql.ConnectionPool(buildConfig(TARGET, "PaymentGateway")).connect();

  await ensureSchema(target);
  await copyDashboardUsers(source, target);
  await copyRestaurantMaster(source, target);
  await copyServiceFeeConfig(source, target);

  await source.close();
  await target.close();
  console.log("\nDone.");
  process.exit(0);
}

main().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
