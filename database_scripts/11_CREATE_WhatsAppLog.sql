-- 11_CREATE_WhatsAppLog.sql
--
-- NOT YET APPLIED - the admin WhatsApp utility currently keeps its send log in
-- memory (see backend/services/whatsapp.service.js) so it can be demoed with no
-- schema change. Run this when the feature goes official; the service needs its
-- log functions pointed back at the table in the same change.
--
-- Outbound WhatsApp message log for the admin WhatsApp utility.
-- Powers three things: the "already messaged" filter on the customer picker,
-- the hourly rate guard that keeps the sending number under the throttle, and
-- a plain audit trail of who blasted what.
--
-- Idempotent: safe to re-run.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'WhatsAppLog' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.WhatsAppLog (
        Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WhatsAppLog PRIMARY KEY,
        CustomerID   INT            NULL,
        Phone        NVARCHAR(32)   NOT NULL,
        MessageText  NVARCHAR(MAX)  NULL,
        -- SENT = handed to WhatsApp OK. FAILED = send threw; Error holds why.
        Status       NVARCHAR(16)   NOT NULL CONSTRAINT DF_WhatsAppLog_Status DEFAULT ('SENT'),
        Error        NVARCHAR(500)  NULL,
        SentAt       DATETIME       NOT NULL CONSTRAINT DF_WhatsAppLog_SentAt DEFAULT (GETDATE()),
        SentBy       NVARCHAR(100)  NULL
    );

    -- Rate guard counts rows in the trailing hour; this index is what makes it cheap.
    CREATE INDEX IX_WhatsAppLog_SentAt ON dbo.WhatsAppLog (SentAt DESC);

    -- "when did we last message this customer" lookup on the picker.
    CREATE INDEX IX_WhatsAppLog_Customer ON dbo.WhatsAppLog (CustomerID, SentAt DESC);

    PRINT 'Created dbo.WhatsAppLog';
END
ELSE
BEGIN
    PRINT 'dbo.WhatsAppLog already exists - skipped';
END
GO
