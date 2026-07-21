-- ===== Sync script for Moifcore (SB\SQLEXPRESS target) =====
-- Generated from MOIF\SQLEXPRESS2019 source. REVIEW BEFORE RUNNING.

-- Missing table: AppLog
CREATE TABLE [dbo].[AppLog] (
  [LogID] bigint IDENTITY(1,1) NOT NULL,
  [LogTime] datetime2 NOT NULL,
  [AppName] varchar(30) NULL,
  [Module] varchar(80) NULL,
  [ActionType] varchar(80) NULL,
  [Message] nvarchar(4000) NULL,
  [StationID] int NULL,
  [CounterID] int NULL,
  [StaffID] int NULL,
  [StaffName] nvarchar(100) NULL,
  [EntityType] varchar(40) NULL,
  [EntityID] bigint NULL,
  [RefNo] nvarchar(60) NULL,
  [Details] nvarchar(MAX) NULL,
  CONSTRAINT [PK_AppLog] PRIMARY KEY ([LogID])
);

-- Missing column: PackageItems.GroupLabel
ALTER TABLE [dbo].[PackageItems] ADD [GroupLabel] nvarchar(100) NULL;

-- KOTMaster.QrPaidAmount / QrBalanceAmount / QrPaymentStatus: source is NOT NULL,
-- target allows NULL. 1 row (ID=242847) currently null in target — backfill before ALTER.
UPDATE [dbo].[KOTMaster]
SET QrPaidAmount = 0,
    QrBalanceAmount = Amount,
    QrPaymentStatus = 'PENDING'
WHERE QrPaidAmount IS NULL OR QrBalanceAmount IS NULL OR QrPaymentStatus IS NULL;

ALTER TABLE [dbo].[KOTMaster] ALTER COLUMN [QrPaidAmount] money NOT NULL;
ALTER TABLE [dbo].[KOTMaster] ALTER COLUMN [QrBalanceAmount] money NOT NULL;
ALTER TABLE [dbo].[KOTMaster] ALTER COLUMN [QrPaymentStatus] varchar(20) NOT NULL;
