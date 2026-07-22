-- Adds PlatformFeeAmount to dbo.Payment: flat AED 0.50 DeynoQR platform
-- commission taken from the restaurant (not the customer), charged on every
-- payment row (Pay Full and every split leg), unconditionally.
-- Existing rows backfill to 0 automatically via the DEFAULT constraint.

USE [PaymentGateway]
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Payment]') AND name = 'PlatformFeeAmount')
BEGIN
    ALTER TABLE [dbo].[Payment]
    ADD [PlatformFeeAmount] [money] NOT NULL
    CONSTRAINT [DF_Payment_PlatformFeeAmount] DEFAULT (0);

    PRINT 'Added PlatformFeeAmount column to dbo.Payment';
END
ELSE
BEGIN
    PRINT 'PlatformFeeAmount column already exists in dbo.Payment';
END
GO

PRINT 'Script completed successfully. PlatformFeeAmount added to dbo.Payment.';
GO
