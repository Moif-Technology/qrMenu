-- Durable twin of the in-memory Telr session store (backend/services/telrSessionStore.js).
-- Closes the gap where a Node process restart between /api/telr/create and the
-- customer's redirect/webhook loses the in-flight payment session entirely -
-- Telr may have already charged the card with nothing recoverable server-side.
-- A row is inserted PENDING the moment a Telr order is created, then updated
-- as the payment resolves (AUTHORISED -> SETTLING -> SETTLED, or CANCELLED /
-- DECLINED / EXPIRED). See backend/services/paymentSessionStore.js.

USE [PaymentGateway]
GO

IF OBJECT_ID('dbo.PaymentSession') IS NULL
BEGIN
    CREATE TABLE [dbo].[PaymentSession] (
        [SessionID]          bigint IDENTITY(1,1) NOT NULL,
        [ShopID]             bigint NOT NULL,
        [OrderRef]           nvarchar(100) NOT NULL,
        [SessionKey]         nvarchar(80)  NOT NULL,
        [TransID]            bigint NULL,        -- kotMasterID
        [TableID]            bigint NULL,
        [Token]              nvarchar(100) NULL,
        [Mode]               varchar(30)   NOT NULL, -- pay-full | split-equal | split-custom | split-items
        [BillAmount]         money NULL,
        [Amount]             money NOT NULL,     -- leg amount actually sent to Telr (incl. fee+tip)
        [ServiceFeeAmount]   money NULL,
        [TipAmount]          money NULL,
        [NumberOfPeople]     int NULL,
        [ItemsJson]          nvarchar(max) NULL, -- item-split payload, JSON (capped at 200 items at write time)
        [OriginalBillAmount] money NULL,
        [Status]             varchar(20) NOT NULL DEFAULT ('PENDING'),
                             -- PENDING -> AUTHORISED -> SETTLING -> SETTLED
                             --                       -> CANCELLED / DECLINED / EXPIRED
        [TranRef]            nvarchar(100) NULL,
        [AuthCode]           nvarchar(50) NULL,
        [PaymentID]          bigint NULL,        -- dbo.Payment.PaymentID once settled
        [CreatedAt]          datetime2 NOT NULL DEFAULT (GETDATE()),
        [UpdatedAt]          datetime2 NOT NULL DEFAULT (GETDATE()),
        CONSTRAINT [PK_PaymentSession] PRIMARY KEY ([SessionID]),
        CONSTRAINT [UQ_PaymentSession_OrderRef] UNIQUE ([OrderRef]),
        CONSTRAINT [UQ_PaymentSession_SessionKey] UNIQUE ([SessionKey])
    );

    CREATE INDEX [IX_PaymentSession_Status_CreatedAt] ON [dbo].[PaymentSession] ([Status], [CreatedAt]);

    PRINT 'Created dbo.PaymentSession';
END
ELSE
BEGIN
    PRINT 'dbo.PaymentSession already exists';
END
GO

PRINT 'Script completed successfully.';
GO
