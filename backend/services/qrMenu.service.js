// backend/services/qrMenu.service.js
import mssql from "mssql";
import { connectToDb } from "../config/dbConfig.js";
import { hasCloudinaryUrlColumn } from "./menu.service.js";
import { applyCloudinaryTransformations, generateBlurUpThumbnail } from "./cloudinary.service.js";

const T_PRODUCT_MASTER = "dbo.ProductMaster";
const T_PRODUCT_CHILD = "dbo.ProductChild";
const T_QR_MAIN_GROUP = "dbo.QrMainGroupMaster";
const T_QR_GROUP = "dbo.QrGroupMaster";
const T_QR_SUBGROUP = "dbo.QrSubgroup";
const T_QR_PRODUCT_MASTER = "dbo.QrProductMaster";
const T_QR_PRODUCT_CHILD = "dbo.QrProductChild";
const T_IMAGES = "dbo.ImageMaster";

const q = (n) => `[${n}]`;

/**
 * Get next ID for QR tables within transaction (to avoid race conditions)
 * QR Groups start from 1000, QR Subgroups start from 2000, QR Main Groups start from 3000
 */
async function getNextQrMainGroupId(tx) {
  const req = new mssql.Request(tx);
  const result = await req.query(`
    SELECT 
      CASE 
        WHEN MAX(${q("QrMainGroupID")}) IS NULL THEN 3000
        WHEN MAX(${q("QrMainGroupID")}) < 3000 THEN 3000
        ELSE MAX(${q("QrMainGroupID")}) + 1
      END AS nextId
    FROM ${T_QR_MAIN_GROUP} WITH (UPDLOCK, HOLDLOCK)
  `);
  return Number(result.recordset[0]?.nextId || 3000);
}

async function getNextQrGroupId(tx) {
  const req = new mssql.Request(tx);
  const result = await req.query(`
    SELECT 
      CASE 
        WHEN MAX(${q("QrGroupID")}) IS NULL THEN 1000
        WHEN MAX(${q("QrGroupID")}) < 1000 THEN 1000
        ELSE MAX(${q("QrGroupID")}) + 1
      END AS nextId
    FROM ${T_QR_GROUP} WITH (UPDLOCK, HOLDLOCK)
  `);
  return Number(result.recordset[0]?.nextId || 1000);
}

async function getNextQrSubgroupId(tx) {
  const req = new mssql.Request(tx);
  const result = await req.query(`
    SELECT 
      CASE 
        WHEN MAX(${q("QrSubgroupID")}) IS NULL THEN 2000
        WHEN MAX(${q("QrSubgroupID")}) < 2000 THEN 2000
        ELSE MAX(${q("QrSubgroupID")}) + 1
      END AS nextId
    FROM ${T_QR_SUBGROUP} WITH (UPDLOCK, HOLDLOCK)
  `);
  return Number(result.recordset[0]?.nextId || 2000);
}

const T_GROUP_MASTER = "dbo.GroupMaster";
const T_SUBGROUP_MASTER = "dbo.SubGroupMaster";

/**
 * List all QR Main Groups
 */
export async function listQrMainGroups() {
  const pool = await connectToDb();
  const request = pool.request();
  const sql = `
    SELECT
      ${q("ID")},
      ${q("QrMainGroupID")},
      ${q("MainGroupID")},
      ${q("MainGroupCode")},
      ${q("MainGroupDescription")},
      ${q("MainGroupDescriptionArabic")},
      ${q("SortOrder")},
      ${q("IsActive")},
      ${q("CrOn")},
      ${q("ModOn")},
      ${q("CrBy")},
      ${q("ModBy")}
    FROM ${T_QR_MAIN_GROUP}
    ORDER BY ${q("SortOrder")} ASC, ${q("MainGroupDescription")} ASC
  `;
  const result = await request.query(sql);
  return result.recordset;
}

/**
 * Create a QR Main Group
 */
