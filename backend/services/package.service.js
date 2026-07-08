// backend/services/package.service.js
// Service for managing package hierarchy in QR Menu

import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";
import { uploadImageToCloudinary } from "./cloudinary.service.js";

const T_QR_PRODUCT_MASTER = "dbo.QrProductMaster";
const T_QR_PRODUCT_CHILD = "dbo.QrProductChild";
const T_IMAGES = "dbo.ImageMaster";
const T_PRODUCT_MASTER = "dbo.ProductMaster";
const T_PACKAGE_ITEMS = "dbo.PackageItems";

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
      qpm.${q("Description")},
      qpm.${q("DescriptionArabic")},
      qpm.${q("ShortDescription")},
      qpm.${q("Specification")},
      pi.${q("DisplayOrder")},
      pi.${q("GroupLabel")},
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
    FROM ${T_PACKAGE_ITEMS} pi
    INNER JOIN ${T_QR_PRODUCT_MASTER} qpm ON pi.${q("ItemProductID")} = qpm.${q("ProductID")}
    WHERE pi.${q("PackageProductID")} = @packageProductId
      AND qpm.${q("IsActive")} = 1
    ORDER BY pi.${q("DisplayOrder")} ASC, qpm.${q("Description")} ASC
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
      -- Count items in package (from junction table)
      (
        SELECT COUNT(*)
        FROM ${T_PACKAGE_ITEMS} pi
        WHERE pi.${q("PackageProductID")} = qpm.${q("ProductID")}
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


export async function uploadPackageImage(packageProductId, imageBase64) {
  if (!packageProductId) throw new Error("Package ProductID is required");
  if (!imageBase64) throw new Error("Image data is required");

  const cleanBase64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Buffer.from(cleanBase64, "base64");

  const uploadResult = await uploadImageToCloudinary(
    imageBuffer,
    `package-${packageProductId}`,
    { folder: "qr-menu/packages" }
  );

  const pool = await connectToDb();
  const request = pool.request();

  request.input("productId", mssql.BigInt, packageProductId);
  request.input("cloudinaryUrl", mssql.NVarChar, uploadResult.secure_url);

  await request.query(`
    IF EXISTS (
      SELECT 1 FROM ${T_IMAGES}
      WHERE ${q("DocID")} = @productId AND ${q("DocType")} = 'PRODUCT'
    )
    BEGIN
      UPDATE ${T_IMAGES}
      SET ${q("CloudinaryUrl")} = @cloudinaryUrl
      WHERE ${q("DocID")} = @productId AND ${q("DocType")} = 'PRODUCT'
    END
    ELSE
    BEGIN
      INSERT INTO ${T_IMAGES} (${q("DocID")}, ${q("DocType")}, ${q("CloudinaryUrl")})
      VALUES (@productId, 'PRODUCT', @cloudinaryUrl)
    END
  `);

  return {
    success: true,
    productId: packageProductId,
    cloudinaryUrl: uploadResult.secure_url,
  };
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
 * Update a package header's name, description and price
 */
export async function updatePackageDetails(packageProductId, {
  description,
  descriptionArabic,
  shortDescription,
  price,
}) {
  const pool = await connectToDb();
  const transaction = pool.transaction();

  try {
    await transaction.begin();

    const verifyRequest = new mssql.Request(transaction);
    verifyRequest.input("packageProductId", mssql.BigInt, packageProductId);
    const verify = await verifyRequest.query(`
      SELECT ${q("IsPackageHeader")}
      FROM ${T_QR_PRODUCT_MASTER}
      WHERE ${q("ProductID")} = @packageProductId
    `);

    if (!verify.recordset[0]?.IsPackageHeader) {
      throw new Error("Target product is not a package header");
    }

    const qpmRequest = new mssql.Request(transaction);
    qpmRequest.input("packageProductId", mssql.BigInt, packageProductId);
    qpmRequest.input("description", mssql.NVarChar, description);
    qpmRequest.input("descriptionArabic", mssql.NVarChar, descriptionArabic || description);
    qpmRequest.input("shortDescription", mssql.NVarChar, shortDescription || description);
    await qpmRequest.query(`
      UPDATE ${T_QR_PRODUCT_MASTER}
      SET
        ${q("Description")} = @description,
        ${q("DescriptionArabic")} = @descriptionArabic,
        ${q("ShortDescription")} = @shortDescription,
        ${q("ModOn")} = GETDATE()
      WHERE ${q("ProductID")} = @packageProductId
    `);

    const productRequest = new mssql.Request(transaction);
    productRequest.input("packageProductId", mssql.BigInt, packageProductId);
    productRequest.input("description", mssql.NVarChar, description);
    productRequest.input("descriptionArabic", mssql.NVarChar, descriptionArabic || description);
    await productRequest.query(`
      UPDATE ${T_PRODUCT_MASTER}
      SET
        ${q("Description")} = @description,
        ${q("DescriptionArabic")} = @descriptionArabic
      WHERE ${q("ProductID")} = @packageProductId
    `);

    if (price !== undefined && price !== null && !Number.isNaN(Number(price))) {
      const priceRequest = new mssql.Request(transaction);
      priceRequest.input("packageProductId", mssql.BigInt, packageProductId);
      priceRequest.input("price", mssql.Decimal(18, 2), price);
      await priceRequest.query(`
        UPDATE ${T_QR_PRODUCT_CHILD}
        SET ${q("UnitPrice")} = @price
        WHERE ${q("ProductID")} = @packageProductId
      `);
    }

    await transaction.commit();

    return { success: true, productId: packageProductId };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Add a product to a package using junction table
 * Allows the same product to belong to multiple packages
 */
export async function addProductToPackage(productId, packageProductId, displayOrder = 0, groupLabel = null) {
  const pool = await connectToDb();
  
  console.log("[PACKAGE][ADD] Adding product", productId, "to package", packageProductId);
  
  // 1. Verify that packageProductId is actually a package header
  const verifyRequest = pool.request();
  verifyRequest.input("packageProductId", mssql.BigInt, packageProductId);
  const verify = await verifyRequest.query(`
    SELECT ${q("IsPackageHeader")}, ${q("QrGroupID")}, ${q("QrSubgroupID")}
    FROM ${T_QR_PRODUCT_MASTER}
    WHERE ${q("ProductID")} = @packageProductId
  `);
  
  if (!verify.recordset[0]?.IsPackageHeader) {
    throw new Error("Target product is not a package header");
  }
  
  const packageInfo = verify.recordset[0];
  
  // 2. Check if product exists in QrProductMaster
  const checkRequest = pool.request();
  checkRequest.input("productId", mssql.BigInt, productId);
  const checkResult = await checkRequest.query(`
    SELECT ${q("ProductID")}
    FROM ${T_QR_PRODUCT_MASTER}
    WHERE ${q("ProductID")} = @productId
  `);
  
  if (checkResult.recordset.length === 0) {
    // Product doesn't exist in QrProductMaster, need to copy from ProductMaster
    console.log("[PACKAGE][ADD] Product not in QrProductMaster, copying from ProductMaster");
    
    // Get product details from ProductMaster
    const getProductRequest = pool.request();
    getProductRequest.input("productId", mssql.BigInt, productId);
    const productResult = await getProductRequest.query(`
      SELECT 
        pm.${q("ProductID")},
        pm.${q("Description")},
        pm.${q("DescriptionArabic")},
        pm.${q("ProductType")},
        pc.${q("UnitPrice")},
        pc.${q("Tax1Amount")},
        pc.${q("Tax2Amount")},
        pc.${q("PackQty")}
      FROM ${T_PRODUCT_MASTER} pm
      LEFT JOIN dbo.ProductChild pc ON pc.${q("ProductID")} = pm.${q("ProductID")}
      WHERE pm.${q("ProductID")} = @productId
    `);
    
    if (productResult.recordset.length === 0) {
      throw new Error(`Product ${productId} not found in ProductMaster`);
    }
    
    const product = productResult.recordset[0];
    
    // Insert into QrProductMaster (WITHOUT ParentPackageID - we use junction table instead)
    const insertQpmRequest = pool.request();
    insertQpmRequest.input("productId", mssql.BigInt, productId);
    insertQpmRequest.input("qrGroupId", mssql.BigInt, packageInfo.QrGroupID);
    insertQpmRequest.input("qrSubgroupId", mssql.BigInt, packageInfo.QrSubgroupID);
    insertQpmRequest.input("description", mssql.NVarChar, product.Description || "");
    insertQpmRequest.input("descriptionArabic", mssql.NVarChar, product.DescriptionArabic || product.Description || "");
    insertQpmRequest.input("productType", mssql.NVarChar, product.ProductType || "");
    
    await insertQpmRequest.query(`
      INSERT INTO ${T_QR_PRODUCT_MASTER} (
        ${q("ProductID")},
        ${q("QrGroupID")},
        ${q("QrSubgroupID")},
        ${q("Description")},
        ${q("DescriptionArabic")},
        ${q("ProductType")},
        ${q("IsPackageHeader")},
        ${q("IsActive")},
        ${q("SortOrder")}
      )
      VALUES (
        @productId,
        @qrGroupId,
        @qrSubgroupId,
        @description,
        @descriptionArabic,
        @productType,
        0,
        1,
        0
      )
    `);
    
    console.log("[PACKAGE][ADD] Inserted product into QrProductMaster");
    
    // Insert into QrProductChild if pricing exists
    if (product.UnitPrice != null) {
      const insertQpcRequest = pool.request();
      insertQpcRequest.input("productId", mssql.BigInt, productId);
      insertQpcRequest.input("unitPrice", mssql.Decimal(18, 2), product.UnitPrice || 0);
      insertQpcRequest.input("tax1Amount", mssql.Decimal(18, 2), product.Tax1Amount || 0);
      insertQpcRequest.input("tax2Amount", mssql.Decimal(18, 2), product.Tax2Amount || 0);
      insertQpcRequest.input("packQty", mssql.Decimal(18, 2), product.PackQty || 1);
      
      await insertQpcRequest.query(`
        INSERT INTO ${T_QR_PRODUCT_CHILD} (
          ${q("ProductID")},
          ${q("UnitPrice")},
          ${q("Tax1Amount")},
          ${q("Tax2Amount")},
          ${q("PackQty")}
        )
        VALUES (
          @productId,
          @unitPrice,
          @tax1Amount,
          @tax2Amount,
          @packQty
        )
      `);
      
      console.log("[PACKAGE][ADD] Inserted product into QrProductChild");
    }
  } else {
    console.log("[PACKAGE][ADD] Product exists in QrProductMaster");
  }
  
  // 3. Add to junction table (allows same item in multiple packages!)
  const insertJunctionRequest = pool.request();
  insertJunctionRequest.input("packageProductId", mssql.BigInt, packageProductId);
  insertJunctionRequest.input("itemProductId", mssql.BigInt, productId);
  insertJunctionRequest.input("displayOrder", mssql.Int, displayOrder);
  insertJunctionRequest.input("groupLabel", mssql.NVarChar, groupLabel || null);

  try {
    await insertJunctionRequest.query(`
      INSERT INTO ${T_PACKAGE_ITEMS} (
        ${q("PackageProductID")},
        ${q("ItemProductID")},
        ${q("DisplayOrder")},
        ${q("GroupLabel")}
      )
      VALUES (
        @packageProductId,
        @itemProductId,
        @displayOrder,
        @groupLabel
      )
    `);
    console.log("[PACKAGE][ADD] Added item to package via junction table");
  } catch (err) {
    // If unique constraint error, update display order instead
    if (err.number === 2627) { // Unique constraint violation
      console.log("[PACKAGE][ADD] Item already in package, updating display order");
      await insertJunctionRequest.query(`
        UPDATE ${T_PACKAGE_ITEMS}
        SET ${q("DisplayOrder")} = @displayOrder,
            ${q("GroupLabel")} = @groupLabel
        WHERE ${q("PackageProductID")} = @packageProductId
          AND ${q("ItemProductID")} = @itemProductId
      `);
    } else {
      throw err;
    }
  }

  console.log("[PACKAGE][ADD] Successfully added product to package");
  return { success: true, productId, packageProductId, displayOrder, groupLabel };
}

/**
 * Update the choice-group label of an item inside a package (display only)
 */
export async function updatePackageItemGroupLabel(productId, packageProductId, groupLabel) {
  const pool = await connectToDb();
  const request = pool.request();

  request.input("productId", mssql.BigInt, productId);
  request.input("packageProductId", mssql.BigInt, packageProductId);
  request.input("groupLabel", mssql.NVarChar, groupLabel || null);

  await request.query(`
    UPDATE ${T_PACKAGE_ITEMS}
    SET ${q("GroupLabel")} = @groupLabel
    WHERE ${q("ItemProductID")} = @productId
      AND ${q("PackageProductID")} = @packageProductId
  `);

  return { success: true, productId, packageProductId, groupLabel };
}

/**
 * Remove a product from a package (delete from junction table)
 * Requires both productId and packageProductId since item can be in multiple packages
 */
export async function removeProductFromPackage(productId, packageProductId) {
  const pool = await connectToDb();
  const request = pool.request();
  
  const sql = `
    DELETE FROM ${T_PACKAGE_ITEMS}
    WHERE ${q("ItemProductID")} = @productId
      AND ${q("PackageProductID")} = @packageProductId
  `;
  
  request.input("productId", mssql.BigInt, productId);
  request.input("packageProductId", mssql.BigInt, packageProductId);
  
  await request.query(sql);
  return { success: true, productId, packageProductId };
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
 * This creates a "virtual" package product directly in QR tables without touching ProductMaster
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
    console.log("[PACKAGE][CREATE] Found QrGroupID:", qrGroupId);
    
    // 2. Generate ProductID from a high range to avoid conflicts
    // Use ProductIDs starting from 900000000000 for packages
    const getMaxIdSql = `
      SELECT ISNULL(MAX(${q("ProductID")}), 900000000000) + 1 AS NextId
      FROM ${T_PRODUCT_MASTER}
      WHERE ${q("ProductID")} >= 900000000000
    `;
    const maxIdRequest = new mssql.Request(transaction);
    const maxIdResult = await maxIdRequest.query(getMaxIdSql);
    const newProductId = maxIdResult.recordset[0].NextId;
    
    console.log("[PACKAGE][CREATE] Generated ProductID:", newProductId);
    
    // 3. Create minimal ProductMaster entry (required by FK constraint)
    const insertProductSql = `
      INSERT INTO ${T_PRODUCT_MASTER} (
        ${q("ProductID")},
        ${q("Description")},
        ${q("DescriptionArabic")}
      )
      VALUES (
        @productId,
        @description,
        @descriptionArabic
      )
    `;
    
    const productRequest = new mssql.Request(transaction);
    productRequest.input("productId", mssql.BigInt, newProductId);
    productRequest.input("description", mssql.NVarChar, description);
    productRequest.input("descriptionArabic", mssql.NVarChar, descriptionArabic || description);
    await productRequest.query(insertProductSql);
    
    console.log("[PACKAGE][CREATE] Created minimal ProductMaster entry (required by FK)");
    
    // 4. Insert into QrProductMaster as package header
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
    
    console.log("[PACKAGE][CREATE] Created QrProductMaster entry");
    
    // 5. Insert into QrProductChild with price
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
    
    console.log("[PACKAGE][CREATE] Created QrProductChild with price");
    
    // 6. Insert image if provided
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
