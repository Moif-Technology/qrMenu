-- Add missing fields to BookingMaster
USE [Moifcore]
GO

-- Guest Information (if CustomerMaster doesn't exist or for walk-ins)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'GuestName')
    ALTER TABLE [dbo].[BookingMaster] ADD [GuestName] [varchar](150) NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'GuestPhone')
    ALTER TABLE [dbo].[BookingMaster] ADD [GuestPhone] [varchar](20) NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'GuestEmail')
    ALTER TABLE [dbo].[BookingMaster] ADD [GuestEmail] [varchar](150) NULL;
GO

-- Reservation Details
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'ReservationTime')
    ALTER TABLE [dbo].[BookingMaster] ADD [ReservationTime] [time] NOT NULL DEFAULT '12:00:00';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'ReservationEndTime')
    ALTER TABLE [dbo].[BookingMaster] ADD [ReservationEndTime] [time] NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'SpecialRequests')
    ALTER TABLE [dbo].[BookingMaster] ADD [SpecialRequests] [nvarchar](500) NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'Tags')
    ALTER TABLE [dbo].[BookingMaster] ADD [Tags] [varchar](500) NULL;
GO

-- Staff Assignment
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'HostessID')
    ALTER TABLE [dbo].[BookingMaster] ADD [HostessID] [bigint] NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'HostessName')
    ALTER TABLE [dbo].[BookingMaster] ADD [HostessName] [varchar](100) NULL;
GO

-- Confirmation & Communication
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'ConfirmationCode')
    ALTER TABLE [dbo].[BookingMaster] ADD [ConfirmationCode] [varchar](50) NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'ConfirmationSent')
    ALTER TABLE [dbo].[BookingMaster] ADD [ConfirmationSent] [bit] NOT NULL DEFAULT 0;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'ReminderSent')
    ALTER TABLE [dbo].[BookingMaster] ADD [ReminderSent] [bit] NOT NULL DEFAULT 0;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'LastNotificationDate')
    ALTER TABLE [dbo].[BookingMaster] ADD [LastNotificationDate] [datetime] NULL;
GO

-- Additional Metadata
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'CreatedBy')
    ALTER TABLE [dbo].[BookingMaster] ADD [CreatedBy] [varchar](50) NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'ModifiedBy')
    ALTER TABLE [dbo].[BookingMaster] ADD [ModifiedBy] [varchar](50) NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'ModifiedOn')
    ALTER TABLE [dbo].[BookingMaster] ADD [ModifiedOn] [datetime] NULL;
GO

-- Walk-in specific
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'IsWalkIn')
    ALTER TABLE [dbo].[BookingMaster] ADD [IsWalkIn] [bit] NOT NULL DEFAULT 0;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[BookingMaster]') AND name = 'WalkInArrivalTime')
    ALTER TABLE [dbo].[BookingMaster] ADD [WalkInArrivalTime] [datetime] NULL;
GO

PRINT 'All fields added to BookingMaster successfully.';
GO

