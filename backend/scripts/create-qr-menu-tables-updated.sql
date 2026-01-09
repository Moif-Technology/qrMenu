-- SQL Script to create QR Menu tables (UPDATED VERSION)
-- Database: Moifcore (Inventory Database)
-- This script ensures QrSubgroupID is properly saved in QrProductMaster
-- Run this script if you need to recreate tables or add missing columns

-- 1. QrGroupMaster - Stores QR Menu Groups
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[QrGroupMaster]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[QrGroupMaster] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [QrGroupID] BIGINT NOT NULL UNIQUE,
        [GroupID] BIGINT NULL, -- Reference to GroupMaster.GroupID (optional - links to normal group)
        [GroupDescription] NVARCHAR(255) NULL,
        [GroupDescriptionArabic] NVARCHAR(255) NULL,
        [GroupCode] VARCHAR(50) NULL,
        [keyshift] BIT DEFAULT 1,
        [SortOrder] INT DEFAULT 0,
        [IsActive] BIT DEFAULT 1,
        [CrOn] DATETIME DEFAULT GETDATE(),
        [ModOn] DATETIME DEFAULT GETDATE(),
        [CrBy] NVARCHAR(100) NULL,
        [ModBy] NVARCHAR(100) NULL,
        CONSTRAINT FK_QrGroupMaster_GroupMaster FOREIGN KEY ([GroupID])
            REFERENCES [dbo].[GroupMaster]([GroupID]) ON DELETE NO ACTION
    );
    CREATE INDEX IX_QrGroupMaster_QrGroupID ON [dbo].[QrGroupMaster]([QrGroupID]);
    CREATE INDEX IX_QrGroupMaster_GroupCode ON [dbo].[QrGroupMaster]([GroupCode]);
    CREATE INDEX IX_QrGroupMaster_GroupID ON [dbo].[QrGroupMaster]([GroupID]);
    PRINT 'QrGroupMaster table created successfully';
END
ELSE
BEGIN
    PRINT 'QrGroupMaster table already exists';
END
GO

-- 2. QrSubgroup - Stores QR Menu Subgroups (linked to QrGroupMaster)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[QrSubgroup]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[QrSubgroup] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [QrSubgroupID] BIGINT NOT NULL UNIQUE,
        [QrGroupID] BIGINT NOT NULL,
        [SubGroupID] BIGINT NULL, -- Reference to SubGroupMaster.SubGroupID (optional - links to normal subgroup)
        [SubgroupDescription] NVARCHAR(255) NULL,
        [SubgroupDescriptionArabic] NVARCHAR(255) NULL,
        [SubgroupCode] VARCHAR(50) NULL,
        [SortOrder] INT DEFAULT 0,
        [IsActive] BIT DEFAULT 1,
        [CrOn] DATETIME DEFAULT GETDATE(),
        [ModOn] DATETIME DEFAULT GETDATE(),
        [CrBy] NVARCHAR(100) NULL,
        [ModBy] NVARCHAR(100) NULL,
        CONSTRAINT FK_QrSubgroup_QrGroupMaster FOREIGN KEY ([QrGroupID]) 
            REFERENCES [dbo].[QrGroupMaster]([QrGroupID]) ON DELETE CASCADE,
        CONSTRAINT FK_QrSubgroup_SubGroupMaster FOREIGN KEY ([SubGroupID])
            REFERENCES [dbo].[SubGroupMaster]([SubGroupID]) ON DELETE NO ACTION
    );
    CREATE INDEX IX_QrSubgroup_QrSubgroupID ON [dbo].[QrSubgroup]([QrSubgroupID]);
    CREATE INDEX IX_QrSubgroup_QrGroupID ON [dbo].[QrSubgroup]([QrGroupID]);
    CREATE INDEX IX_QrSubgroup_SubgroupCode ON [dbo].[QrSubgroup]([SubgroupCode]);
    CREATE INDEX IX_QrSubgroup_SubGroupID ON [dbo].[QrSubgroup]([SubGroupID]);
    PRINT 'QrSubgroup table created successfully';
