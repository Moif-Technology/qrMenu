// backend/controllers/package.controller.js
import NodeCache from "node-cache";
import {
  getPackageHeaders,
  getPackageContents,
  getPackageDetails,
  markAsPackageHeader,
  addProductToPackage,
  removeProductFromPackage,
  updatePackageItemOrder,
  createPackage,
} from "../services/package.service.js";

// Cache for package data (5 minutes)
const packageCache = new NodeCache({ 
  stdTTL: 300,
  checkperiod: 60,
  useClones: false
});

/**
 * GET /api/packages/headers/:qrSubgroupId
 * Get all package headers in a subgroup
 */
export async function getPackageHeadersController(req, res, next) {
  try {
    const { qrSubgroupId } = req.params;
    
    console.log("[PACKAGE][HEADERS] Getting package headers for subgroup:", qrSubgroupId);
    
    const cacheKey = `package:headers:${qrSubgroupId}`;
    let data = packageCache.get(cacheKey);
    
    if (!data) {
      console.log("[PACKAGE][HEADERS] Cache miss, fetching from DB");
      data = await getPackageHeaders(parseInt(qrSubgroupId));
      packageCache.set(cacheKey, data);
    } else {
      console.log("[PACKAGE][HEADERS] Cache hit");
    }
    
    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    console.error("[PACKAGE][HEADERS] Error:", error);
    next(error);
  }
}

/**
 * GET /api/packages/:packageProductId/contents
 * Get all products in a package
 */
export async function getPackageContentsController(req, res, next) {
  try {
    const { packageProductId } = req.params;
    
    console.log("[PACKAGE][CONTENTS] Getting contents for package:", packageProductId);
    
    const cacheKey = `package:contents:${packageProductId}`;
    let data = packageCache.get(cacheKey);
    
    if (!data) {
      console.log("[PACKAGE][CONTENTS] Cache miss, fetching from DB");
      data = await getPackageContents(parseInt(packageProductId));
      packageCache.set(cacheKey, data);
    } else {
      console.log("[PACKAGE][CONTENTS] Cache hit");
    }
    
    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    console.error("[PACKAGE][CONTENTS] Error:", error);
    next(error);
  }
}

/**
 * GET /api/packages/:packageProductId/details
 * Get package header details
 */
export async function getPackageDetailsController(req, res, next) {
  try {
    const { packageProductId } = req.params;
    
    console.log("[PACKAGE][DETAILS] Getting details for package:", packageProductId);
    
    const cacheKey = `package:details:${packageProductId}`;
    let data = packageCache.get(cacheKey);
    
    if (!data) {
      console.log("[PACKAGE][DETAILS] Cache miss, fetching from DB");
      data = await getPackageDetails(parseInt(packageProductId));
      packageCache.set(cacheKey, data);
    } else {
      console.log("[PACKAGE][DETAILS] Cache hit");
    }
    
    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Package not found",
      });
    }
    
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[PACKAGE][DETAILS] Error:", error);
    next(error);
  }
}

/**
 * POST /api/packages/mark-header
 * Mark a product as a package header
 * Body: { productId, isPackageHeader }
 */
export async function markAsPackageHeaderController(req, res, next) {
  try {
    const { productId, isPackageHeader } = req.body;
    
    console.log("[PACKAGE][MARK-HEADER] Marking product as package header:", {
      productId,
      isPackageHeader,
    });
    
    const result = await markAsPackageHeader(parseInt(productId), isPackageHeader);
    
    // Clear cache
    packageCache.flushAll();
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[PACKAGE][MARK-HEADER] Error:", error);
    next(error);
  }
}

/**
 * POST /api/packages/add-product
 * Add a product to a package
 * Body: { productId, packageProductId, displayOrder }
 */
export async function addProductToPackageController(req, res, next) {
  try {
    const { productId, packageProductId, displayOrder } = req.body;
    
    console.log("[PACKAGE][ADD-PRODUCT] Adding product to package:", {
      productId,
      packageProductId,
      displayOrder,
    });
    
    const result = await addProductToPackage(
      parseInt(productId),
      parseInt(packageProductId),
      parseInt(displayOrder) || 0
    );
    
    // Clear cache
    packageCache.flushAll();
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[PACKAGE][ADD-PRODUCT] Error:", error);
    next(error);
  }
}

/**
 * POST /api/packages/remove-product
 * Remove a product from a package
 * Body: { productId }
 */
export async function removeProductFromPackageController(req, res, next) {
  try {
    const { productId } = req.body;
    
    console.log("[PACKAGE][REMOVE-PRODUCT] Removing product from package:", productId);
    
    const result = await removeProductFromPackage(parseInt(productId));
    
    // Clear cache
    packageCache.flushAll();
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[PACKAGE][REMOVE-PRODUCT] Error:", error);
    next(error);
  }
}

/**
 * POST /api/packages/update-order
 * Update display order of a product in a package
 * Body: { productId, displayOrder }
 */
export async function updatePackageItemOrderController(req, res, next) {
  try {
    const { productId, displayOrder } = req.body;
    
    console.log("[PACKAGE][UPDATE-ORDER] Updating product order:", {
      productId,
      displayOrder,
    });
    
    const result = await updatePackageItemOrder(
      parseInt(productId),
      parseInt(displayOrder)
    );
    
    // Clear cache
    packageCache.flushAll();
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[PACKAGE][UPDATE-ORDER] Error:", error);
    next(error);
  }
}

/**
 * POST /api/packages/create
 * Create a new package from scratch
 */
export async function createPackageController(req, res, next) {
  try {
    const { description, descriptionArabic, shortDescription, price, qrSubgroupId, cloudinaryUrl } = req.body;
    
    console.log("[PACKAGE][CREATE] Creating new package:", { description, price, qrSubgroupId });
    
    const result = await createPackage({
      description,
      descriptionArabic,
      shortDescription,
      price: parseFloat(price),
      qrSubgroupId: parseInt(qrSubgroupId),
      cloudinaryUrl,
    });
    
    // Clear caches
    packageCache.flushAll();
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[PACKAGE][CREATE] Error:", error);
    next(error);
  }
}

