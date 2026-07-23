-- Adds ScheduledDate to dbo.PayoutStatus: the Tuesday a payment is
-- earmarked to go out in, set when a payment is marked SCHEDULED.
-- Database: PaymentGateway

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PayoutStatus') AND name = 'ScheduledDate')
BEGIN
    ALTER TABLE dbo.PayoutStatus ADD ScheduledDate date NULL;
    PRINT 'Added ScheduledDate column to dbo.PayoutStatus';
END
ELSE
    PRINT 'ScheduledDate column already exists on dbo.PayoutStatus';
GO
