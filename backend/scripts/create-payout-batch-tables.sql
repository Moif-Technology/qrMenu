-- SQL Script to create payout batch-grouping tables
-- Database: PaymentGateway
-- No FK/CHECK constraints, matching this schema's existing convention
-- (dbo.PayoutStatus.BatchID logically references dbo.PayoutBatch.BatchID,
-- but is intentionally not FK-enforced).

-- PayoutBatchCounter - one row per BatchCode prefix, incremented under
-- UPDLOCK+HOLDLOCK at batch-creation time to avoid races between admins.
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PayoutBatchCounter]') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[PayoutBatchCounter] (
        [BatchCode] varchar(10) NOT NULL PRIMARY KEY,
        [LastNo]    int         NOT NULL
    );
    PRINT 'Created dbo.PayoutBatchCounter';
END
ELSE
    PRINT 'dbo.PayoutBatchCounter already exists';
GO

IF NOT EXISTS (SELECT * FROM [dbo].[PayoutBatchCounter] WHERE [BatchCode] = 'B')
BEGIN
    INSERT INTO [dbo].[PayoutBatchCounter] ([BatchCode], [LastNo]) VALUES ('B', 0);
    PRINT 'Seeded PayoutBatchCounter row for BatchCode = B';
END
ELSE
    PRINT 'PayoutBatchCounter row for B already exists';
GO

-- PayoutBatch - one row per created batch. Deliberately no Status/TotalAmount
-- column: both are derived at query time from member PayoutStatus rows so
-- they can never drift from the real per-payment transfer state.
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PayoutBatch]') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[PayoutBatch] (
        [BatchID]   bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [BatchCode] varchar(10)   NOT NULL,
        [BatchNo]   int           NOT NULL,
        [CreatedBy] nvarchar(100) NOT NULL,
        [CreatedAt] datetime2     NOT NULL
    );
    CREATE INDEX IX_PayoutBatch_Code_No ON [dbo].[PayoutBatch]([BatchCode], [BatchNo]);
    PRINT 'Created dbo.PayoutBatch';
END
ELSE
    PRINT 'dbo.PayoutBatch already exists';
GO

-- dbo.PayoutStatus.BatchID - nullable, no FK (matches this DB's convention).
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PayoutStatus]') AND name = 'BatchID')
BEGIN
    ALTER TABLE [dbo].[PayoutStatus] ADD [BatchID] bigint NULL;
    CREATE INDEX IX_PayoutStatus_BatchID ON [dbo].[PayoutStatus]([BatchID]);
    PRINT 'Added BatchID column to dbo.PayoutStatus';
END
ELSE
    PRINT 'BatchID column already exists on dbo.PayoutStatus';
GO

PRINT 'Payout batch table creation script completed!';
