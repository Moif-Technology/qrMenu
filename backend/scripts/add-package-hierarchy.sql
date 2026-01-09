-- SQL Script to add Package Hierarchy to QR Menu
-- This allows products to be organized into packages
-- Example: "70 AED Breakfast Package" can contain multiple products

-- Add ParentPackageID and IsPackageHeader columns to QrProductMaster
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND name = 'ParentPackageID')
BEGIN
    ALTER TABLE [dbo].[QrProductMaster]
    ADD [ParentPackageID] BIGINT NULL;
    
    -- Add foreign key to itself (self-referencing)
    ALTER TABLE [dbo].[QrProductMaster]
    ADD CONSTRAINT FK_QrProductMaster_ParentPackage FOREIGN KEY ([ParentPackageID])
        REFERENCES [dbo].[QrProductMaster]([ProductID]) ON DELETE NO ACTION;
    
    CREATE INDEX IX_QrProductMaster_ParentPackageID ON [dbo].[QrProductMaster]([ParentPackageID]);
    
    PRINT 'Added ParentPackageID column to QrProductMaster';
END
ELSE
BEGIN
    PRINT 'ParentPackageID column already exists in QrProductMaster';
END
GO

-- Add IsPackageHeader flag to identify package products
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND name = 'IsPackageHeader')
BEGIN
    ALTER TABLE [dbo].[QrProductMaster]
    ADD [IsPackageHeader] BIT DEFAULT 0;
    
    PRINT 'Added IsPackageHeader column to QrProductMaster';
END
ELSE
BEGIN
    PRINT 'IsPackageHeader column already exists in QrProductMaster';
END
GO

-- Add DisplayOrder for ordering products within a package
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND name = 'DisplayOrder')
BEGIN
    ALTER TABLE [dbo].[QrProductMaster]
    ADD [DisplayOrder] INT DEFAULT 0;
    
    CREATE INDEX IX_QrProductMaster_DisplayOrder ON [dbo].[QrProductMaster]([DisplayOrder]);
    
    PRINT 'Added DisplayOrder column to QrProductMaster';
END
ELSE
BEGIN
    PRINT 'DisplayOrder column already exists in QrProductMaster';
END
GO

PRINT 'Package hierarchy setup completed!';
PRINT '';
PRINT 'How to use:';
PRINT '1. Create a product as package header (e.g., "70 AED - Opaia Levantine Breakfast")';
PRINT '   - Set IsPackageHeader = 1';
PRINT '   - Assign to PACKAGES subgroup';
PRINT '';
PRINT '2. Create products that belong to the package (e.g., "Arabic Bread", "Labneh")';
PRINT '   - Set ParentPackageID = ProductID of the package header';
PRINT '   - Set DisplayOrder for ordering (1, 2, 3, ...)';
PRINT '';
PRINT '3. When customers click the package, they see all products with that ParentPackageID';

