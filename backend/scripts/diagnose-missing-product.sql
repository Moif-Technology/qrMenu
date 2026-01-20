-- Diagnostic query to find which product is being filtered out
-- This checks all products in QrGroupID = 1000 and shows why they might be excluded

SELECT 
    ProductID,
    Description,
    ShortDescription,
    IsActive,
    ProductType,
    QrGroupID,
    QrSubgroupID,
    -- Check if product would be included in getQrMenuItems query
    CASE 
        WHEN IsActive = 0 THEN 'EXCLUDED: IsActive = 0'
        WHEN IsActive = 1 AND (ProductType IS NULL OR UPPER(LTRIM(RTRIM(ProductType))) = 'NORMAL') THEN 'INCLUDED'
        WHEN IsActive = 1 AND ProductType IS NOT NULL AND UPPER(LTRIM(RTRIM(ProductType))) <> 'NORMAL' THEN 'EXCLUDED: ProductType = ' + ProductType
        ELSE 'EXCLUDED: Unknown reason'
    END AS InclusionStatus
FROM [dbo].[QrProductMaster]
WHERE QrGroupID = 1000
ORDER BY ProductID;

-- Summary count
SELECT 
    COUNT(*) AS TotalProducts,
    SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END) AS ActiveProducts,
    SUM(CASE WHEN IsActive = 1 AND (ProductType IS NULL OR UPPER(LTRIM(RTRIM(ProductType))) = 'NORMAL') THEN 1 ELSE 0 END) AS IncludedProducts,
    SUM(CASE WHEN IsActive = 0 THEN 1 ELSE 0 END) AS InactiveProducts,
    SUM(CASE WHEN IsActive = 1 AND ProductType IS NOT NULL AND UPPER(LTRIM(RTRIM(ProductType))) <> 'NORMAL' THEN 1 ELSE 0 END) AS ExcludedByProductType
FROM [dbo].[QrProductMaster]
WHERE QrGroupID = 1000;
