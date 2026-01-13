-- Create junction table for many-to-many relationship between packages and items
-- This allows the same item to belong to multiple packages

USE [Moifcore]
GO

-- Create PackageItems junction table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PackageItems')
BEGIN
    CREATE TABLE [dbo].[PackageItems] (
        [ID] INT IDENTITY(1,1) PRIMARY KEY,
        [PackageProductID] BIGINT NOT NULL,
        [ItemProductID] BIGINT NOT NULL,
        [DisplayOrder] INT DEFAULT 0,
        [CreatedOn] DATETIME DEFAULT GETDATE(),
        
        -- Foreign key to package (with CASCADE DELETE so items are removed when package is deleted)
        CONSTRAINT FK_PackageItems_Package 
            FOREIGN KEY ([PackageProductID]) 
            REFERENCES [dbo].[QrProductMaster]([ProductID]) 
            ON DELETE CASCADE,
        
        -- Foreign key to item
        CONSTRAINT FK_PackageItems_Item 
            FOREIGN KEY ([ItemProductID]) 
            REFERENCES [dbo].[QrProductMaster]([ProductID]),
        
        -- Unique constraint: same item can't be added to same package twice
        CONSTRAINT UQ_PackageItems 
            UNIQUE ([PackageProductID], [ItemProductID])
    );
    
    -- Create indexes for better performance
    CREATE INDEX IX_PackageItems_Package ON [dbo].[PackageItems]([PackageProductID]);
    CREATE INDEX IX_PackageItems_Item ON [dbo].[PackageItems]([ItemProductID]);
    CREATE INDEX IX_PackageItems_DisplayOrder ON [dbo].[PackageItems]([DisplayOrder]);
    
    PRINT '✅ PackageItems junction table created successfully!';
END
ELSE
BEGIN
    PRINT '⚠️ PackageItems table already exists';
END
GO

PRINT '';
PRINT '📋 How it works:';
PRINT '  - PackageProductID = The package (e.g., "70 AED Breakfast")';
PRINT '  - ItemProductID = The item in the package (e.g., "Arabic Coffee")';
PRINT '  - DisplayOrder = Order of items in the package (1, 2, 3...)';
PRINT '';
PRINT '💡 Benefits:';
PRINT '  - Same item can belong to MULTIPLE packages';
PRINT '  - Adding item to Package B does NOT remove it from Package A';
PRINT '  - Each package can have different display order for same item';
GO

