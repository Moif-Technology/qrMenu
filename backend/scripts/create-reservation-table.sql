-- SQL Script to create ReservationMaster table
-- Database: Moifcore (Inventory Database)
-- This script creates the table for managing restaurant reservations

-- ReservationMaster - Stores restaurant table reservations
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ReservationMaster]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ReservationMaster] (
        [ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ReservationID] BIGINT NOT NULL UNIQUE,
        [TableID] INT NOT NULL,
        [AreaID] BIGINT NULL,
        [CustomerName] NVARCHAR(255) NOT NULL,
        [CustomerPhone] NVARCHAR(50) NOT NULL,
        [CustomerEmail] NVARCHAR(255) NULL,
        [ReservationDate] DATETIME2 NOT NULL,
        [ReservationTime] TIME NOT NULL,
        [NumberOfGuests] INT NOT NULL DEFAULT 1,
        [SpecialRequests] NVARCHAR(500) NULL,
        [Status] NVARCHAR(50) NOT NULL DEFAULT 'PENDING',
        [CrOn] DATETIME DEFAULT GETDATE(),
        [ModOn] DATETIME DEFAULT GETDATE(),
        [CrBy] NVARCHAR(100) NULL,
        [ModBy] NVARCHAR(100) NULL,
        CONSTRAINT FK_ReservationMaster_TableMaster FOREIGN KEY ([TableID])
            REFERENCES [dbo].[TableMaster]([TableID]) ON DELETE NO ACTION,
        CONSTRAINT FK_ReservationMaster_AreaMaster FOREIGN KEY ([AreaID])
            REFERENCES [dbo].[AreaMaster]([AreaID]) ON DELETE NO ACTION
    );
    
    CREATE INDEX IX_ReservationMaster_ReservationID ON [dbo].[ReservationMaster]([ReservationID]);
    CREATE INDEX IX_ReservationMaster_TableID ON [dbo].[ReservationMaster]([TableID]);
    CREATE INDEX IX_ReservationMaster_AreaID ON [dbo].[ReservationMaster]([AreaID]);
    CREATE INDEX IX_ReservationMaster_ReservationDate ON [dbo].[ReservationMaster]([ReservationDate]);
    CREATE INDEX IX_ReservationMaster_Status ON [dbo].[ReservationMaster]([Status]);
    CREATE INDEX IX_ReservationMaster_CustomerPhone ON [dbo].[ReservationMaster]([CustomerPhone]);
    
    PRINT 'ReservationMaster table created successfully';
END
ELSE
BEGIN
    PRINT 'ReservationMaster table already exists';
    
    -- Add missing columns if they don't exist (for existing tables)
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ReservationMaster]') AND name = 'AreaID')
    BEGIN
        ALTER TABLE [dbo].[ReservationMaster]
        ADD [AreaID] BIGINT NULL;
        ALTER TABLE [dbo].[ReservationMaster]
        ADD CONSTRAINT FK_ReservationMaster_AreaMaster FOREIGN KEY ([AreaID])
            REFERENCES [dbo].[AreaMaster]([AreaID]) ON DELETE NO ACTION;
        CREATE INDEX IX_ReservationMaster_AreaID ON [dbo].[ReservationMaster]([AreaID]);
        PRINT 'Added AreaID column to ReservationMaster';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ReservationMaster]') AND name = 'CustomerEmail')
    BEGIN
        ALTER TABLE [dbo].[ReservationMaster]
        ADD [CustomerEmail] NVARCHAR(255) NULL;
        PRINT 'Added CustomerEmail column to ReservationMaster';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ReservationMaster]') AND name = 'SpecialRequests')
    BEGIN
        ALTER TABLE [dbo].[ReservationMaster]
        ADD [SpecialRequests] NVARCHAR(500) NULL;
        PRINT 'Added SpecialRequests column to ReservationMaster';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ReservationMaster]') AND name = 'ReservationTime')
    BEGIN
        ALTER TABLE [dbo].[ReservationMaster]
        ADD [ReservationTime] TIME NOT NULL DEFAULT '12:00:00';
        PRINT 'Added ReservationTime column to ReservationMaster';
    END
END
GO

-- Ensure IDControlManager has an entry for ReservationMaster
IF NOT EXISTS (SELECT * FROM [dbo].[IDControlManager] WHERE [ControlName] = 'ReservationMaster')
BEGIN
    INSERT INTO [dbo].[IDControlManager] ([ControlName], [ControlValue])
    VALUES ('ReservationMaster', 0);
    PRINT 'Added ReservationMaster entry to IDControlManager';
END
ELSE
BEGIN
    PRINT 'ReservationMaster entry already exists in IDControlManager';
END
GO

PRINT 'Reservation table creation script completed!';
PRINT 'Status values: PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW';

