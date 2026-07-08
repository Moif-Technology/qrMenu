-- Add GroupLabel to PackageItems junction table
-- Allows package items to be grouped into "choice" sections for display
-- Example: "Choose Your Main", "Choice of Fattoush or Tabbouleh", "Choice of Drink"
-- Items sharing the same GroupLabel are shown together with "OR" between them (display only)

USE [Moifcore]
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PackageItems]') AND name = 'GroupLabel')
BEGIN
    ALTER TABLE [dbo].[PackageItems]
    ADD [GroupLabel] NVARCHAR(100) NULL;

    PRINT 'Added GroupLabel column to PackageItems';
END
ELSE
BEGIN
    PRINT 'GroupLabel column already exists in PackageItems';
END
GO

PRINT '';
PRINT 'How it works:';
PRINT '  - GroupLabel = NULL   -> item shown under plain "Included Items" list';
PRINT '  - GroupLabel = text   -> items with the same label are shown as one section';
PRINT '                           with OR between them (e.g. "Choice of Hummus OR Moutabal")';
GO
