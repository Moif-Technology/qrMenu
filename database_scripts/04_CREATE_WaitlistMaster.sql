-- Create WaitlistMaster table
USE [Moifcore]
GO

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WaitlistMaster]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[WaitlistMaster](
        [ID] [bigint] IDENTITY(1,1) NOT NULL,
        [WaitlistID] [bigint] NOT NULL,
        [GuestName] [varchar](150) NOT NULL,
        [GuestPhone] [varchar](20) NULL,
        [GuestEmail] [varchar](150) NULL,
        [PartySize] [bigint] NOT NULL,
        [WaitTimeMinutes] [bigint] NOT NULL,
        [AddedDate] [datetime] NOT NULL DEFAULT GETDATE(),
        [EstimatedReadyTime] [datetime] NULL,
        [Status] [varchar](50) NOT NULL DEFAULT 'WAITING',
        [HostessID] [bigint] NULL,
        [HostessName] [varchar](100) NULL,
        [SpecialRequests] [nvarchar](500) NULL,
        [Notes] [nvarchar](500) NULL,
        [NotifiedCount] [int] NOT NULL DEFAULT 0,
        [LastNotifiedDate] [datetime] NULL,
        [SeatedDate] [datetime] NULL,
        [SeatedBookingID] [bigint] NULL,
        [StationID] [bigint] NOT NULL,
        [CreatedBy] [varchar](50) NULL,
        [CreatedOn] [datetime] NOT NULL DEFAULT GETDATE(),
        [ModifiedBy] [varchar](50) NULL,
        [ModifiedOn] [datetime] NULL,
        CONSTRAINT [PK_WaitlistMaster] PRIMARY KEY CLUSTERED ([WaitlistID] ASC)
            WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, 
                  ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
    ) ON [PRIMARY];

    -- Create indexes
    CREATE NONCLUSTERED INDEX [IX_WaitlistMaster_Status] 
        ON [dbo].[WaitlistMaster] ([Status] ASC);
    
    CREATE NONCLUSTERED INDEX [IX_WaitlistMaster_AddedDate] 
        ON [dbo].[WaitlistMaster] ([AddedDate] ASC);
    
    CREATE NONCLUSTERED INDEX [IX_WaitlistMaster_StationID] 
        ON [dbo].[WaitlistMaster] ([StationID] ASC);

    PRINT 'WaitlistMaster table created successfully.';
END
ELSE
BEGIN
    PRINT 'WaitlistMaster table already exists.';
END
GO

