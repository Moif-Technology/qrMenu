-- SQL Script to add FullDescription and Allergies columns to QrProductMaster table
-- FullDescription: For the full/long description shown in item modal
-- Allergies: For allergen information shown in item modal

USE [Moifcore]
GO

-- Add FullDescription column (nvarchar(max) for long descriptions)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND name = 'FullDescription')
BEGIN
    ALTER TABLE [dbo].[QrProductMaster]
    ADD [FullDescription] [nvarchar](max) NULL;
    
    PRINT 'Added FullDescription column to QrProductMaster';
END
ELSE
BEGIN
    PRINT 'FullDescription column already exists in QrProductMaster';
END
GO

-- Add FullDescriptionArabic column for Arabic full description
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND name = 'FullDescriptionArabic')
BEGIN
    ALTER TABLE [dbo].[QrProductMaster]
    ADD [FullDescriptionArabic] [nvarchar](max) NULL;
    
    PRINT 'Added FullDescriptionArabic column to QrProductMaster';
END
ELSE
BEGIN
    PRINT 'FullDescriptionArabic column already exists in QrProductMaster';
END
GO

-- Add Allergies column for allergen information
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND name = 'Allergies')
BEGIN
    ALTER TABLE [dbo].[QrProductMaster]
    ADD [Allergies] [nvarchar](max) NULL;
    
    PRINT 'Added Allergies column to QrProductMaster';
END
ELSE
BEGIN
    PRINT 'Allergies column already exists in QrProductMaster';
END
GO

-- Add AllergiesArabic column for Arabic allergen information
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QrProductMaster]') AND name = 'AllergiesArabic')
BEGIN
    ALTER TABLE [dbo].[QrProductMaster]
    ADD [AllergiesArabic] [nvarchar](max) NULL;
    
    PRINT 'Added AllergiesArabic column to QrProductMaster';
END
ELSE
BEGIN
    PRINT 'AllergiesArabic column already exists in QrProductMaster';
END
GO

PRINT 'Script completed successfully. FullDescription, FullDescriptionArabic, Allergies, and AllergiesArabic columns added to QrProductMaster.';
GO