END
ELSE
BEGIN
    PRINT 'QrSubgroup table already exists';
END
GO

-- 3. QrProductMaster - Stores QR Menu Products (linked to ProductMaster)
-- IMPORTANT: This table includes QrSubgroupID to ensure subgroups are saved
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[QrProductMaster] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ProductID] BIGINT NOT NULL, -- Reference to ProductMaster.ProductID
        [GroupID] BIGINT NULL, -- Reference to GroupMaster.GroupID (normal group from ProductMaster)
        [SubGroupID] BIGINT NULL, -- Reference to SubGroupMaster.SubGroupID (normal subgroup from ProductMaster)
        [QrGroupID] BIGINT NULL, -- Reference to QrGroupMaster.QrGroupID
        [QrSubgroupID] BIGINT NULL, -- Reference to QrSubgroup.QrSubgroupID (optional - MUST BE SAVED WHEN SELECTED)
        [Description] NVARCHAR(255) NULL,
        [DescriptionArabic] NVARCHAR(255) NULL,
        [ShortDescription] NVARCHAR(100) NULL,
        [BarCode] NVARCHAR(50) NULL,
        [Specification] NVARCHAR(MAX) NULL,
        [ProductType] NVARCHAR(50) NULL,
        [SortOrder] INT DEFAULT 0,
        [IsActive] BIT DEFAULT 1,
        [CrOn] DATETIME DEFAULT GETDATE(),
        [ModOn] DATETIME DEFAULT GETDATE(),
        [CrBy] NVARCHAR(100) NULL,
        [ModBy] NVARCHAR(100) NULL,
        CONSTRAINT FK_QrProductMaster_ProductMaster FOREIGN KEY ([ProductID])
            REFERENCES [dbo].[ProductMaster]([ProductID]) ON DELETE NO ACTION,
        CONSTRAINT FK_QrProductMaster_GroupMaster FOREIGN KEY ([GroupID])
            REFERENCES [dbo].[GroupMaster]([GroupID]) ON DELETE NO ACTION,
        CONSTRAINT FK_QrProductMaster_SubGroupMaster FOREIGN KEY ([SubGroupID])
            REFERENCES [dbo].[SubGroupMaster]([SubGroupID]) ON DELETE NO ACTION,
        CONSTRAINT FK_QrProductMaster_QrGroupMaster FOREIGN KEY ([QrGroupID]) 
            REFERENCES [dbo].[QrGroupMaster]([QrGroupID]) ON DELETE NO ACTION,
        CONSTRAINT FK_QrProductMaster_QrSubgroup FOREIGN KEY ([QrSubgroupID]) 
            REFERENCES [dbo].[QrSubgroup]([QrSubgroupID]) ON DELETE NO ACTION,
        CONSTRAINT UQ_QrProductMaster_ProductID UNIQUE ([ProductID])
    );
    CREATE INDEX IX_QrProductMaster_ProductID ON [dbo].[QrProductMaster]([ProductID]);
    CREATE INDEX IX_QrProductMaster_GroupID ON [dbo].[QrProductMaster]([GroupID]);
    CREATE INDEX IX_QrProductMaster_SubGroupID ON [dbo].[QrProductMaster]([SubGroupID]);
    CREATE INDEX IX_QrProductMaster_QrGroupID ON [dbo].[QrProductMaster]([QrGroupID]);
    CREATE INDEX IX_QrProductMaster_QrSubgroupID ON [dbo].[QrProductMaster]([QrSubgroupID]);
    PRINT 'QrProductMaster table created successfully';
