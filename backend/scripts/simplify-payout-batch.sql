-- Simplifies the payout batch design: drops the separate PayoutBatch /
-- PayoutBatchCounter tables in favor of a single BatchNo column on
-- dbo.PayoutStatus, numbered by a native SQL SEQUENCE (no counter table
-- needed - SEQUENCE is already atomic/concurrency-safe).
-- Database: PaymentGateway

IF OBJECT_ID('dbo.PayoutBatch', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.PayoutBatch;
    PRINT 'Dropped dbo.PayoutBatch';
END
GO

IF OBJECT_ID('dbo.PayoutBatchCounter', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.PayoutBatchCounter;
    PRINT 'Dropped dbo.PayoutBatchCounter';
END
GO

IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PayoutStatus_BatchID' AND object_id = OBJECT_ID('dbo.PayoutStatus'))
BEGIN
    DROP INDEX IX_PayoutStatus_BatchID ON dbo.PayoutStatus;
    PRINT 'Dropped index IX_PayoutStatus_BatchID';
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PayoutStatus') AND name = 'BatchID')
BEGIN
    ALTER TABLE dbo.PayoutStatus DROP COLUMN BatchID;
    PRINT 'Dropped BatchID column from dbo.PayoutStatus';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PayoutStatus') AND name = 'BatchNo')
BEGIN
    ALTER TABLE dbo.PayoutStatus ADD BatchNo bigint NULL;
    CREATE INDEX IX_PayoutStatus_BatchNo ON dbo.PayoutStatus(BatchNo);
    PRINT 'Added BatchNo column to dbo.PayoutStatus';
END
ELSE
    PRINT 'BatchNo column already exists on dbo.PayoutStatus';
GO

IF NOT EXISTS (SELECT * FROM sys.sequences WHERE name = 'PayoutBatchSeq' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE SEQUENCE dbo.PayoutBatchSeq AS BIGINT START WITH 1 INCREMENT BY 1;
    PRINT 'Created dbo.PayoutBatchSeq';
END
ELSE
    PRINT 'dbo.PayoutBatchSeq already exists';
GO

PRINT 'Payout batch simplification completed!';
