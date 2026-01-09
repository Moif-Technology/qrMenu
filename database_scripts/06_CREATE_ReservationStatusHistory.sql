-- Create ReservationStatusHistory table for audit trail
USE [Moifcore]
GO

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ReservationStatusHistory]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ReservationStatusHistory](
        [ID] [bigint] IDENTITY(1,1) NOT NULL,
        [HistoryID] [bigint] NOT NULL,
        [BookingID] [bigint] NOT NULL,
        [OldStatus] [varchar](50) NULL,
        [NewStatus] [varchar](50) NOT NULL,
        [ChangedBy] [varchar](50) NULL,
        [ChangedOn] [datetime] NOT NULL DEFAULT GETDATE(),
        [Notes] [nvarchar](500) NULL,
        [StationID] [bigint] NOT NULL,
        CONSTRAINT [PK_ReservationStatusHistory] PRIMARY KEY CLUSTERED ([HistoryID] ASC)
            WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, 
                  ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
    ) ON [PRIMARY];

    -- Foreign Key to BookingMaster
    ALTER TABLE [dbo].[ReservationStatusHistory] 
        ADD CONSTRAINT [FK_ReservationStatusHistory_BookingMaster] 
        FOREIGN KEY([BookingID]) REFERENCES [dbo].[BookingMaster] ([BookingID]);

    -- Create indexes
    CREATE NONCLUSTERED INDEX [IX_ReservationStatusHistory_BookingID] 
        ON [dbo].[ReservationStatusHistory] ([BookingID] ASC);
    
    CREATE NONCLUSTERED INDEX [IX_ReservationStatusHistory_ChangedOn] 
        ON [dbo].[ReservationStatusHistory] ([ChangedOn] ASC);

    PRINT 'ReservationStatusHistory table created successfully.';
END
ELSE
BEGIN
    PRINT 'ReservationStatusHistory table already exists.';
END
GO

