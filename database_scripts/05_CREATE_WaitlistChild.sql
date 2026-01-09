-- Create WaitlistChild table
USE [Moifcore]
GO

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[WaitlistChild]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[WaitlistChild](
        [ID] [bigint] IDENTITY(1,1) NOT NULL,
        [WaitlistChildID] [bigint] NOT NULL,
        [WaitlistID] [bigint] NOT NULL,
        [TableID] [bigint] NOT NULL,
        [AreaID] [bigint] NOT NULL,
        [Priority] [int] NOT NULL DEFAULT 0,
        [Status] [varchar](50) NOT NULL DEFAULT 'PENDING',
        [CreatedOn] [datetime] NOT NULL DEFAULT GETDATE(),
        CONSTRAINT [PK_WaitlistChild] PRIMARY KEY CLUSTERED ([WaitlistChildID] ASC)
            WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, 
                  ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
    ) ON [PRIMARY];

    -- Foreign Key to WaitlistMaster
    ALTER TABLE [dbo].[WaitlistChild] 
        ADD CONSTRAINT [FK_WaitlistChild_WaitlistMaster] 
        FOREIGN KEY([WaitlistID]) REFERENCES [dbo].[WaitlistMaster] ([WaitlistID]);

    -- Create indexes
    CREATE NONCLUSTERED INDEX [IX_WaitlistChild_WaitlistID] 
        ON [dbo].[WaitlistChild] ([WaitlistID] ASC);
    
    CREATE NONCLUSTERED INDEX [IX_WaitlistChild_TableID] 
        ON [dbo].[WaitlistChild] ([TableID] ASC);
    
    CREATE NONCLUSTERED INDEX [IX_WaitlistChild_AreaID] 
        ON [dbo].[WaitlistChild] ([AreaID] ASC);

    PRINT 'WaitlistChild table created successfully.';
END
ELSE
BEGIN
    PRINT 'WaitlistChild table already exists.';
END
GO