END
ELSE
BEGIN
    PRINT 'QrProductMaster table already exists';
    -- Add new columns if they don't exist (for existing tables)
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND name = 'GroupID')
    BEGIN
        ALTER TABLE [dbo].[QrProductMaster]
        ADD [GroupID] BIGINT NULL;
        ALTER TABLE [dbo].[QrProductMaster]
        ADD CONSTRAINT FK_QrProductMaster_GroupMaster FOREIGN KEY ([GroupID])
            REFERENCES [dbo].[GroupMaster]([GroupID]) ON DELETE NO ACTION;
        CREATE INDEX IX_QrProductMaster_GroupID ON [dbo].[QrProductMaster]([GroupID]);
        PRINT 'Added GroupID column to QrProductMaster';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND name = 'SubGroupID')
    BEGIN
        ALTER TABLE [dbo].[QrProductMaster]
        ADD [SubGroupID] BIGINT NULL;
        ALTER TABLE [dbo].[QrProductMaster]
        ADD CONSTRAINT FK_QrProductMaster_SubGroupMaster FOREIGN KEY ([SubGroupID])
            REFERENCES [dbo].[SubGroupMaster]([SubGroupID]) ON DELETE NO ACTION;
        CREATE INDEX IX_QrProductMaster_SubGroupID ON [dbo].[QrProductMaster]([SubGroupID]);
        PRINT 'Added SubGroupID column to QrProductMaster';
    END
    
    -- Ensure QrSubgroupID column exists (should already exist, but check anyway)
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND name = 'QrSubgroupID')
    BEGIN
        ALTER TABLE [dbo].[QrProductMaster]
        ADD [QrSubgroupID] BIGINT NULL;
        ALTER TABLE [dbo].[QrProductMaster]
        ADD CONSTRAINT FK_QrProductMaster_QrSubgroup FOREIGN KEY ([QrSubgroupID])
            REFERENCES [dbo].[QrSubgroup]([QrSubgroupID]) ON DELETE NO ACTION;
        CREATE INDEX IX_QrProductMaster_QrSubgroupID ON [dbo].[QrProductMaster]([QrSubgroupID]);
        PRINT 'Added QrSubgroupID column to QrProductMaster';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND name = 'ProductType')
    BEGIN
        ALTER TABLE [dbo].[QrProductMaster]
        ADD [ProductType] NVARCHAR(50) NULL;
        PRINT 'Added ProductType column to QrProductMaster';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_QrProductMaster_ProductMaster')
    BEGIN
        ALTER TABLE [dbo].[QrProductMaster]
        ADD CONSTRAINT FK_QrProductMaster_ProductMaster FOREIGN KEY ([ProductID])
            REFERENCES [dbo].[ProductMaster]([ProductID]) ON DELETE NO ACTION;
        PRINT 'Added FK_QrProductMaster_ProductMaster constraint';
    END
END
GO

-- 4. QrProductChild - Stores QR Menu Product Child (prices, stations, etc.)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[QrProductChild]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[QrProductChild] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ProductID] BIGINT NOT NULL, -- Reference to QrProductMaster.ProductID
        [StationID] INT NULL,
        [UnitPrice] DECIMAL(18,2) DEFAULT 0,
        [Tax1Amount] DECIMAL(18,2) DEFAULT 0,
        [Tax2Amount] DECIMAL(18,2) DEFAULT 0,
        [PackQty] DECIMAL(18,2) DEFAULT 1,
        [IsActive] BIT DEFAULT 1,
        [CrOn] DATETIME DEFAULT GETDATE(),
        [ModOn] DATETIME DEFAULT GETDATE(),
        [CrBy] NVARCHAR(100) NULL,
        [ModBy] NVARCHAR(100) NULL,
        CONSTRAINT FK_QrProductChild_QrProductMaster FOREIGN KEY ([ProductID]) 
            REFERENCES [dbo].[QrProductMaster]([ProductID]) ON DELETE CASCADE
    );
    CREATE INDEX IX_QrProductChild_ProductID ON [dbo].[QrProductChild]([ProductID]);
    CREATE INDEX IX_QrProductChild_StationID ON [dbo].[QrProductChild]([StationID]);
    PRINT 'QrProductChild table created successfully';
END
ELSE
BEGIN
    PRINT 'QrProductChild table already exists';
END
GO

PRINT 'All QR Menu tables creation script completed!';
PRINT 'NOTE: QrSubgroupID column is included in QrProductMaster and will be saved when products are assigned to QR subgroups.';

