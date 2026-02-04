-- Store comma-separated table IDs in existing TableID column (e.g. "66,67")
-- One reservation = one BookingChild row; TableID holds "66" or "66,67"
USE [Moifcore]
GO

-- Drop index so we can alter column type
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BookingChild_TableID' AND object_id = OBJECT_ID('dbo.BookingChild'))
    DROP INDEX [IX_BookingChild_TableID] ON [dbo].[BookingChild];
GO

-- Alter TableID from bigint to nvarchar(200); existing values (66) become '66'
ALTER TABLE [dbo].[BookingChild]
    ALTER COLUMN [TableID] [nvarchar](200) NOT NULL;
GO

-- Recreate index
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BookingChild_TableID' AND object_id = OBJECT_ID('dbo.BookingChild'))
    CREATE NONCLUSTERED INDEX [IX_BookingChild_TableID] 
        ON [dbo].[BookingChild] ([TableID] ASC);
GO

PRINT 'BookingChild.TableID altered to NVARCHAR(200) for comma-separated table IDs.';
GO
