-- SQL Script to update ProductType in QrProductMaster from ProductMaster
-- This copies ProductType values from ProductMaster to QrProductMaster for all existing products

-- Update QrProductMaster.ProductType from ProductMaster.ProductType
UPDATE qpm
SET qpm.[ProductType] = pm.[ProductType]
FROM [dbo].[QrProductMaster] qpm
INNER JOIN [dbo].[ProductMaster] pm ON pm.[ProductID] = qpm.[ProductID]
WHERE pm.[ProductType] IS NOT NULL;

-- Show summary of updated records
SELECT 
    COUNT(*) AS TotalProductsInQr,
    SUM(CASE WHEN [ProductType] IS NULL THEN 1 ELSE 0 END) AS ProductsWithNullType,
    SUM(CASE WHEN UPPER(LTRIM(RTRIM([ProductType]))) = 'NORMAL' THEN 1 ELSE 0 END) AS NormalProducts,
    SUM(CASE WHEN UPPER(LTRIM(RTRIM([ProductType]))) = 'RAW MATERIAL' THEN 1 ELSE 0 END) AS RawMaterialProducts,
    SUM(CASE WHEN [ProductType] IS NOT NULL AND UPPER(LTRIM(RTRIM([ProductType]))) NOT IN ('NORMAL', 'RAW MATERIAL') THEN 1 ELSE 0 END) AS OtherTypeProducts
FROM [dbo].[QrProductMaster];

PRINT 'ProductType update completed successfully!';
PRINT 'Review the summary above to see the distribution of ProductType values.';

