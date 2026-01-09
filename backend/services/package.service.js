// backend/services/package.service.js
// Service for managing package hierarchy in QR Menu

import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";

const T_QR_PRODUCT_MASTER = "dbo.QrProductMaster";
const T_QR_PRODUCT_CHILD = "dbo.QrProductChild";
const T_IMAGES = "dbo.ImageMaster";

const q = (n) => `[${n}]`;

/**
 * Get all package headers in a subgroup
 * Returns only products marked as IsPackageHeader = 1
 */
export async function getPackageHeaders(qrSubgroupId) {
  const pool = await connectToDb();
  const request = pool.request();
  
  const sql = `
    SELECT
      qpm.${q("ID")},
      qpm.${q("ProductID")},
      qpm.${q("QrGroupID")},
      qpm.${q("QrSubgroupID")},
      qpm.${q("Description")},
      qpm.${q("DescriptionArabic")},
      qpm.${q("ShortDescription")},
      qpm.${q("Specification")},
      qpm.${q("IsPackageHeader")},
      qpm.${q("SortOrder")},
      -- Get package price from QrProductChild
      (
        SELECT TOP 1 (qpc.${q("UnitPrice")} + qpc.${q("Tax1Amount")})
        FROM ${T_QR_PRODUCT_CHILD} qpc
        WHERE qpc.${q("ProductID")} = qpm.${q("ProductID")}
        ORDER BY qpc.${q("ModOn")} DESC
      ) AS price,
      -- Get Cloudinary image URL
      (
        SELECT TOP 1 im.${q("CloudinaryUrl")}
        FROM ${T_IMAGES} im
        WHERE im.${q("DocID")} = qpm.${q("ProductID")}
          AND im.${q("DocType")} = 'PRODUCT'
          AND im.${q("CloudinaryUrl")} IS NOT NULL
          AND im.${q("CloudinaryUrl")} <> ''
        ORDER BY im.${q("ID")} DESC
      ) AS cloudinaryUrl
    FROM ${T_QR_PRODUCT_MASTER} qpm
    WHERE qpm.${q("QrSubgroupID")} = @qrSubgroupId
      AND qpm.${q("IsPackageHeader")} = 1
      AND qpm.${q("IsActive")} = 1
    ORDER BY qpm.${q("SortOrder")} ASC, qpm.${q("Description")} ASC
  `;
  
  request.input("qrSubgroupId", mssql.BigInt, qrSubgroupId);
  request.timeout = 30000;
  
  const result = await request.query(sql);
  return result.recordset;
}

/**
 * Get all products that belong to a package
 * Returns products where ParentPackageID matches the given packageId
 */
export async function getPackageContents(packageProductId) {
  const pool = await connectToDb();
  const request = pool.request();
  
  const sql = `
    SELECT
      qpm.${q("ID")},
      qpm.${q("ProductID")},
      qpm.${q("ParentPackageID")},
      qpm.${q("Description")},
      qpm.${q("DescriptionArabic")},
      qpm.${q("ShortDescription")},
      qpm.${q("Specification")},
      qpm.${q("DisplayOrder")},
      -- Get product price from QrProductChild
      (
        SELECT TOP 1 (qpc.${q("UnitPrice")} + qpc.${q("Tax1Amount")})
        FROM ${T_QR_PRODUCT_CHILD} qpc
        WHERE qpc.${q("ProductID")} = qpm.${q("ProductID")}
        ORDER BY qpc.${q("ModOn")} DESC
      ) AS price,
      (
        SELECT TOP 1 qpc.${q("UnitPrice")}
        FROM ${T_QR_PRODUCT_CHILD} qpc
        WHERE qpc.${q("ProductID")} = qpm.${q("ProductID")}
        ORDER BY qpc.${q("ModOn")} DESC
      ) AS unitPrice,
      (
        SELECT TOP 1 qpc.${q("Tax1Amount")}
        FROM ${T_QR_PRODUCT_CHILD} qpc
        WHERE qpc.${q("ProductID")} = qpm.${q("ProductID")}
        ORDER BY qpc.${q("ModOn")} DESC
      ) AS tax1Amount,
      -- Get Cloudinary image URL
      (
        SELECT TOP 1 im.${q("CloudinaryUrl")}
        FROM ${T_IMAGES} im
        WHERE im.${q("DocID")} = qpm.${q("ProductID")}
          AND im.${q("DocType")} = 'PRODUCT'
          AND im.${q("CloudinaryUrl")} IS NOT NULL
          AND im.${q("CloudinaryUrl")} <> ''
        ORDER BY im.${q("ID")} DESC
      ) AS cloudinaryUrl
    FROM ${T_QR_PRODUCT_MASTER} qpm
    WHERE qpm.${q("ParentPackageID")} = @packageProductId
      AND qpm.${q("IsActive")} = 1
    ORDER BY qpm.${q("DisplayOrder")} ASC, qpm.${q("Description")} ASC
  `;
  
  request.input("packageProductId", mssql.BigInt, packageProductId);
  request.timeout = 30000;
  
  const result = await request.query(sql);
  return result.recordset;
}