export async function createQrMainGroup(mainGroupData) {
  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);

  try {
    await tx.begin();

    const qrMainGroupId = await getNextQrMainGroupId(tx);
    const req = new mssql.Request(tx);
    req.input("QrMainGroupID", mssql.BigInt, qrMainGroupId);
    req.input("MainGroupID", mssql.BigInt, mainGroupData.MainGroupID || null);
    req.input("MainGroupCode", mssql.VarChar, mainGroupData.MainGroupCode || "0");
    req.input("MainGroupDescription", mssql.VarChar, mainGroupData.MainGroupDescription || null);
    req.input("MainGroupDescriptionArabic", mssql.NVarChar, mainGroupData.MainGroupDescriptionArabic || "0");
    req.input("SortOrder", mssql.Int, mainGroupData.SortOrder || 0);
    req.input("IsActive", mssql.Bit, mainGroupData.IsActive !== undefined ? mainGroupData.IsActive : 1);
    req.input("CrBy", mssql.VarChar, mainGroupData.CrBy || "ADMIN");
    req.input("ModBy", mssql.VarChar, mainGroupData.ModBy || "ADMIN");

    const result = await req.query(`
      INSERT INTO ${T_QR_MAIN_GROUP} (
        ${q("QrMainGroupID")},
        ${q("MainGroupID")},
        ${q("MainGroupCode")},
        ${q("MainGroupDescription")},
        ${q("MainGroupDescriptionArabic")},
        ${q("SortOrder")},
        ${q("IsActive")},
        ${q("CrBy")},
        ${q("CrOn")},
        ${q("ModBy")},
        ${q("ModOn")}
      ) VALUES (
        @QrMainGroupID,
        @MainGroupID,
        @MainGroupCode,
        @MainGroupDescription,
        @MainGroupDescriptionArabic,
        @SortOrder,
        @IsActive,
        @CrBy,
        GETDATE(),
        @ModBy,
        GETDATE()
      );
      SELECT SCOPE_IDENTITY() AS ID, @QrMainGroupID AS QrMainGroupID;
    `);

    await tx.commit();
    return {
      ID: result.recordset[0].ID,
      QrMainGroupID: result.recordset[0].QrMainGroupID,
      ...mainGroupData
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Update a QR Main Group
 */
export async function updateQrMainGroup(qrMainGroupId, updateData) {
  const pool = await connectToDb();
  const request = pool.request();

  request.input("QrMainGroupID", mssql.BigInt, qrMainGroupId);
  request.input("MainGroupID", mssql.BigInt, updateData.MainGroupID !== undefined ? updateData.MainGroupID : null);
  request.input("MainGroupCode", mssql.VarChar, updateData.MainGroupCode || "0");
  request.input("MainGroupDescription", mssql.VarChar, updateData.MainGroupDescription);
  request.input("MainGroupDescriptionArabic", mssql.NVarChar, updateData.MainGroupDescriptionArabic || "0");
  request.input("SortOrder", mssql.Int, updateData.SortOrder || 0);
  request.input("IsActive", mssql.Bit, updateData.IsActive !== undefined ? updateData.IsActive : 1);
  request.input("ModBy", mssql.VarChar, updateData.ModBy || "ADMIN");

  await request.query(`
    UPDATE ${T_QR_MAIN_GROUP}
    SET
      ${q("MainGroupID")} = @MainGroupID,
      ${q("MainGroupCode")} = @MainGroupCode,
      ${q("MainGroupDescription")} = @MainGroupDescription,
      ${q("MainGroupDescriptionArabic")} = @MainGroupDescriptionArabic,
      ${q("SortOrder")} = @SortOrder,
      ${q("IsActive")} = @IsActive,
      ${q("ModBy")} = @ModBy,
      ${q("ModOn")} = GETDATE()
    WHERE ${q("QrMainGroupID")} = @QrMainGroupID
  `);

  return { success: true, QrMainGroupID: qrMainGroupId };
}

/**
 * Delete a QR Main Group
 */
export async function deleteQrMainGroup(qrMainGroupId) {
  const pool = await connectToDb();
  const request = pool.request();

  const checkGroups = await request
    .input("QrMainGroupID", mssql.BigInt, qrMainGroupId)
    .query(`SELECT COUNT(*) AS count FROM ${T_QR_GROUP} WHERE ${q("QrMainGroupID")} = @QrMainGroupID`);

  if (checkGroups.recordset[0]?.count > 0) {
    throw new Error("Cannot delete main group: QR groups are assigned to this main group. Please reassign groups first.");
  }

  await request
    .input("QrMainGroupID", mssql.BigInt, qrMainGroupId)
    .query(`DELETE FROM ${T_QR_MAIN_GROUP} WHERE ${q("QrMainGroupID")} = @QrMainGroupID`);

  return { success: true, QrMainGroupID: qrMainGroupId };
}

/**
 * Fetch all products from ProductMaster with normal group and subgroup information
 * filters: { searchTerm, groupId, subgroupId }
 */
export async function getAllProductsFromMaster(filters = {}) {
  const pool = await connectToDb();
  const request = pool.request();
  let whereClause = "WHERE 1=1";

  if (filters.searchTerm) {
    const search = `%${filters.searchTerm}%`;
    whereClause += `
      AND (
        pm.${q("Description")} LIKE @searchTerm OR
        pm.${q("DescriptionArabic")} LIKE @searchTerm OR
        CAST(pm.${q("ProductID")} AS NVARCHAR(50)) LIKE @searchTerm OR
        pm.${q("BarCode")} LIKE @searchTerm OR
        gm.${q("GroupDescription")} LIKE @searchTerm OR
        sgm.${q("SubGroupDescription")} LIKE @searchTerm
      )
    `;
    request.input("searchTerm", mssql.NVarChar, search);
  }

  if (filters.groupId) {
    whereClause += ` AND pm.${q("GroupID")} = @groupId`;
    request.input("groupId", mssql.BigInt, filters.groupId);
  }

  if (filters.subgroupId) {
    whereClause += ` AND pm.${q("SubGroupID")} = @subgroupId`;
    request.input("subgroupId", mssql.BigInt, filters.subgroupId);
  }

  // Filter out RAW MATERIAL and similar product types - only show Normal products
  whereClause += ` AND (pm.${q("ProductType")} IS NULL OR UPPER(LTRIM(RTRIM(pm.${q("ProductType")}))) = 'NORMAL')`;

  const sql = `
    SELECT
      pm.${q("ID")},
      pm.${q("ProductID")},
      pm.${q("Description")},
      pm.${q("DescriptionArabic")},
      pm.${q("ShortDescription")},
      pm.${q("GroupID")},
      pm.${q("SubGroupID")},
      pm.${q("BarCode")},
      pm.${q("Specification")},
      pm.${q("ProductType")},
      pm.${q("ModOn")},
      pm.${q("CrOn")},
      -- Normal Group information
      gm.${q("GroupDescription")} AS NormalGroupDescription,
      gm.${q("GroupDescriptionArabic")} AS NormalGroupDescriptionArabic,
      gm.${q("GroupCode")} AS NormalGroupCode,
      -- Normal Subgroup information
      sgm.${q("SubGroupDescription")} AS NormalSubgroupDescription,
      sgm.${q("SubGroupDescriptionArabic")} AS NormalSubgroupDescriptionArabic,
      sgm.${q("SubGroupCode")} AS NormalSubgroupCode,
      -- Get price from ProductChild (latest or first)
      (
        SELECT TOP 1 pc.${q("UnitPrice")}
        FROM ${T_PRODUCT_CHILD} pc
        WHERE pc.${q("ProductID")} = pm.${q("ProductID")}
        ORDER BY pc.${q("ModOn")} DESC, pc.${q("CrOn")} DESC
      ) AS UnitPrice,
      (
        SELECT TOP 1 pc.${q("Tax1Amount")}
        FROM ${T_PRODUCT_CHILD} pc
        WHERE pc.${q("ProductID")} = pm.${q("ProductID")}
        ORDER BY pc.${q("ModOn")} DESC, pc.${q("CrOn")} DESC
      ) AS Tax1Amount,
      (
        SELECT TOP 1 pc.${q("StationID")}
        FROM ${T_PRODUCT_CHILD} pc
        WHERE pc.${q("ProductID")} = pm.${q("ProductID")}
        ORDER BY pc.${q("ModOn")} DESC, pc.${q("CrOn")} DESC
      ) AS StationID
    FROM ${T_PRODUCT_MASTER} pm WITH (NOLOCK)
    LEFT JOIN ${T_GROUP_MASTER} gm ON gm.${q("GroupID")} = pm.${q("GroupID")}
    LEFT JOIN ${T_SUBGROUP_MASTER} sgm ON sgm.${q("SubGroupID")} = pm.${q("SubGroupID")}
    ${whereClause}
    ORDER BY pm.${q("Description")} ASC
  `;
  const result = await request.query(sql);
  return result.recordset;
}

/**
 * List all QR Groups
 */
export async function listQrGroups() {
  const pool = await connectToDb();
  const request = pool.request();
  const sql = `
    SELECT
      qg.${q("ID")},
      qg.${q("QrGroupID")},
      qg.${q("QrMainGroupID")},
      qg.${q("GroupID")},
      qg.${q("GroupDescription")},
      qg.${q("GroupDescriptionArabic")},
      qg.${q("GroupCode")},
      qg.${q("keyshift")},
      qg.${q("SortOrder")},
      qg.${q("IsActive")},
      qg.${q("CrOn")},
      qg.${q("ModOn")},
      qg.${q("CrBy")},
      qg.${q("ModBy")},
      qmg.${q("MainGroupDescription")} AS QrMainGroupDescription
    FROM ${T_QR_GROUP} qg
    LEFT JOIN ${T_QR_MAIN_GROUP} qmg ON qmg.${q("QrMainGroupID")} = qg.${q("QrMainGroupID")}
    ORDER BY qg.${q("SortOrder")} ASC, qg.${q("GroupDescription")} ASC
  `;
  const result = await request.query(sql);
  return result.recordset;
}

/**
 * Create a QR Group
 */
export async function createQrGroup(groupData) {
  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);
  
  try {
    await tx.begin();
    
    const qrGroupId = await getNextQrGroupId(tx);
    
    const sql = `
      INSERT INTO ${T_QR_GROUP} (
        ${q("QrGroupID")},
        ${q("QrMainGroupID")},
        ${q("GroupID")},
        ${q("GroupDescription")},
        ${q("GroupDescriptionArabic")},
        ${q("GroupCode")},
        ${q("keyshift")},
        ${q("SortOrder")},
        ${q("IsActive")},
        ${q("CrOn")},
        ${q("ModOn")},
        ${q("CrBy")},
        ${q("ModBy")}
      ) VALUES (
        @QrGroupID,
        @QrMainGroupID,
        @GroupID,
        @GroupDescription,
        @GroupDescriptionArabic,
        @GroupCode,
        @keyshift,
        @SortOrder,
        @IsActive,
        GETDATE(),
        GETDATE(),
        @CrBy,
        @ModBy
      );
      SELECT SCOPE_IDENTITY() AS ID, @QrGroupID AS QrGroupID;
    `;
    
    const req = new mssql.Request(tx);
    req.input("QrGroupID", mssql.BigInt, qrGroupId);
    req.input("QrMainGroupID", mssql.BigInt, groupData.QrMainGroupID || null);
    req.input("GroupID", mssql.BigInt, groupData.GroupID || null);
    req.input("GroupDescription", mssql.NVarChar, groupData.GroupDescription || null);
    req.input("GroupDescriptionArabic", mssql.NVarChar, groupData.GroupDescriptionArabic || null);
    req.input("GroupCode", mssql.VarChar, groupData.GroupCode || null);
    req.input("keyshift", mssql.Bit, groupData.keyshift !== undefined ? groupData.keyshift : 1);
    req.input("SortOrder", mssql.Int, groupData.SortOrder || 0);
    req.input("IsActive", mssql.Bit, groupData.IsActive !== undefined ? groupData.IsActive : 1);
    req.input("CrBy", mssql.NVarChar, groupData.CrBy || null);
    req.input("ModBy", mssql.NVarChar, groupData.ModBy || null);
    
    const result = await req.query(sql);
    await tx.commit();
    
    return {
      ID: result.recordset[0].ID,
      QrGroupID: result.recordset[0].QrGroupID,
      ...groupData
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Update a QR Group
 */
export async function updateQrGroup(qrGroupId, updateData) {
  const pool = await connectToDb();
  const request = pool.request();
  
  const sql = `
    UPDATE ${T_QR_GROUP}
    SET
      ${q("GroupID")} = @GroupID,
      ${q("QrMainGroupID")} = @QrMainGroupID,
      ${q("GroupDescription")} = @GroupDescription,
      ${q("GroupDescriptionArabic")} = @GroupDescriptionArabic,
      ${q("GroupCode")} = @GroupCode,
      ${q("keyshift")} = @keyshift,
      ${q("SortOrder")} = @SortOrder,
      ${q("IsActive")} = @IsActive,
      ${q("ModOn")} = GETDATE(),
      ${q("ModBy")} = @ModBy
    WHERE ${q("QrGroupID")} = @QrGroupID
  `;
  
  request.input("QrGroupID", mssql.BigInt, qrGroupId);
  request.input("QrMainGroupID", mssql.BigInt, updateData.QrMainGroupID !== undefined ? updateData.QrMainGroupID : null);
  request.input("GroupID", mssql.BigInt, updateData.GroupID !== undefined ? updateData.GroupID : null);
  request.input("GroupDescription", mssql.NVarChar, updateData.GroupDescription);
  request.input("GroupDescriptionArabic", mssql.NVarChar, updateData.GroupDescriptionArabic || null);
  request.input("GroupCode", mssql.VarChar, updateData.GroupCode || null);
  request.input("keyshift", mssql.Bit, updateData.keyshift !== undefined ? updateData.keyshift : 1);
  request.input("SortOrder", mssql.Int, updateData.SortOrder || 0);
  request.input("IsActive", mssql.Bit, updateData.IsActive !== undefined ? updateData.IsActive : 1);
  request.input("ModBy", mssql.NVarChar, updateData.ModBy || null);
  
  await request.query(sql);
  return { success: true, QrGroupID: qrGroupId };
}

/**
 * Delete a QR Group
 */
export async function deleteQrGroup(qrGroupId) {
  const pool = await connectToDb();
  const request = pool.request();
  
  // Check if group has products assigned
  const checkProducts = await request
    .input("QrGroupID", mssql.BigInt, qrGroupId)
    .query(`SELECT COUNT(*) AS count FROM ${T_QR_PRODUCT_MASTER} WHERE ${q("QrGroupID")} = @QrGroupID`);
  
  if (checkProducts.recordset[0]?.count > 0) {
    throw new Error("Cannot delete group: Products are assigned to this group. Please remove products first.");
  }
  
  // Delete subgroups first (CASCADE will handle this, but we do it explicitly)
  await request
    .input("QrGroupID", mssql.BigInt, qrGroupId)
    .query(`DELETE FROM ${T_QR_SUBGROUP} WHERE ${q("QrGroupID")} = @QrGroupID`);
  
  // Delete group
  await request
    .input("QrGroupID", mssql.BigInt, qrGroupId)
    .query(`DELETE FROM ${T_QR_GROUP} WHERE ${q("QrGroupID")} = @QrGroupID`);
  
  return { success: true, QrGroupID: qrGroupId };
}

/**
 * List QR Subgroups (optionally filtered by qrGroupId)
 */
export async function listQrSubgroups(qrGroupId = null) {
  const pool = await connectToDb();
  const request = pool.request();
  
  let whereClause = "";
  if (qrGroupId) {
    whereClause = `WHERE ${q("QrGroupID")} = @QrGroupID`;
    request.input("QrGroupID", mssql.BigInt, qrGroupId);
  }
  
  const sql = `
    SELECT
      ${q("ID")},
      ${q("QrSubgroupID")},
      ${q("QrGroupID")},
      ${q("SubGroupID")},
      ${q("SubgroupDescription")},
      ${q("SubgroupDescriptionArabic")},
      ${q("SubgroupCode")},
      ${q("SortOrder")},
      ${q("IsActive")},
      ${q("CrOn")},
      ${q("ModOn")},
      ${q("CrBy")},
      ${q("ModBy")}
    FROM ${T_QR_SUBGROUP}
    ${whereClause}
    ORDER BY ${q("SortOrder")} ASC, ${q("SubgroupDescription")} ASC
  `;
  const result = await request.query(sql);
  return result.recordset;
}

/**
 * Create a QR Subgroup
 */
export async function createQrSubgroup(subgroupData) {
  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);
  
  try {
    await tx.begin();
    
    // Validate that QrGroupID exists
    const checkGroup = await new mssql.Request(tx)
      .input("QrGroupID", mssql.BigInt, subgroupData.QrGroupID)
      .query(`SELECT ${q("QrGroupID")} FROM ${T_QR_GROUP} WHERE ${q("QrGroupID")} = @QrGroupID`);
    
    if (checkGroup.recordset.length === 0) {
      throw new Error(`QR Group with ID ${subgroupData.QrGroupID} does not exist`);
    }
    
    const qrSubgroupId = await getNextQrSubgroupId(tx);
    
    const sql = `
      INSERT INTO ${T_QR_SUBGROUP} (
        ${q("QrSubgroupID")},
        ${q("QrGroupID")},
        ${q("SubGroupID")},
        ${q("SubgroupDescription")},
        ${q("SubgroupDescriptionArabic")},
        ${q("SubgroupCode")},
        ${q("SortOrder")},
        ${q("IsActive")},
        ${q("CrOn")},
        ${q("ModOn")},
        ${q("CrBy")},
        ${q("ModBy")}
      ) VALUES (
        @QrSubgroupID,
        @QrGroupID,
        @SubGroupID,
        @SubgroupDescription,
        @SubgroupDescriptionArabic,
        @SubgroupCode,
        @SortOrder,
        @IsActive,
        GETDATE(),
        GETDATE(),
        @CrBy,
        @ModBy
      );
      SELECT SCOPE_IDENTITY() AS ID, @QrSubgroupID AS QrSubgroupID;
    `;
    
    const req = new mssql.Request(tx);
    req.input("QrSubgroupID", mssql.BigInt, qrSubgroupId);
    req.input("QrGroupID", mssql.BigInt, subgroupData.QrGroupID);
    req.input("SubGroupID", mssql.BigInt, subgroupData.SubGroupID || null);
    req.input("SubgroupDescription", mssql.NVarChar, subgroupData.SubgroupDescription || null);
    req.input("SubgroupDescriptionArabic", mssql.NVarChar, subgroupData.SubgroupDescriptionArabic || null);
    req.input("SubgroupCode", mssql.VarChar, subgroupData.SubgroupCode || null);
    req.input("SortOrder", mssql.Int, subgroupData.SortOrder || 0);
    req.input("IsActive", mssql.Bit, subgroupData.IsActive !== undefined ? subgroupData.IsActive : 1);
    req.input("CrBy", mssql.NVarChar, subgroupData.CrBy || null);
    req.input("ModBy", mssql.NVarChar, subgroupData.ModBy || null);
    
    const result = await req.query(sql);
    await tx.commit();
    
    return {
      ID: result.recordset[0].ID,
      QrSubgroupID: result.recordset[0].QrSubgroupID,
      ...subgroupData
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Update a QR Subgroup
 */
export async function updateQrSubgroup(qrSubgroupId, updateData) {
  const pool = await connectToDb();
  const request = pool.request();
  
  const sql = `
    UPDATE ${T_QR_SUBGROUP}
    SET
      ${q("QrGroupID")} = @QrGroupID,
      ${q("SubGroupID")} = @SubGroupID,
      ${q("SubgroupDescription")} = @SubgroupDescription,
      ${q("SubgroupDescriptionArabic")} = @SubgroupDescriptionArabic,
      ${q("SubgroupCode")} = @SubgroupCode,
      ${q("SortOrder")} = @SortOrder,
      ${q("IsActive")} = @IsActive,
      ${q("ModOn")} = GETDATE(),
      ${q("ModBy")} = @ModBy
    WHERE ${q("QrSubgroupID")} = @QrSubgroupID
  `;
  
  request.input("QrSubgroupID", mssql.BigInt, qrSubgroupId);
  request.input("QrGroupID", mssql.BigInt, updateData.QrGroupID);
  request.input("SubGroupID", mssql.BigInt, updateData.SubGroupID !== undefined ? updateData.SubGroupID : null);
  request.input("SubgroupDescription", mssql.NVarChar, updateData.SubgroupDescription);
  request.input("SubgroupDescriptionArabic", mssql.NVarChar, updateData.SubgroupDescriptionArabic || null);
  request.input("SubgroupCode", mssql.VarChar, updateData.SubgroupCode || null);
  request.input("SortOrder", mssql.Int, updateData.SortOrder || 0);
  request.input("IsActive", mssql.Bit, updateData.IsActive !== undefined ? updateData.IsActive : 1);
  request.input("ModBy", mssql.NVarChar, updateData.ModBy || null);
  
  await request.query(sql);
  return { success: true, QrSubgroupID: qrSubgroupId };
}

/**
 * Delete a QR Subgroup
 */
export async function deleteQrSubgroup(qrSubgroupId) {
  const pool = await connectToDb();
  const request = pool.request();
  
  // Check if subgroup has products assigned
  const checkProducts = await request
    .input("QrSubgroupID", mssql.BigInt, qrSubgroupId)
    .query(`SELECT COUNT(*) AS count FROM ${T_QR_PRODUCT_MASTER} WHERE ${q("QrSubgroupID")} = @QrSubgroupID`);
  
  if (checkProducts.recordset[0]?.count > 0) {
    throw new Error("Cannot delete subgroup: Products are assigned to this subgroup. Please remove products first.");
  }
  
  await request
    .input("QrSubgroupID", mssql.BigInt, qrSubgroupId)
    .query(`DELETE FROM ${T_QR_SUBGROUP} WHERE ${q("QrSubgroupID")} = @QrSubgroupID`);
  
  return { success: true, QrSubgroupID: qrSubgroupId };
}

/**
 * List QR Products (optionally filtered)
 */
export async function listQrProducts(filters = {}) {
  const pool = await connectToDb();
  const request = pool.request();
  
  let whereClause = "WHERE 1=1";
  
  if (filters.qrGroupId) {
    whereClause += ` AND qpm.${q("QrGroupID")} = @qrGroupId`;
    request.input("qrGroupId", mssql.BigInt, filters.qrGroupId);
  }
  
  if (filters.qrSubgroupId) {
    whereClause += ` AND qpm.${q("QrSubgroupID")} = @qrSubgroupId`;
    request.input("qrSubgroupId", mssql.BigInt, filters.qrSubgroupId);
  }
  
  if (filters.isActive !== undefined) {
    whereClause += ` AND qpm.${q("IsActive")} = @isActive`;
    request.input("isActive", mssql.Bit, filters.isActive);
  }
  
  const sql = `
    SELECT
      qpm.*,
      qg.${q("GroupDescription")} AS QrGroupDescription,
      qsg.${q("SubgroupDescription")} AS QrSubgroupDescription
    FROM ${T_QR_PRODUCT_MASTER} qpm WITH (NOLOCK)
    LEFT JOIN ${T_QR_GROUP} qg WITH (NOLOCK) ON qg.${q("QrGroupID")} = qpm.${q("QrGroupID")}
    LEFT JOIN ${T_QR_SUBGROUP} qsg WITH (NOLOCK) ON qsg.${q("QrSubgroupID")} = qpm.${q("QrSubgroupID")}
    ${whereClause}
    ORDER BY qpm.${q("ModOn")} DESC
    OPTION (RECOMPILE) -- Force fresh query plan to avoid stale data after updates
  `;
  
  const result = await request.query(sql);
  return result.recordset;
}

/**
 * Validate that GroupID and SubGroupID exist in their respective master tables
 * Returns validated IDs (or null if invalid/doesn't exist)
 */
async function validateGroupAndSubgroupIds(tx, groupId, subGroupId) {
  let validatedGroupId = null;
  let validatedSubGroupId = null;
  
  // Validate GroupID if provided
  if (groupId) {
    const checkGroup = await new mssql.Request(tx)
      .input("GroupID", mssql.BigInt, groupId)
      .query(`SELECT ${q("GroupID")} FROM ${T_GROUP_MASTER} WHERE ${q("GroupID")} = @GroupID`);
    
    if (checkGroup.recordset.length > 0) {
      validatedGroupId = groupId;
    }
  }
  
  // Validate SubGroupID if provided
  if (subGroupId) {
    const checkSubGroup = await new mssql.Request(tx)
      .input("SubGroupID", mssql.BigInt, subGroupId)
      .query(`SELECT ${q("SubGroupID")} FROM ${T_SUBGROUP_MASTER} WHERE ${q("SubGroupID")} = @SubGroupID`);
    
    if (checkSubGroup.recordset.length > 0) {
      validatedSubGroupId = subGroupId;
    }
  }
  
  return { validatedGroupId, validatedSubGroupId };
}

/**
 * Add product to QR Menu (from ProductMaster)
 */
export async function addProductToQrMenu(productData) {
  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);
  
  try {
    await tx.begin();
    
    // Validate ProductID exists in ProductMaster
    const checkProduct = await new mssql.Request(tx)
      .input("ProductID", mssql.BigInt, productData.ProductID)
      .query(`SELECT ${q("ProductID")} FROM ${T_PRODUCT_MASTER} WHERE ${q("ProductID")} = @ProductID`);
    
    if (checkProduct.recordset.length === 0) {
      throw new Error(`Product with ID ${productData.ProductID} does not exist in ProductMaster`);
    }
    
    // Get product details from ProductMaster (including GroupID, SubGroupID, and ProductType)
    const productDetails = await new mssql.Request(tx)
      .input("ProductID", mssql.BigInt, productData.ProductID)
      .query(`
        SELECT 
          ${q("Description")},
          ${q("DescriptionArabic")},
          ${q("ShortDescription")},
          ${q("BarCode")},
          ${q("Specification")},
          ${q("GroupID")},
          ${q("SubGroupID")},
          ${q("ProductType")}
        FROM ${T_PRODUCT_MASTER}
        WHERE ${q("ProductID")} = @ProductID
      `);
    
    const details = productDetails.recordset[0];
    
    // Validate GroupID and SubGroupID exist in master tables
    const { validatedGroupId, validatedSubGroupId } = await validateGroupAndSubgroupIds(
      tx,
      details?.GroupID || null,
      details?.SubGroupID || null
    );
    
    // Insert into QrProductMaster (including normal GroupID, SubGroupID, and ProductType)
    await new mssql.Request(tx)
      .input("ProductID", mssql.BigInt, productData.ProductID)
      .input("GroupID", mssql.BigInt, validatedGroupId)
      .input("SubGroupID", mssql.BigInt, validatedSubGroupId)
      .input("QrGroupID", mssql.BigInt, productData.QrGroupID || null)
      .input("QrSubgroupID", mssql.BigInt, productData.QrSubgroupID || null)
      .input("Description", mssql.NVarChar, details?.Description || null)
      .input("DescriptionArabic", mssql.NVarChar, details?.DescriptionArabic || null)
      .input("ShortDescription", mssql.NVarChar, details?.ShortDescription || null)
      .input("BarCode", mssql.NVarChar, details?.BarCode || null)
      .input("Specification", mssql.NVarChar, details?.Specification || null)
      .input("ProductType", mssql.NVarChar, details?.ProductType || null)
      .input("IsActive", mssql.Bit, productData.IsActive !== undefined ? productData.IsActive : 1)
      .input("CrBy", mssql.NVarChar, "ADMIN")
      .input("ModBy", mssql.NVarChar, "ADMIN")
      .query(`
        INSERT INTO ${T_QR_PRODUCT_MASTER} (
          ${q("ProductID")},
          ${q("GroupID")},
          ${q("SubGroupID")},
          ${q("QrGroupID")},
          ${q("QrSubgroupID")},
          ${q("Description")},
          ${q("DescriptionArabic")},
          ${q("ShortDescription")},
          ${q("BarCode")},
          ${q("Specification")},
          ${q("ProductType")},
          ${q("IsActive")},
          ${q("CrOn")},
          ${q("ModOn")},
          ${q("CrBy")},
          ${q("ModBy")}
        ) VALUES (
          @ProductID,
          @GroupID,
          @SubGroupID,
          @QrGroupID,
          @QrSubgroupID,
          @Description,
          @DescriptionArabic,
          @ShortDescription,
          @BarCode,
          @Specification,
          @ProductType,
          @IsActive,
          GETDATE(),
          GETDATE(),
          @CrBy,
          @ModBy
        )
      `);
    
    // Copy price data from ProductChild to QrProductChild
    const productChildData = await new mssql.Request(tx)
      .input("ProductID", mssql.BigInt, productData.ProductID)
      .query(`
        SELECT 
          ${q("StationID")},
          ${q("UnitPrice")},
          ${q("Tax1Amount")},
          ${q("Tax2Amount")},
          ${q("PackQty")}
        FROM ${T_PRODUCT_CHILD}
        WHERE ${q("ProductID")} = @ProductID
        ORDER BY ${q("ModOn")} DESC, ${q("CrOn")} DESC
      `);
    
    if (productChildData.recordset.length > 0) {
      for (const child of productChildData.recordset) {
        await new mssql.Request(tx)
          .input("ProductID", mssql.BigInt, productData.ProductID)
          .input("StationID", mssql.Int, child.StationID || null)
          .input("UnitPrice", mssql.Decimal(18, 2), child.UnitPrice || 0)
          .input("Tax1Amount", mssql.Decimal(18, 2), child.Tax1Amount || 0)
          .input("Tax2Amount", mssql.Decimal(18, 2), child.Tax2Amount || 0)
          .input("PackQty", mssql.Decimal(18, 2), child.PackQty || 1)
          .input("CrBy", mssql.NVarChar, "ADMIN")
          .input("ModBy", mssql.NVarChar, "ADMIN")
          .query(`
            INSERT INTO ${T_QR_PRODUCT_CHILD} (
              ${q("ProductID")},
              ${q("StationID")},
              ${q("UnitPrice")},
              ${q("Tax1Amount")},
              ${q("Tax2Amount")},
              ${q("PackQty")},
              ${q("IsActive")},
              ${q("CrOn")},
              ${q("ModOn")},
              ${q("CrBy")},
              ${q("ModBy")}
            ) VALUES (
              @ProductID,
              @StationID,
              @UnitPrice,
              @Tax1Amount,
              @Tax2Amount,
              @PackQty,
              1,
              GETDATE(),
              GETDATE(),
              @CrBy,
              @ModBy
            )
          `);
      }
    }
    
    await tx.commit();
    return { success: true, ProductID: productData.ProductID };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Update QR product assignment (inline editing)
 */
export async function updateQrProductAssignment(productId, updateData) {
  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);
  
  try {
    await tx.begin();
    
    // Check if product exists in QR menu
    const checkExisting = await new mssql.Request(tx)
      .input("ProductID", mssql.BigInt, productId)
      .query(`SELECT ${q("ID")} FROM ${T_QR_PRODUCT_MASTER} WHERE ${q("ProductID")} = @ProductID`);
    
    if (checkExisting.recordset.length === 0) {
      // Create new entry - but only if QrGroupID is provided
      if (!updateData.QrGroupID) {
        throw new Error("QR Group is required to add product to QR menu");
      }
      
      const productDetails = await new mssql.Request(tx)
        .input("ProductID", mssql.BigInt, productId)
        .query(`
          SELECT 
            ${q("Description")},
            ${q("DescriptionArabic")},
            ${q("ShortDescription")},
            ${q("BarCode")},
            ${q("Specification")},
            ${q("GroupID")},
            ${q("SubGroupID")},
            ${q("ProductType")}
          FROM ${T_PRODUCT_MASTER}
          WHERE ${q("ProductID")} = @ProductID
        `);
      
      const details = productDetails.recordset[0];
      
      // Validate GroupID and SubGroupID exist in master tables
      const { validatedGroupId, validatedSubGroupId } = await validateGroupAndSubgroupIds(
        tx,
        details?.GroupID || null,
        details?.SubGroupID || null
      );
      
      await new mssql.Request(tx)
        .input("ProductID", mssql.BigInt, productId)
        .input("GroupID", mssql.BigInt, validatedGroupId)
        .input("SubGroupID", mssql.BigInt, validatedSubGroupId)
        .input("QrGroupID", mssql.BigInt, updateData.QrGroupID)
        .input("QrSubgroupID", mssql.BigInt, updateData.QrSubgroupID || null)
        .input("Description", mssql.NVarChar, details?.Description || null)
        .input("DescriptionArabic", mssql.NVarChar, details?.DescriptionArabic || null)
        .input("ShortDescription", mssql.NVarChar, details?.ShortDescription || null)
        .input("FullDescription", mssql.NVarChar(mssql.MAX), updateData.FullDescription || null)
        .input("FullDescriptionArabic", mssql.NVarChar(mssql.MAX), updateData.FullDescriptionArabic || null)
        .input("Allergies", mssql.NVarChar(mssql.MAX), updateData.Allergies || null)
        .input("AllergiesArabic", mssql.NVarChar(mssql.MAX), updateData.AllergiesArabic || null)
        .input("BarCode", mssql.NVarChar, details?.BarCode || null)
        .input("Specification", mssql.NVarChar, details?.Specification || null)
        .input("ProductType", mssql.NVarChar, details?.ProductType || null)
        .input("IsActive", mssql.Bit, updateData.IsActive !== undefined ? updateData.IsActive : 1)
        .input("CrBy", mssql.NVarChar, "ADMIN")
        .input("ModBy", mssql.NVarChar, "ADMIN")
        .query(`
          INSERT INTO ${T_QR_PRODUCT_MASTER} (
            ${q("ProductID")},
            ${q("GroupID")},
            ${q("SubGroupID")},
            ${q("QrGroupID")},
            ${q("QrSubgroupID")},
            ${q("Description")},
            ${q("DescriptionArabic")},
            ${q("ShortDescription")},
            ${q("FullDescription")},
            ${q("FullDescriptionArabic")},
            ${q("Allergies")},
            ${q("AllergiesArabic")},
            ${q("BarCode")},
            ${q("Specification")},
            ${q("ProductType")},
            ${q("IsActive")},
            ${q("CrOn")},
            ${q("ModOn")},
            ${q("CrBy")},
            ${q("ModBy")}
          ) VALUES (
            @ProductID,
            @GroupID,
            @SubGroupID,
            @QrGroupID,
            @QrSubgroupID,
            @Description,
            @DescriptionArabic,
            @ShortDescription,
            @FullDescription,
            @FullDescriptionArabic,
            @Allergies,
            @AllergiesArabic,
            @BarCode,
            @Specification,
            @ProductType,
            @IsActive,
            GETDATE(),
            GETDATE(),
            @CrBy,
            @ModBy
          )
        `);
    
      // Copy price data from ProductChild to QrProductChild
      const productChildData = await new mssql.Request(tx)
        .input("ProductID", mssql.BigInt, productId)
        .query(`
          SELECT 
            ${q("StationID")},
            ${q("UnitPrice")},
            ${q("Tax1Amount")},
            ${q("Tax2Amount")},
            ${q("PackQty")}
          FROM ${T_PRODUCT_CHILD}
          WHERE ${q("ProductID")} = @ProductID
          ORDER BY ${q("ModOn")} DESC, ${q("CrOn")} DESC
        `);
      
      if (productChildData.recordset.length > 0) {
        for (const child of productChildData.recordset) {
          await new mssql.Request(tx)
            .input("ProductID", mssql.BigInt, productId)
            .input("StationID", mssql.Int, child.StationID || null)
            .input("UnitPrice", mssql.Decimal(18, 2), child.UnitPrice || 0)
            .input("Tax1Amount", mssql.Decimal(18, 2), child.Tax1Amount || 0)
            .input("Tax2Amount", mssql.Decimal(18, 2), child.Tax2Amount || 0)
            .input("PackQty", mssql.Decimal(18, 2), child.PackQty || 1)
            .input("CrBy", mssql.NVarChar, "ADMIN")
            .input("ModBy", mssql.NVarChar, "ADMIN")
            .query(`
              INSERT INTO ${T_QR_PRODUCT_CHILD} (
                ${q("ProductID")},
                ${q("StationID")},
                ${q("UnitPrice")},
                ${q("Tax1Amount")},
                ${q("Tax2Amount")},
                ${q("PackQty")},
                ${q("IsActive")},
                ${q("CrOn")},
                ${q("ModOn")},
                ${q("CrBy")},
                ${q("ModBy")}
              ) VALUES (
                @ProductID,
                @StationID,
                @UnitPrice,
                @Tax1Amount,
                @Tax2Amount,
                @PackQty,
                1,
                GETDATE(),
                GETDATE(),
                @CrBy,
                @ModBy
              )
            `);
        }
      }
    
    } else {
      // Update existing entry (preserve GroupID, SubGroupID, and ProductType from ProductMaster if not already set)
      // First, get current values and ProductMaster values
      const currentQrProduct = await new mssql.Request(tx)
        .input("ProductID", mssql.BigInt, productId)
        .query(`SELECT ${q("GroupID")}, ${q("SubGroupID")}, ${q("ProductType")} FROM ${T_QR_PRODUCT_MASTER} WHERE ${q("ProductID")} = @ProductID`);
      
      const currentGroupId = currentQrProduct.recordset[0]?.GroupID;
      const currentSubGroupId = currentQrProduct.recordset[0]?.SubGroupID;
      const currentProductType = currentQrProduct.recordset[0]?.ProductType;
      
      // If GroupID/SubGroupID/ProductType are not set, get them from ProductMaster
      let finalGroupId = currentGroupId;
      let finalSubGroupId = currentSubGroupId;
      let finalProductType = currentProductType;
      
      if (!finalGroupId || !finalSubGroupId || !finalProductType) {
        const pmProduct = await new mssql.Request(tx)
          .input("ProductID", mssql.BigInt, productId)
          .query(`SELECT ${q("GroupID")}, ${q("SubGroupID")}, ${q("ProductType")} FROM ${T_PRODUCT_MASTER} WHERE ${q("ProductID")} = @ProductID`);
        
        if (pmProduct.recordset.length > 0) {
          finalGroupId = finalGroupId || pmProduct.recordset[0].GroupID;
          finalSubGroupId = finalSubGroupId || pmProduct.recordset[0].SubGroupID;
          finalProductType = finalProductType || pmProduct.recordset[0].ProductType;
        }
      }
      
      // Validate GroupID and SubGroupID exist in master tables
      const { validatedGroupId, validatedSubGroupId } = await validateGroupAndSubgroupIds(
        tx,
        finalGroupId || null,
        finalSubGroupId || null
      );
      
      // Build dynamic UPDATE query to only update fields that are provided
      const updateFields = [];
      const req = new mssql.Request(tx);
      req.input("ProductID", mssql.BigInt, productId);
      
      // Always update these fields
      updateFields.push(`${q("GroupID")} = @GroupID`);
      req.input("GroupID", mssql.BigInt, validatedGroupId);
      updateFields.push(`${q("SubGroupID")} = @SubGroupID`);
      req.input("SubGroupID", mssql.BigInt, validatedSubGroupId);
      updateFields.push(`${q("ProductType")} = @ProductType`);
      req.input("ProductType", mssql.NVarChar, finalProductType || null);
      
      // Update QrGroupID if provided
      if (updateData.QrGroupID !== undefined) {
        updateFields.push(`${q("QrGroupID")} = @QrGroupID`);
        req.input("QrGroupID", mssql.BigInt, updateData.QrGroupID || null);
      }
      
      // Update QrSubgroupID if provided
      if (updateData.QrSubgroupID !== undefined) {
        updateFields.push(`${q("QrSubgroupID")} = @QrSubgroupID`);
        req.input("QrSubgroupID", mssql.BigInt, updateData.QrSubgroupID || null);
      }
      
      // Update IsActive if provided
      if (updateData.IsActive !== undefined) {
        updateFields.push(`${q("IsActive")} = @IsActive`);
        req.input("IsActive", mssql.Bit, updateData.IsActive);
      }
      
      // Update FullDescription if provided
      if (updateData.FullDescription !== undefined) {
        updateFields.push(`${q("FullDescription")} = @FullDescription`);
        req.input("FullDescription", mssql.NVarChar(mssql.MAX), updateData.FullDescription || null);
      }
      
      // Update FullDescriptionArabic if provided
      if (updateData.FullDescriptionArabic !== undefined) {
        updateFields.push(`${q("FullDescriptionArabic")} = @FullDescriptionArabic`);
        req.input("FullDescriptionArabic", mssql.NVarChar(mssql.MAX), updateData.FullDescriptionArabic || null);
      }
      
      // Update Allergies if provided
      if (updateData.Allergies !== undefined) {
        updateFields.push(`${q("Allergies")} = @Allergies`);
        req.input("Allergies", mssql.NVarChar(mssql.MAX), updateData.Allergies || null);
      }
      
      // Update AllergiesArabic if provided
      if (updateData.AllergiesArabic !== undefined) {
        updateFields.push(`${q("AllergiesArabic")} = @AllergiesArabic`);
        req.input("AllergiesArabic", mssql.NVarChar(mssql.MAX), updateData.AllergiesArabic || null);
      }
      
      // Always update ModOn and ModBy
      updateFields.push(`${q("ModOn")} = GETDATE()`);
      updateFields.push(`${q("ModBy")} = @ModBy`);
      req.input("ModBy", mssql.NVarChar, "ADMIN");
      
      const updateSql = `
        UPDATE ${T_QR_PRODUCT_MASTER}
        SET ${updateFields.join(",\n            ")}
        WHERE ${q("ProductID")} = @ProductID
      `;
      
      await req.query(updateSql);
    
      // If QrProductChild entries don't exist, create them
      const checkQrProductChild = await new mssql.Request(tx)
        .input("ProductID", mssql.BigInt, productId)
        .query(`SELECT COUNT(*) AS count FROM ${T_QR_PRODUCT_CHILD} WHERE ${q("ProductID")} = @ProductID`);
    
      if (checkQrProductChild.recordset[0]?.count === 0) {
        const productChildData = await new mssql.Request(tx)
          .input("ProductID", mssql.BigInt, productId)
          .query(`
            SELECT 
              ${q("StationID")},
              ${q("UnitPrice")},
              ${q("Tax1Amount")},
              ${q("Tax2Amount")},
              ${q("PackQty")}
            FROM ${T_PRODUCT_CHILD}
            WHERE ${q("ProductID")} = @ProductID
            ORDER BY ${q("ModOn")} DESC, ${q("CrOn")} DESC
          `);
        
        if (productChildData.recordset.length > 0) {
          for (const child of productChildData.recordset) {
            await new mssql.Request(tx)
              .input("ProductID", mssql.BigInt, productId)
              .input("StationID", mssql.Int, child.StationID || null)
              .input("UnitPrice", mssql.Decimal(18, 2), child.UnitPrice || 0)
              .input("Tax1Amount", mssql.Decimal(18, 2), child.Tax1Amount || 0)
              .input("Tax2Amount", mssql.Decimal(18, 2), child.Tax2Amount || 0)
              .input("PackQty", mssql.Decimal(18, 2), child.PackQty || 1)
              .input("CrBy", mssql.NVarChar, "ADMIN")
              .input("ModBy", mssql.NVarChar, "ADMIN")
              .query(`
                INSERT INTO ${T_QR_PRODUCT_CHILD} (
                  ${q("ProductID")},
                  ${q("StationID")},
                  ${q("UnitPrice")},
                  ${q("Tax1Amount")},
                  ${q("Tax2Amount")},
                  ${q("PackQty")},
                  ${q("IsActive")},
                  ${q("CrOn")},
                  ${q("ModOn")},
                  ${q("CrBy")},
                  ${q("ModBy")}
                ) VALUES (
                  @ProductID,
                  @StationID,
                  @UnitPrice,
                  @Tax1Amount,
                  @Tax2Amount,
                  @PackQty,
                  1,
                  GETDATE(),
                  GETDATE(),
                  @CrBy,
                  @ModBy
                )
              `);
          }
        }
      }
    }
    
    await tx.commit();
    return { success: true, ProductID: productId };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Remove product from QR Menu
 */
export async function removeProductFromQrMenu(productId) {
  const pool = await connectToDb();
  const tx = new mssql.Transaction(pool);
  
  try {
    await tx.begin();
    
    // Delete from QrProductChild first (CASCADE will handle this, but we do it explicitly)
    await new mssql.Request(tx)
      .input("ProductID", mssql.BigInt, productId)
      .query(`DELETE FROM ${T_QR_PRODUCT_CHILD} WHERE ${q("ProductID")} = @ProductID`);
    
    // Delete from QrProductMaster
    await new mssql.Request(tx)
      .input("ProductID", mssql.BigInt, productId)
      .query(`DELETE FROM ${T_QR_PRODUCT_MASTER} WHERE ${q("ProductID")} = @ProductID`);
    
    await tx.commit();
    return { success: true, ProductID: productId };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Get QR Menu Categories (Groups and Subgroups) for frontend menu display
 * Returns groups with their subgroups
 */
export async function getQrMenuCategories() {
  const pool = await connectToDb();
  const request = pool.request();

  const mainGroupsSql = `
    SELECT
      ${q("QrMainGroupID")} AS mainGroupId,
      ${q("MainGroupID")} AS sourceMainGroupId,
      ${q("MainGroupDescription")} AS name,
      ${q("MainGroupCode")} AS code,
      ${q("MainGroupDescriptionArabic")} AS name_ar,
      ${q("SortOrder")} AS sortOrder
    FROM ${T_QR_MAIN_GROUP}
    WHERE ${q("IsActive")} = 1
    ORDER BY ${q("SortOrder")} ASC, ${q("MainGroupDescription")} ASC
  `;

  const mainGroupsResult = await request.query(mainGroupsSql);
  const mainGroups = mainGroupsResult.recordset;
  
  // Get all active QR Groups
  const groupsSql = `
    SELECT
      ${q("QrGroupID")} AS groupId,
      ${q("QrMainGroupID")} AS mainGroupId,
      ${q("GroupDescription")} AS name,
      ${q("GroupCode")} AS code,
      ${q("GroupDescriptionArabic")} AS name_ar,
      ${q("SortOrder")} AS sortOrder
    FROM ${T_QR_GROUP}
    WHERE ${q("IsActive")} = 1
    ORDER BY ${q("SortOrder")} ASC, ${q("GroupDescription")} ASC
  `;
  
  const groupsResult = await request.query(groupsSql);
  const groups = groupsResult.recordset.map(group => ({
    ...group,
    groupId: typeof group.groupId === "number" ? group.groupId : parseInt(group.groupId) || group.groupId,
    mainGroupId: group.mainGroupId
      ? (typeof group.mainGroupId === "number" ? group.mainGroupId : parseInt(group.mainGroupId) || group.mainGroupId)
      : null
  }));
  
  // Get all active QR Subgroups
  const subgroupsSql = `
    SELECT
      ${q("QrSubgroupID")} AS subgroupId,
      ${q("QrGroupID")} AS groupId,
      ${q("SubgroupDescription")} AS name,
      ${q("SubgroupCode")} AS code,
      ${q("SubgroupDescriptionArabic")} AS name_ar,
      ${q("SortOrder")} AS sortOrder
    FROM ${T_QR_SUBGROUP}
    WHERE ${q("IsActive")} = 1
    ORDER BY ${q("SortOrder")} ASC, ${q("SubgroupDescription")} ASC
  `;
  
  const subgroupsResult = await request.query(subgroupsSql);
  const subgroups = subgroupsResult.recordset;
  
  // Group subgroups by groupId (handle both number and string types)
  const subgroupsByGroup = {};
  subgroups.forEach(subgroup => {
    // Normalize groupId to number for consistent matching
    const normalizedGroupId = typeof subgroup.groupId === 'number' 
      ? subgroup.groupId 
      : parseInt(subgroup.groupId) || subgroup.groupId;
    
    if (!subgroupsByGroup[normalizedGroupId]) {
      subgroupsByGroup[normalizedGroupId] = [];
    }
    subgroupsByGroup[normalizedGroupId].push(subgroup);
  });
  
  console.log("[QR-MENU] Groups found:", groups.length);
  console.log("[QR-MENU] Subgroups found:", subgroups.length);
  console.log("[QR-MENU] Subgroups by group:", Object.keys(subgroupsByGroup).length, "groups have subgroups");
  
  const groupsWithSubgroups = groups.map(group => {
    const groupSubgroups = subgroupsByGroup[group.groupId] || [];
    console.log(`[QR-MENU] Group ${group.name} (ID: ${group.groupId}) has ${groupSubgroups.length} subgroups`);
    return { ...group, subgroups: groupSubgroups };
  });

  const groupsByMainGroup = {};
  groupsWithSubgroups.forEach(group => {
    if (!group.mainGroupId) return;
    if (!groupsByMainGroup[group.mainGroupId]) {
      groupsByMainGroup[group.mainGroupId] = [];
    }
    groupsByMainGroup[group.mainGroupId].push(group);
  });

  const result = [
    ...mainGroups.map(mainGroup => {
      const normalizedMainGroupId = typeof mainGroup.mainGroupId === "number"
        ? mainGroup.mainGroupId
        : parseInt(mainGroup.mainGroupId) || mainGroup.mainGroupId;

      return {
        ...mainGroup,
        mainGroupId: normalizedMainGroupId,
        type: "mainGroup",
        groups: groupsByMainGroup[normalizedMainGroupId] || []
      };
    }),
    ...groupsWithSubgroups
      .filter(group => !group.mainGroupId)
      .map(group => ({ ...group, type: "group" }))
  ];
  
  console.log("[QR-MENU] Final result:", result.map(category => ({
    name: category.name,
    groupCount: category.groups?.length || 0,
    subgroupCount: category.subgroups?.length || 0
  })));
  
  return result;
}

/**
 * Get QR Menu Items (Products from QrProductMaster)
 * Similar to listMenuItems but from QrProductMaster and QrProductChild
 */
export async function getQrMenuItems({
  page = 1,
  pageSize = 24,
  search = "",
  qrMainGroupId = null,
  qrGroupId = null,
  qrSubgroupId = null,
  sort = "new",
}) {
  const pool = await connectToDb();
  const request = pool.request();
  
  // Calculate offset
  const offset = (page - 1) * pageSize;
  const limit = pageSize;
  
  // Build WHERE clause - only show products with ProductType = 'Normal' (or NULL for backwards compatibility)
  // This filters out RAW MATERIAL and other non-Normal product types
  // Include packages (IsPackageHeader = 1) - they will be displayed using PackageCard in the frontend
  let whereClause = `WHERE qpm.${q("IsActive")} = 1 AND (qpm.${q("ProductType")} IS NULL OR UPPER(LTRIM(RTRIM(qpm.${q("ProductType")}))) = 'NORMAL')`;
  
  if (search) {
    whereClause += ` AND (
      qpm.${q("Description")} LIKE @search OR
      qpm.${q("DescriptionArabic")} LIKE @search OR
      CAST(qpm.${q("ProductID")} AS NVARCHAR(50)) LIKE @search
    )`;
    request.input("search", mssql.NVarChar, `%${search}%`);
  }
  
  if (qrGroupId) {
    whereClause += ` AND qpm.${q("QrGroupID")} = @qrGroupId`;
    request.input("qrGroupId", mssql.BigInt, qrGroupId);
  }

  if (qrMainGroupId) {
    whereClause += ` AND qg.${q("QrMainGroupID")} = @qrMainGroupId`;
    request.input("qrMainGroupId", mssql.BigInt, qrMainGroupId);
  }
  
  if (qrSubgroupId) {
    whereClause += ` AND qpm.${q("QrSubgroupID")} = @qrSubgroupId`;
    request.input("qrSubgroupId", mssql.BigInt, qrSubgroupId);
  }
  
  // Determine ORDER BY
  let orderBy = `qpm.${q("ModOn")} DESC, qpm.${q("CrOn")} DESC`;
  if (qrMainGroupId && sort === "new") {
    orderBy = `qg.${q("SortOrder")} ASC, qg.${q("GroupDescription")} ASC, qsg.${q("SortOrder")} ASC, qpm.${q("ModOn")} DESC, qpm.${q("CrOn")} DESC`;
  } else if (sort === "name") {
    orderBy = `qpm.${q("Description")} ASC`;
  } else if (sort === "id_desc") {
    orderBy = `qpm.${q("ProductID")} DESC`;
  } else if (sort === "id_asc") {
    orderBy = `qpm.${q("ProductID")} ASC`;
  }
  
  // Check if CloudinaryUrl column exists (CACHED)
  const hasCloudinaryColumn = await hasCloudinaryUrlColumn();

  // OPTIMIZED: Use OUTER APPLY instead of correlated subqueries for MUCH better performance
  // This reduces from 8+ queries per row to a single efficient join
  // Added Cloudinary URL join for fast image loading
  const sql = `
    SELECT
      qpm.${q("ProductID")} AS [pm.ProductID],
      qpm.${q("Description")} AS [pm.Description],
      qpm.${q("DescriptionArabic")} AS [pm.DescriptionArabic],
      qpm.${q("ShortDescription")} AS [pm.ShortDescription],
      qpm.${q("FullDescription")} AS [pm.FullDescription],
      qpm.${q("FullDescriptionArabic")} AS [pm.FullDescriptionArabic],
      qpm.${q("Allergies")} AS [pm.Allergies],
      qpm.${q("AllergiesArabic")} AS [pm.AllergiesArabic],
      qpm.${q("BarCode")} AS [pm.BarCode],
      qpm.${q("Specification")} AS [pm.Specification],
      qpm.${q("GroupID")} AS [pm.GroupID], -- Normal GroupID from ProductMaster (used by KOT)
      qpm.${q("SubGroupID")} AS [pm.SubGroupID], -- Normal SubGroupID from ProductMaster (used by KOT)
      qpm.${q("QrGroupID")} AS [pm.QrGroupID], -- QR GroupID (for display/filtering)
      qpm.${q("QrSubgroupID")} AS [pm.QrSubgroupID], -- QR SubGroupID (for display/filtering)
      qg.${q("QrMainGroupID")} AS [pm.QrMainGroupID],
      qg.${q("GroupDescription")} AS [pm.QrGroupDescription],
      qg.${q("GroupDescriptionArabic")} AS [pm.QrGroupDescriptionArabic],
      qg.${q("SortOrder")} AS [pm.QrGroupSortOrder],
      qsg.${q("SubgroupDescription")} AS [pm.QrSubgroupDescription],
      qsg.${q("SubgroupDescriptionArabic")} AS [pm.QrSubgroupDescriptionArabic],
      qsg.${q("SortOrder")} AS [pm.QrSubgroupSortOrder],
      qpm.${q("ProductType")} AS [pm.ProductType], -- ProductType (for filtering RAW MATERIAL products)
      qpm.${q("IsPackageHeader")} AS [pm.IsPackageHeader], -- IsPackageHeader (for filtering packages from regular items)
      qpm.${q("ModOn")} AS [pm.ModOn],
      qpm.${q("CrOn")} AS [pm.CrOn],
      -- Get price and other fields from QrProductChild (latest) using OUTER APPLY (FAST)
      qpc.${q("UnitPrice")} AS [pc.UnitPrice],
      qpc.${q("Tax1Amount")} AS [pc.Tax1Amount],
      qpc.${q("Tax2Amount")} AS [pc.Tax2Amount],
      qpc.${q("PackQty")} AS [pc.PackQty],
      qpc.${q("StationID")} AS [pc.StationID],
      -- OPTIMIZED: Removed Tax1Rate and UniqueMultiProductID lookups - not used by frontend
      -- This eliminates slow ProductChild/ProductMaster lookups that were causing lag
      NULL AS [pc.Tax1Rate],
      NULL AS [pc.UniqueMultiProductID],
      -- Calculate price (UnitPrice + Tax1Amount) from QrProductChild
      (ISNULL(qpc.${q("UnitPrice")}, 0) + ISNULL(qpc.${q("Tax1Amount")}, 0)) AS price${hasCloudinaryColumn ? `,
      -- Get Cloudinary URL from ImageMaster (latest) using OUTER APPLY (FAST)
      imap.${q("CloudinaryUrl")} AS cloudinaryUrl` : ''}
    FROM ${T_QR_PRODUCT_MASTER} qpm WITH (NOLOCK)
    LEFT JOIN ${T_QR_GROUP} qg WITH (NOLOCK) ON qg.${q("QrGroupID")} = qpm.${q("QrGroupID")}
    LEFT JOIN ${T_QR_SUBGROUP} qsg WITH (NOLOCK) ON qsg.${q("QrSubgroupID")} = qpm.${q("QrSubgroupID")}
    -- Get latest QrProductChild row using OUTER APPLY (FAST - only queries QR table)
    -- This is the ONLY lookup needed for pricing - everything else comes from QR tables
    OUTER APPLY (
      SELECT TOP 1 
        qpc_inner.${q("UnitPrice")},
        qpc_inner.${q("Tax1Amount")},
        qpc_inner.${q("Tax2Amount")},
        qpc_inner.${q("PackQty")},
        qpc_inner.${q("StationID")}
      FROM ${T_QR_PRODUCT_CHILD} qpc_inner WITH (NOLOCK)
      WHERE qpc_inner.${q("ProductID")} = qpm.${q("ProductID")}
      ORDER BY qpc_inner.${q("ModOn")} DESC, qpc_inner.${q("CrOn")} DESC
    ) qpc${hasCloudinaryColumn ? `
    -- Get Cloudinary URL from ImageMaster (latest) using OUTER APPLY (FAST)
    OUTER APPLY (
      SELECT TOP 1 
        imap_inner.${q("CloudinaryUrl")}
      FROM ${T_IMAGES} imap_inner WITH (NOLOCK)
      WHERE imap_inner.${q("DocID")} = qpm.${q("ProductID")}
        AND imap_inner.${q("DocType")} = 'PRODUCT'
        AND imap_inner.${q("CloudinaryUrl")} IS NOT NULL
        AND imap_inner.${q("CloudinaryUrl")} <> ''
      ORDER BY imap_inner.${q("ID")} DESC
    ) imap` : ''}
    ${whereClause}
    ORDER BY ${orderBy}
    OFFSET @offset ROWS
    FETCH NEXT @limit ROWS ONLY
    OPTION (RECOMPILE) -- Force fresh query plan to avoid stale data after schema changes
  `;
  
  request.input("offset", mssql.Int, offset);
  request.input("limit", mssql.Int, limit);
  // Set query timeout to 15 seconds for faster failure (optimized for speed)
  request.timeout = 15000;
  
  // Performance monitoring
  const queryStartTime = Date.now();
  const result = await request.query(sql);
  const queryDuration = Date.now() - queryStartTime;
  
  // Log slow queries for monitoring
  if (queryDuration > 1000) {
    console.warn(`[PERFORMANCE] getQrMenuItems query took ${queryDuration}ms (page: ${page}, pageSize: ${pageSize})`);
  }
  
  // Diagnostic: Check total products vs returned products when filtering by qrGroupId
  if (qrGroupId) {
    const diagnosticRequest = pool.request();
    diagnosticRequest.input("qrGroupId", mssql.BigInt, qrGroupId);
    const diagnosticSql = `
      SELECT 
        COUNT(*) AS totalInGroup,
        SUM(CASE WHEN ${q("IsActive")} = 1 THEN 1 ELSE 0 END) AS activeCount,
        SUM(CASE WHEN ${q("IsActive")} = 1 AND (${q("ProductType")} IS NULL OR UPPER(LTRIM(RTRIM(${q("ProductType")}))) = 'NORMAL') THEN 1 ELSE 0 END) AS includedCount,
        SUM(CASE WHEN ${q("IsActive")} = 0 THEN 1 ELSE 0 END) AS inactiveCount,
        SUM(CASE WHEN ${q("IsActive")} = 1 AND ${q("ProductType")} IS NOT NULL AND UPPER(LTRIM(RTRIM(${q("ProductType")}))) <> 'NORMAL' THEN 1 ELSE 0 END) AS excludedByTypeCount
      FROM ${T_QR_PRODUCT_MASTER} qpm WITH (NOLOCK)
      WHERE qpm.${q("QrGroupID")} = @qrGroupId
    `;
    try {
      const diagnosticResult = await diagnosticRequest.query(diagnosticSql);
      const diag = diagnosticResult.recordset[0];
      if (diag.totalInGroup !== diag.includedCount) {
        console.warn(`[QR-MENU] Group ${qrGroupId}: Total=${diag.totalInGroup}, Active=${diag.activeCount}, Included=${diag.includedCount}, Inactive=${diag.inactiveCount}, ExcludedByType=${diag.excludedByTypeCount}`);
        
        // Show which specific products are excluded
        const excludedRequest = pool.request();
        excludedRequest.input("qrGroupId", mssql.BigInt, qrGroupId);
        const excludedSql = `
          SELECT 
            ${q("ProductID")},
            ${q("Description")},
            ${q("ShortDescription")},
            ${q("IsActive")},
            ${q("ProductType")},
            CASE 
              WHEN ${q("IsActive")} = 0 THEN 'Inactive (IsActive = 0)'
              WHEN ${q("IsActive")} = 1 AND ${q("ProductType")} IS NOT NULL AND UPPER(LTRIM(RTRIM(${q("ProductType")}))) <> 'NORMAL' THEN 'Wrong ProductType: ' + ${q("ProductType")}
              ELSE 'Should be included'
            END AS ExclusionReason
          FROM ${T_QR_PRODUCT_MASTER} qpm WITH (NOLOCK)
          WHERE qpm.${q("QrGroupID")} = @qrGroupId
            AND NOT (${q("IsActive")} = 1 AND (${q("ProductType")} IS NULL OR UPPER(LTRIM(RTRIM(${q("ProductType")}))) = 'NORMAL'))
          ORDER BY ${q("ProductID")}
        `;
        const excludedResult = await excludedRequest.query(excludedSql);
        if (excludedResult.recordset.length > 0) {
          console.warn(`[QR-MENU] ⚠️  Excluded products (${excludedResult.recordset.length}):`);
          excludedResult.recordset.forEach(prod => {
            console.warn(`[QR-MENU]   - ProductID: ${prod.ProductID}, Description: ${prod.Description || prod.ShortDescription}, Reason: ${prod.ExclusionReason}`);
          });
        }
      }
    } catch (diagError) {
      // Silently fail diagnostic - don't break the main query
      console.error(`[QR-MENU] Diagnostic query failed:`, diagError.message);
    }
  }

  // Get total count - only count products with ProductType = 'Normal' (or NULL for backwards compatibility)
  // This filters out RAW MATERIAL and other non-Normal product types
  // Include packages (IsPackageHeader = 1) - they will be displayed using PackageCard in the frontend
  const countRequest = pool.request();
  let countWhereClause = `WHERE qpm.${q("IsActive")} = 1 AND (qpm.${q("ProductType")} IS NULL OR UPPER(LTRIM(RTRIM(qpm.${q("ProductType")}))) = 'NORMAL')`;

  if (qrMainGroupId) {
    countWhereClause += ` AND qg.${q("QrMainGroupID")} = @qrMainGroupId`;
    countRequest.input("qrMainGroupId", mssql.BigInt, qrMainGroupId);
  }
  
  if (search) {
    countWhereClause += ` AND (
      qpm.${q("Description")} LIKE @search OR
      qpm.${q("DescriptionArabic")} LIKE @search OR
      CAST(qpm.${q("ProductID")} AS NVARCHAR(50)) LIKE @search
    )`;
    countRequest.input("search", mssql.NVarChar, `%${search}%`);
  }
  
  if (qrGroupId) {
    countWhereClause += ` AND qpm.${q("QrGroupID")} = @qrGroupId`;
    countRequest.input("qrGroupId", mssql.BigInt, qrGroupId);
  }
  
  if (qrSubgroupId) {
    countWhereClause += ` AND qpm.${q("QrSubgroupID")} = @qrSubgroupId`;
    countRequest.input("qrSubgroupId", mssql.BigInt, qrSubgroupId);
  }
  
  const countSql = `
    SELECT COUNT(*) AS total
    FROM ${T_QR_PRODUCT_MASTER} qpm WITH (NOLOCK)
    LEFT JOIN ${T_QR_GROUP} qg WITH (NOLOCK) ON qg.${q("QrGroupID")} = qpm.${q("QrGroupID")}
    ${countWhereClause}
    OPTION (RECOMPILE) -- Force fresh query plan to avoid stale data after schema changes
  `;
  
  // Set query timeout to 10 seconds for count query (optimized for speed)
  countRequest.timeout = 10000;
  const countStartTime = Date.now();
  const countResult = await countRequest.query(countSql);
  const countDuration = Date.now() - countStartTime;
  const total = countResult.recordset[0]?.total || 0;
  
  // Log slow count queries
  if (countDuration > 1000) {
    console.warn(`[PERFORMANCE] getQrMenuItems count query took ${countDuration}ms`);
  }
  
  // Apply Cloudinary transformations and generate blur-up thumbnails for instant loading
  const transformedData = result.recordset.map(row => {
    if (hasCloudinaryColumn && row.cloudinaryUrl && row.cloudinaryUrl.trim()) {
      const fullUrl = applyCloudinaryTransformations(row.cloudinaryUrl);
      const thumbnailUrl = generateBlurUpThumbnail(row.cloudinaryUrl);
      
      return {
        ...row,
        cloudinaryUrl: fullUrl,
        thumbnailUrl: thumbnailUrl // Tiny blurred placeholder (loads instantly)
      };
    }
    return row;
  });
  
  return {
    data: transformedData,
    paging: {
      page,
      pageSize,
      total
    }
  };
}
