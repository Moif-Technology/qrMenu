-- Fix typo in BookingMaster: AdavncePayment -> AdvancePayment
USE [Moifcore]
GO

-- Check if column exists before renaming
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'AdavncePayment')
BEGIN
    EXEC sp_rename 'BookingMaster.AdavncePayment', 'AdvancePayment', 'COLUMN';
    PRINT 'Column renamed successfully: AdavncePayment -> AdvancePayment';
END
ELSE
BEGIN
    PRINT 'Column AdavncePayment does not exist or already renamed.';
END
GO

