-- ============================================================
-- Script   : 10_ADD_QrPayment_Columns_KOTMaster.sql
-- Database : Moifcore
-- Table    : dbo.KOTMaster
-- Purpose  : Add QR-menu payment tracking columns so the
--            backend can record how much of the KOT has been
--            paid via the QR menu, the remaining balance, and
--            the overall payment status.
--
-- New Columns
-- -----------
--   QrPaidAmount    money        NOT NULL  DEFAULT 0
--       Running total of all QR menu payments received for
--       this KOT.  Updated after every partial or full
--       payment from the QR menu service.
--
--   QrBalanceAmount money        NOT NULL  DEFAULT = Amount
--       Remaining unpaid balance.
--       Formula: QrBalanceAmount = Amount - QrPaidAmount
--       Initialised to 0 here; the application sets it
--       correctly on first payment.
--
--   QrPaymentStatus varchar(20)  NOT NULL  DEFAULT 'PENDING'
--       Lifecycle status of QR payments for this KOT.
--       Valid values:
--           'PENDING'  – no payment received yet
--           'PARTIAL'  – at least one payment received but
--                        balance still outstanding
--           'PAID'     – fully settled via QR menu
--
-- Run order: after all previous scripts (09_*) have been
--            applied to Moifcore.
--
-- Safe to re-run: each ALTER is wrapped in an existence check.
-- ============================================================

USE [Moifcore]
GO

PRINT '========================================';
PRINT 'QR Menu - KOTMaster Payment Columns';
PRINT '========================================';
PRINT '';

-- ----------------------------------------------------------
-- 1. QrPaidAmount
-- ----------------------------------------------------------
IF NOT EXISTS (
    SELECT 1
    FROM   sys.columns
    WHERE  object_id = OBJECT_ID(N'dbo.KOTMaster')
      AND  name      = N'QrPaidAmount'
)
BEGIN
    ALTER TABLE [dbo].[KOTMaster]
        ADD [QrPaidAmount] [money] NOT NULL
        CONSTRAINT [DF_KOTMaster_QrPaidAmount] DEFAULT (0);

    PRINT '  [OK] Column QrPaidAmount added to dbo.KOTMaster';
END
ELSE
BEGIN
    PRINT '  [SKIP] Column QrPaidAmount already exists';
END
GO

-- ----------------------------------------------------------
-- 2. QrBalanceAmount
-- ----------------------------------------------------------
IF NOT EXISTS (
    SELECT 1
    FROM   sys.columns
    WHERE  object_id = OBJECT_ID(N'dbo.KOTMaster')
      AND  name      = N'QrBalanceAmount'
)
BEGIN
    ALTER TABLE [dbo].[KOTMaster]
        ADD [QrBalanceAmount] [money] NOT NULL
        CONSTRAINT [DF_KOTMaster_QrBalanceAmount] DEFAULT (0);

    PRINT '  [OK] Column QrBalanceAmount added to dbo.KOTMaster';
END
ELSE
BEGIN
    PRINT '  [SKIP] Column QrBalanceAmount already exists';
END
GO

-- ----------------------------------------------------------
-- 3. QrPaymentStatus
-- ----------------------------------------------------------
IF NOT EXISTS (
    SELECT 1
    FROM   sys.columns
    WHERE  object_id = OBJECT_ID(N'dbo.KOTMaster')
      AND  name      = N'QrPaymentStatus'
)
BEGIN
    ALTER TABLE [dbo].[KOTMaster]
        ADD [QrPaymentStatus] [varchar](20) NOT NULL
        CONSTRAINT [DF_KOTMaster_QrPaymentStatus] DEFAULT ('PENDING');

    PRINT '  [OK] Column QrPaymentStatus added to dbo.KOTMaster';
END
ELSE
BEGIN
    PRINT '  [SKIP] Column QrPaymentStatus already exists';
END
GO

-- ----------------------------------------------------------
-- 4. Back-fill QrBalanceAmount for existing open KOTs
--    so that Amount = QrBalanceAmount when nothing has
--    been paid yet (new rows already default to 0, but
--    for existing rows 0 is also correct because no QR
--    payment has been made against them).
-- ----------------------------------------------------------
PRINT '';
PRINT '  Back-filling QrBalanceAmount for existing KOTs...';
GO

UPDATE [dbo].[KOTMaster]
SET    [QrBalanceAmount] = [Amount]
WHERE  [QrPaidAmount]    = 0
  AND  [QrPaymentStatus] = 'PENDING'
  AND  [QrBalanceAmount] = 0;

PRINT '  [OK] Back-fill complete';
GO

PRINT '';
PRINT '========================================';
PRINT 'Script 10 completed successfully.';
PRINT '========================================';
GO
