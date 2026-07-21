-- ===== Sync script for PaymentGateway (SB\SQLEXPRESS target) =====
-- Generated from MOIF\SQLEXPRESS2019 source. REVIEW BEFORE RUNNING.

-- Missing table: DashboardUsers
CREATE TABLE [dbo].[DashboardUsers] (
  [UserID] bigint IDENTITY(1,1) NOT NULL,
  [Username] varchar(100) NOT NULL,
  [PasswordHash] varchar(200) NOT NULL,
  [Role] varchar(20) NOT NULL,
  [ShopID] bigint NULL,
  [DisplayName] nvarchar(200) NULL,
  [Status] varchar(20) NOT NULL,
  [CreatedAt] datetime2 NOT NULL,
  CONSTRAINT [PK_DashboardUsers] PRIMARY KEY ([UserID])
);

-- Missing table: PaymentAttempts
CREATE TABLE [dbo].[PaymentAttempts] (
  [AttemptID] bigint IDENTITY(1,1) NOT NULL,
  [ShopID] bigint NOT NULL,
  [TransID] bigint NULL,
  [TableID] bigint NULL,
  [Amount] money NULL,
  [Mode] varchar(30) NULL,
  [Status] varchar(20) NOT NULL,
  [OrderRef] nvarchar(100) NULL,
  [CreatedAt] datetime2 NOT NULL,
  CONSTRAINT [PK_PaymentAttempts] PRIMARY KEY ([AttemptID])
);

-- Missing table: PayoutStatus
CREATE TABLE [dbo].[PayoutStatus] (
  [PayoutID] bigint IDENTITY(1,1) NOT NULL,
  [PaymentID] bigint NOT NULL,
  [ShopID] bigint NOT NULL,
  [Amount] money NOT NULL,
  [Status] varchar(20) NOT NULL,
  [ApprovedBy] nvarchar(100) NULL,
  [ApprovedAt] datetime2 NULL,
  [TransferRef] nvarchar(200) NULL,
  [TransferDate] date NULL,
  [TransferredBy] nvarchar(100) NULL,
  [Notes] nvarchar(500) NULL,
  [UpdatedAt] datetime2 NOT NULL,
  CONSTRAINT [PK_PayoutStatus] PRIMARY KEY ([PayoutID])
);

-- Missing table: RestaurantMaster
CREATE TABLE [dbo].[RestaurantMaster] (
  [RestaurantID] bigint NOT NULL,
  [Slug] varchar(50) NOT NULL,
  [Name] nvarchar(200) NOT NULL,
  [ContactPerson] nvarchar(200) NULL,
  [ContactPhone] varchar(50) NULL,
  [BankName] nvarchar(200) NULL,
  [BankAccount] nvarchar(100) NULL,
  [BankIBAN] nvarchar(100) NULL,
  [Status] varchar(20) NOT NULL,
  [CreatedAt] datetime2 NOT NULL,
  CONSTRAINT [PK_RestaurantMaster] PRIMARY KEY ([RestaurantID])
);

-- Missing table: ServiceFeeConfig
CREATE TABLE [dbo].[ServiceFeeConfig] (
  [ID] int NOT NULL,
  [RatePercent] decimal(5,2) NOT NULL,
  [UpdatedBy] varchar(50) NULL,
  [UpdatedOn] datetime NOT NULL,
  CONSTRAINT [PK_ServiceFeeConfig] PRIMARY KEY ([ID])
);

-- Missing column: Payment.CreatedAt
ALTER TABLE [dbo].[Payment] ADD [CreatedAt] datetime2 NULL;