/**
 * Get package header details by ProductID
 */
export async function getPackageDetails(packageProductId) {
  const pool = await connectToDb();
  const request = pool.request();
  
  const sql = `
    SELECT
      qpm.${q("ID")},
      qpm.${q("ProductID")},
      qpm.${q("QrGroupID")},
      qpm.${q("QrSubgroupID")},
      qpm.${q("Description")},
      qpm.${q("DescriptionArabic")},
      qpm.${q("ShortDescription")},
      qpm.${q("Specification")},
      qpm.${q("IsPackageHeader")},
      -- Get package price
      (
        SELECT TOP 1 (qpc.${q("UnitPrice")} + qpc.${q("Tax1Amount")})
        FROM ${T_QR_PRODUCT_CHILD} qpc
        WHERE qpc.${q("ProductID")} = qpm.${q("ProductID")}
        ORDER BY qpc.${q("ModOn")} DESC
      ) AS price,
      -- Get Cloudinary image URL
      (
        SELECT TOP 1 im.${q("CloudinaryUrl")}
        FROM ${T_IMAGES} im
        WHERE im.${q("DocID")} = qpm.${q("ProductID")}
          AND im.${q("DocType")} = 'PRODUCT'
          AND im.${q("CloudinaryUrl")} IS NOT NULL
          AND im.${q("CloudinaryUrl")} <> ''
        ORDER BY im.${q("ID")} DESC
      ) AS cloudinaryUrl,
      -- Count items in package
      (
        SELECT COUNT(*)
        FROM ${T_QR_PRODUCT_MASTER} sub
        WHERE sub.${q("ParentPackageID")} = qpm.${q("ProductID")}
          AND sub.${q("IsActive")} = 1
      ) AS itemCount
    FROM ${T_QR_PRODUCT_MASTER} qpm
    WHERE qpm.${q("ProductID")} = @packageProductId
      AND qpm.${q("IsPackageHeader")} = 1
      AND qpm.${q("IsActive")} = 1
  `;
  
  request.input("packageProductId", mssql.BigInt, packageProductId);
  request.timeout = 30000;
  
  const result = await request.query(sql);
  return result.recordset[0] || null;
}

/**
 * Set a product as a package header
 */
export async function markAsPackageHeader(productId, isPackageHeader = true) {
  const pool = await connectToDb();
  const request = pool.request();
  
  const sql = `
    UPDATE ${T_QR_PRODUCT_MASTER}
    SET 
      ${q("IsPackageHeader")} = @isPackageHeader,
      ${q("ModOn")} = GETDATE()
    WHERE ${q("ProductID")} = @productId
  `;
  
  request.input("productId", mssql.BigInt, productId);
  request.input("isPackageHeader", mssql.Bit, isPackageHeader ? 1 : 0);
  
  await request.query(sql);
  return { success: true, productId, isPackageHeader };
}

/**
 * Add a product to a package
 */
export async function addProductToPackage(productId, packageProductId, displayOrder = 0) {
  const pool = await connectToDb();
  const request = pool.request();
  
  // Verify that packageProductId is actually a package header
  const verifyRequest = pool.request();
  verifyRequest.input("packageProductId", mssql.BigInt, packageProductId);
  const verify = await verifyRequest.query(`
    SELECT ${q("IsPackageHeader")}
    FROM ${T_QR_PRODUCT_MASTER}
    WHERE ${q("ProductID")} = @packageProductId
  `);
  
  if (!verify.recordset[0]?.IsPackageHeader) {
    throw new Error("Target product is not a package header");
  }
  
  const sql = `
    UPDATE ${T_QR_PRODUCT_MASTER}
    SET 
      ${q("ParentPackageID")} = @packageProductId,
      ${q("DisplayOrder")} = @displayOrder,
      ${q("ModOn")} = GETDATE()
    WHERE ${q("ProductID")} = @productId
  `;
  
  request.input("productId", mssql.BigInt, productId);
  request.input("packageProductId", mssql.BigInt, packageProductId);
  request.input("displayOrder", mssql.Int, displayOrder);
  
  await request.query(sql);
  return { success: true, productId, packageProductId, displayOrder };
}

/**
 * Remove a product from a package
 */
export async function removeProductFromPackage(productId) {
  const pool = await connectToDb();
  const request = pool.request();
  
  const sql = `
    UPDATE ${T_QR_PRODUCT_MASTER}
    SET 
      ${q("ParentPackageID")} = NULL,
      ${q("DisplayOrder")} = 0,
      ${q("ModOn")} = GETDATE()
    WHERE ${q("ProductID")} = @productId
  `;
  
  request.input("productId", mssql.BigInt, productId);
  
  await request.query(sql);
  return { success: true, productId };
}

/**
 * Update display order of products in a package
 */
