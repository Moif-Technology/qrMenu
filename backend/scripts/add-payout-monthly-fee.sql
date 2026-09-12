-- Adds the optional per-settlement monthly fee to dbo.PayoutStatus.
-- Database: PaymentGateway
--
-- The batch tables were dropped in simplify-payout-batch.sql, so a batch has no
-- row of its own: the same value is stamped onto every PayoutStatus row of the
-- batch, exactly like TransferRef / TransferDate already are, and read back with
-- MAX() by the grouped settlement query. Never SUM() these columns.
--
-- MonthlyFeeVat holds the VAT AMOUNT as charged, not a rate or a flag, so a
-- settled statement keeps its own numbers if the VAT rate ever changes. Both
-- NULL (the default for every existing row) means no monthly fee was charged
-- and the statement omits the line entirely.

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PayoutStatus') AND name = 'MonthlyFeeAmount')
BEGIN
    ALTER TABLE dbo.PayoutStatus ADD MonthlyFeeAmount money NULL;
    PRINT 'Added MonthlyFeeAmount column to dbo.PayoutStatus';
END
ELSE
    PRINT 'MonthlyFeeAmount column already exists on dbo.PayoutStatus';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PayoutStatus') AND name = 'MonthlyFeeVat')
BEGIN
    ALTER TABLE dbo.PayoutStatus ADD MonthlyFeeVat money NULL;
    PRINT 'Added MonthlyFeeVat column to dbo.PayoutStatus';
END
ELSE
    PRINT 'MonthlyFeeVat column already exists on dbo.PayoutStatus';
GO

PRINT 'Payout monthly fee columns completed!';
