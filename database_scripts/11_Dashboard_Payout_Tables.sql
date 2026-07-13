-- ============================================================
-- 11_Dashboard_Payout_Tables.sql
-- Creates the tables needed by qrmenu-dashboard (payout tracker):
--   1. dbo.RestaurantMaster  - registry of restaurants (ShopID identity)
--   2. dbo.PayoutStatus      - payout tracking per payment (PENDING/APPROVED/TRANSFERRED)
--   3. dbo.DashboardUsers    - logins for company + restaurant dashboard users
--
-- Run against the PaymentGateway database.
-- Safe to re-run: every statement is guarded with IF NOT EXISTS.
-- ============================================================

USE PaymentGateway;
GO

-- ------------------------------------------------------------
-- 1. RestaurantMaster
-- ------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RestaurantMaster' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.RestaurantMaster (
        RestaurantID   BIGINT        NOT NULL PRIMARY KEY,  -- same value used as Payment.ShopID
        Slug           VARCHAR(50)   NOT NULL UNIQUE,       -- e.g. 'opaia'
        Name           NVARCHAR(200) NOT NULL,
        ContactPerson  NVARCHAR(200) NULL,
        ContactPhone   VARCHAR(50)   NULL,
        BankName       NVARCHAR(200) NULL,
        BankAccount    NVARCHAR(100) NULL,
        BankIBAN       NVARCHAR(100) NULL,
        Status         VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | BLOCKED
        CreatedAt      DATETIME2     NOT NULL DEFAULT SYSDATETIME()
    );
    PRINT 'Created dbo.RestaurantMaster';
END
GO

-- Seed the first restaurant (Opaia = ShopID 1, matches existing Payment rows)
IF NOT EXISTS (SELECT 1 FROM dbo.RestaurantMaster WHERE RestaurantID = 1)
BEGIN
    INSERT INTO dbo.RestaurantMaster (RestaurantID, Slug, Name, Status)
    VALUES (1, 'opaia', N'Opaia Restaurant', 'ACTIVE');
    PRINT 'Seeded RestaurantMaster with Opaia (RestaurantID = 1)';
END
GO

-- ------------------------------------------------------------
-- 2. PayoutStatus (one row per Payment row that enters the payout pipeline)
-- ------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PayoutStatus' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.PayoutStatus (
        PayoutID      BIGINT       IDENTITY(1000,1) PRIMARY KEY,
        PaymentID     BIGINT       NOT NULL UNIQUE,          -- FK -> dbo.Payment.PaymentID
        ShopID        BIGINT       NOT NULL,                 -- denormalized for fast filtering
        Amount        MONEY        NOT NULL,                 -- amount owed to the restaurant
        Status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | TRANSFERRED
        ApprovedBy    NVARCHAR(100) NULL,
        ApprovedAt    DATETIME2    NULL,
        TransferRef   NVARCHAR(200) NULL,                    -- cheque no / bank transfer reference
        TransferDate  DATE         NULL,
        TransferredBy NVARCHAR(100) NULL,
        Notes         NVARCHAR(500) NULL,
        UpdatedAt     DATETIME2    NOT NULL DEFAULT SYSDATETIME()
    );
    CREATE INDEX IX_PayoutStatus_ShopID ON dbo.PayoutStatus (ShopID, Status);
    PRINT 'Created dbo.PayoutStatus';
END
GO

-- ------------------------------------------------------------
-- 3. DashboardUsers
-- ------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DashboardUsers' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.DashboardUsers (
        UserID       BIGINT        IDENTITY(1,1) PRIMARY KEY,
        Username     VARCHAR(100)  NOT NULL UNIQUE,
        PasswordHash VARCHAR(200)  NOT NULL,                 -- bcrypt hash
        Role         VARCHAR(20)   NOT NULL,                 -- 'company' | 'restaurant'
        ShopID       BIGINT        NULL,                     -- required when Role = 'restaurant'
        DisplayName  NVARCHAR(200) NULL,
        Status       VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
        CreatedAt    DATETIME2     NOT NULL DEFAULT SYSDATETIME()
    );
    PRINT 'Created dbo.DashboardUsers';
END
GO

-- ------------------------------------------------------------
-- 4. Add CreatedAt to dbo.Payment (existing rows stay NULL; new rows auto-stamp)
--    Needed so dashboards can filter transactions by date.
-- ------------------------------------------------------------
IF COL_LENGTH('dbo.Payment', 'CreatedAt') IS NULL
BEGIN
    ALTER TABLE dbo.Payment ADD CreatedAt DATETIME2 NULL CONSTRAINT DF_Payment_CreatedAt DEFAULT SYSDATETIME();
    PRINT 'Added CreatedAt column to dbo.Payment';
END
GO

PRINT 'Dashboard payout tables ready.';
GO