export async function updatePackageItemOrder(productId, displayOrder) {
  const pool = await connectToDb();
  const request = pool.request();
  
  const sql = `
    UPDATE ${T_QR_PRODUCT_MASTER}
    SET 
      ${q("DisplayOrder")} = @displayOrder,
      ${q("ModOn")} = GETDATE()
    WHERE ${q("ProductID")} = @productId
  `;
  
  request.input("productId", mssql.BigInt, productId);
  request.input("displayOrder", mssql.Int, displayOrder);
  
  await request.query(sql);
  return { success: true, productId, displayOrder };
}

/**
 * Create a new package from scratch
 */
export async function createPackage({
  description,
  descriptionArabic,
  shortDescription,
  price,
  qrSubgroupId,
  cloudinaryUrl = null,
}) {
  const pool = await connectToDb();
  const transaction = pool.transaction();
  
  try {
    await transaction.begin();
    
    // 1. Get the parent group ID from subgroup
    const getGroupSql = `
      SELECT ${q("QrGroupID")}
      FROM dbo.QrSubgroup
      WHERE ${q("QrSubgroupID")} = @qrSubgroupId
    `;
    const groupRequest = new mssql.Request(transaction);
    groupRequest.input("qrSubgroupId", mssql.BigInt, qrSubgroupId);
    const groupResult = await groupRequest.query(getGroupSql);
    
    if (groupResult.recordset.length === 0) {
      throw new Error("Subgroup not found");
    }
    
    const qrGroupId = groupResult.recordset[0].QrGroupID;
    
    // 2. Insert into ProductMaster to get ProductID
    // Only insert Description - ProductMaster has minimal columns
    const insertProductSql = `
      INSERT INTO dbo.ProductMaster (
        ${q("Description")},
        ${q("DescriptionArabic")}
      )
      OUTPUT INSERTED.${q("ProductID")}
      VALUES (
        @description,
        @descriptionArabic
      )
    `;
    
    const productRequest = new mssql.Request(transaction);
    productRequest.input("description", mssql.NVarChar, description);
    productRequest.input("descriptionArabic", mssql.NVarChar, descriptionArabic || description);
    const productResult = await productRequest.query(insertProductSql);
    const newProductId = productResult.recordset[0].ProductID;
    
    console.log("[PACKAGE][CREATE] Created ProductMaster with ProductID:", newProductId);
    
    // 3. Insert into QrProductMaster as package header
    const insertQrProductSql = `
      INSERT INTO ${T_QR_PRODUCT_MASTER} (
        ${q("ProductID")},
        ${q("QrGroupID")},
        ${q("QrSubgroupID")},
        ${q("Description")},
        ${q("DescriptionArabic")},
        ${q("ShortDescription")},
        ${q("IsPackageHeader")},
        ${q("IsActive")},
        ${q("SortOrder")},
        ${q("DisplayOrder")}
      )
      VALUES (
        @productId,
        @qrGroupId,
        @qrSubgroupId,
        @description,
        @descriptionArabic,
        @shortDescription,
        1,
        1,
        0,
        0
      )
    `;
    
    const qrProductRequest = new mssql.Request(transaction);
    qrProductRequest.input("productId", mssql.BigInt, newProductId);
    qrProductRequest.input("qrGroupId", mssql.BigInt, qrGroupId);
    qrProductRequest.input("qrSubgroupId", mssql.BigInt, qrSubgroupId);
    qrProductRequest.input("description", mssql.NVarChar, description);
    qrProductRequest.input("descriptionArabic", mssql.NVarChar, descriptionArabic || description);
    qrProductRequest.input("shortDescription", mssql.NVarChar, shortDescription || description);
    await qrProductRequest.query(insertQrProductSql);
    
    // 4. Insert into QrProductChild with price
    const insertPriceSql = `
      INSERT INTO ${T_QR_PRODUCT_CHILD} (
        ${q("ProductID")},
        ${q("UnitPrice")},
        ${q("Tax1Amount")}
      )
      VALUES (
        @productId,
        @price,
        0
      )
    `;
    
    const priceRequest = new mssql.Request(transaction);
    priceRequest.input("productId", mssql.BigInt, newProductId);
    priceRequest.input("price", mssql.Decimal(18, 2), price);
    await priceRequest.query(insertPriceSql);
    
    // 5. Insert image if provided
    if (cloudinaryUrl) {
      const insertImageSql = `
        INSERT INTO ${T_IMAGES} (
          ${q("DocID")},
          ${q("DocType")},
          ${q("CloudinaryUrl")}
        )
        VALUES (
          @productId,
          'PRODUCT',
          @cloudinaryUrl
        )
      `;
      
      const imageRequest = new mssql.Request(transaction);
      imageRequest.input("productId", mssql.BigInt, newProductId);
      imageRequest.input("cloudinaryUrl", mssql.NVarChar, cloudinaryUrl);
      await imageRequest.query(insertImageSql);
    }
    
    console.log("[PACKAGE][CREATE] Package creation completed successfully");
    
    await transaction.commit();
    
    return {
      success: true,
      productId: newProductId,
      message: "Package created successfully",
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

