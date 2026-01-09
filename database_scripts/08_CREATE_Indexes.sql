-- Create recommended indexes for better performance
USE [Moifcore]
GO

-- BookingMaster indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BookingMaster_BookingDate' AND object_id = OBJECT_ID('dbo.BookingMaster'))
    CREATE NONCLUSTERED INDEX [IX_BookingMaster_BookingDate] 
        ON [dbo].[BookingMaster] ([BookingDate] ASC);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BookingMaster_BookingStatus' AND object_id = OBJECT_ID('dbo.BookingMaster'))
    CREATE NONCLUSTERED INDEX [IX_BookingMaster_BookingStatus] 
        ON [dbo].[BookingMaster] ([BookingStatus] ASC);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BookingMaster_CustomerID' AND object_id = OBJECT_ID('dbo.BookingMaster'))
    CREATE NONCLUSTERED INDEX [IX_BookingMaster_CustomerID] 
        ON [dbo].[BookingMaster] ([CustomerID] ASC);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BookingMaster_StationID' AND object_id = OBJECT_ID('dbo.BookingMaster'))
    CREATE NONCLUSTERED INDEX [IX_BookingMaster_StationID] 
        ON [dbo].[BookingMaster] ([StationID] ASC);
GO

-- BookingChild indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BookingChild_BookingID' AND object_id = OBJECT_ID('dbo.BookingChild'))
    CREATE NONCLUSTERED INDEX [IX_BookingChild_BookingID] 
        ON [dbo].[BookingChild] ([BookingID] ASC);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BookingChild_TableID' AND object_id = OBJECT_ID('dbo.BookingChild'))
    CREATE NONCLUSTERED INDEX [IX_BookingChild_TableID] 
        ON [dbo].[BookingChild] ([TableID] ASC);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BookingChild_AreaID' AND object_id = OBJECT_ID('dbo.BookingChild'))
    CREATE NONCLUSTERED INDEX [IX_BookingChild_AreaID] 
        ON [dbo].[BookingChild] ([AreaID] ASC);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BookingChild_Status' AND object_id = OBJECT_ID('dbo.BookingChild'))
    CREATE NONCLUSTERED INDEX [IX_BookingChild_Status] 
        ON [dbo].[BookingChild] ([Status] ASC);
GO

PRINT 'All indexes created successfully.';
GO

