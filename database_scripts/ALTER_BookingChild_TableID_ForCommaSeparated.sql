-- ============================================================
-- Enable comma-separated TableID in BookingChild (e.g. "66,67")
-- Run this in SQL Server Management Studio against Moifcore DB
-- ============================================================

USE [Moifcore]
GO

-- Step 1: Check current column type (skip if already nvarchar)
IF EXISTS (
  SELECT 1 FROM sys.columns c
  INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
  WHERE c.object_id = OBJECT_ID('dbo.BookingChild') 
    AND c.name = 'TableID' 
    AND t.name = 'bigint'
)
BEGIN
  PRINT 'TableID is bigint. Proceeding with conversion to nvarchar(200)...';

  -- Step 2: Drop foreign key if it exists (FK would block the ALTER)
  DECLARE @fkName NVARCHAR(200);
  SELECT @fkName = fk.name
  FROM sys.foreign_keys fk
  INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
  INNER JOIN sys.columns c ON fkc.parent_column_id = c.column_id AND fkc.parent_object_id = c.object_id
  WHERE OBJECT_NAME(fkc.parent_object_id) = 'BookingChild' AND c.name = 'TableID';

  IF @fkName IS NOT NULL
  BEGIN
    EXEC('ALTER TABLE dbo.BookingChild DROP CONSTRAINT ' + @fkName);
    PRINT 'Dropped FK: ' + @fkName;
  END
  ELSE
    PRINT 'No FK on TableID found.';

  -- Step 3: Drop index if exists
  IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BookingChild_TableID' AND object_id = OBJECT_ID('dbo.BookingChild'))
  BEGIN
    DROP INDEX [IX_BookingChild_TableID] ON [dbo].[BookingChild];
    PRINT 'Dropped index IX_BookingChild_TableID';
  END

  -- Step 4: Alter column from bigint to nvarchar(200)
  -- Existing values: 66 -> '66', 67 -> '67'
  ALTER TABLE [dbo].[BookingChild]
    ALTER COLUMN [TableID] [nvarchar](200) NOT NULL;
  PRINT 'TableID altered to nvarchar(200).';

  -- Step 5: Recreate index
  CREATE NONCLUSTERED INDEX [IX_BookingChild_TableID] 
    ON [dbo].[BookingChild] ([TableID] ASC);
  PRINT 'Index IX_BookingChild_TableID recreated.';

  PRINT 'Done! BookingChild.TableID can now store comma-separated values like "66,67".';
END
ELSE
  PRINT 'TableID is already nvarchar. No changes needed.';

GO
