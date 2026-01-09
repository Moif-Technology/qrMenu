-- Add missing fields to BookingChild
USE [Moifcore]
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingChild]') AND name = 'Notes')
    ALTER TABLE [dbo].[BookingChild] ADD [Notes] [nvarchar](500) NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingChild]') AND name = 'SeatedTime')
    ALTER TABLE [dbo].[BookingChild] ADD [SeatedTime] [datetime] NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingChild]') AND name = 'VacatedTime')
    ALTER TABLE [dbo].[BookingChild] ADD [VacatedTime] [datetime] NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingChild]') AND name = 'CreatedOn')
    ALTER TABLE [dbo].[BookingChild] ADD [CreatedOn] [datetime] NOT NULL DEFAULT GETDATE();
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingChild]') AND name = 'ModifiedOn')
    ALTER TABLE [dbo].[BookingChild] ADD [ModifiedOn] [datetime] NULL;
GO

PRINT 'All fields added to BookingChild successfully.';
GO

