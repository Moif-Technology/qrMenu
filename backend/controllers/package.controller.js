// backend/controllers/package.controller.js
import NodeCache from "node-cache";
import {
  addProductToPackage,
  createPackage,
  getPackageContents,
  getPackageDetails,
  getPackageHeaders,
  markAsPackageHeader,
  removeProductFromPackage,
  updatePackageDetails,
  updatePackageItemOrder,
  updatePackageItemGroupLabel,
  uploadPackageImage,
  setPackageVisibility,
} from "../services/package.service.js";
import { registerMenuCache, invalidateMenuCaches } from "../utils/menuCacheRegistry.js";

// Cache for package data (5 minutes)
const packageCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false
});

// Menu writes elsewhere (qr-menu product updates) also change what this cache
// serves, so it has to be reachable from the shared invalidator.
registerMenuCache("packageCache", packageCache);

/**
 * GET /api/packages/headers/:qrSubgroupId
 * Get all package headers in a subgroup
 */
export async function getPackageHeadersController(req, res, next) {
  try {
    const { qrSubgroupId } = req.params;
    // Admin console asks for hidden packages too; the diner app never does.
    const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === "1";

    console.log("[PACKAGE][HEADERS] Getting package headers for subgroup:", qrSubgroupId, { includeInactive });

    // The flag MUST be part of the key. Both audiences hit this handler, so a
    // shared key would let one admin request poison the diner listing with
    // hidden packages for the whole 300s TTL.
    const cacheKey = `package:headers:${qrSubgroupId}:${includeInactive ? "all" : "live"}`;
    let data = packageCache.get(cacheKey);

    if (!data) {
      console.log("[PACKAGE][HEADERS] Cache miss, fetching from DB");
      data = await getPackageHeaders(parseInt(qrSubgroupId), { includeInactive });
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
    const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === "1";

    console.log("[PACKAGE][DETAILS] Getting details for package:", packageProductId, { includeInactive });

    // Same keying rule as headers -- a hidden package must not leak into the
    // diner-facing variant of this response.
    const cacheKey = `package:details:${packageProductId}:${includeInactive ? "all" : "live"}`;
    let data = packageCache.get(cacheKey);

    if (!data) {
      console.log("[PACKAGE][DETAILS] Cache miss, fetching from DB");
      data = await getPackageDetails(parseInt(packageProductId), { includeInactive });
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
    
    // Clear every menu cache, not just this one -- the qr-menu grid serves the
    // same rows and would otherwise stay stale.
    invalidateMenuCaches("package write");
    
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
    const { productId, packageProductId, displayOrder, groupLabel } = req.body;

    console.log("[PACKAGE][ADD-PRODUCT] Adding product to package:", {
      productId,
      packageProductId,
      displayOrder,
      groupLabel,
    });

    const result = await addProductToPackage(
      parseInt(productId),
      parseInt(packageProductId),
      parseInt(displayOrder) || 0,
      groupLabel || null
    );
    
    // Clear every menu cache, not just this one -- the qr-menu grid serves the
    // same rows and would otherwise stay stale.
    invalidateMenuCaches("package write");
    
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
    const { productId, packageProductId } = req.body;

    console.log("[PACKAGE][REMOVE-PRODUCT] Removing product from package:", { productId, packageProductId });

    const result = await removeProductFromPackage(parseInt(productId), parseInt(packageProductId));
    
    // Clear every menu cache, not just this one -- the qr-menu grid serves the
    // same rows and would otherwise stay stale.
    invalidateMenuCaches("package write");
    
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
    
    // Clear every menu cache, not just this one -- the qr-menu grid serves the
    // same rows and would otherwise stay stale.
    invalidateMenuCaches("package write");
    
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
 * POST /api/packages/update-item-group
 * Update choice-group label of an item in a package
 * Body: { productId, packageProductId, groupLabel }
 */
export async function updatePackageItemGroupLabelController(req, res, next) {
  try {
    const { productId, packageProductId, groupLabel } = req.body;

    console.log("[PACKAGE][UPDATE-ITEM-GROUP] Updating item group label:", {
      productId,
      packageProductId,
      groupLabel,
    });

    const result = await updatePackageItemGroupLabel(
      parseInt(productId),
      parseInt(packageProductId),
      groupLabel || null
    );

    // Clear every menu cache, not just this one -- the qr-menu grid serves the
    // same rows and would otherwise stay stale.
    invalidateMenuCaches("package write");

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[PACKAGE][UPDATE-ITEM-GROUP] Error:", error);
    next(error);
  }
}

/**
 * POST /api/packages/:packageProductId/update
 * Update a package header's name, description and price
 * Body: { description, descriptionArabic, shortDescription, price }
 */
export async function updatePackageDetailsController(req, res, next) {
  try {
    const { packageProductId } = req.params;
    const { description, descriptionArabic, shortDescription, price } = req.body;

    console.log("[PACKAGE][UPDATE-DETAILS] Updating package:", { packageProductId, description, price });

    const result = await updatePackageDetails(parseInt(packageProductId), {
      description,
      descriptionArabic,
      shortDescription,
      price: price !== undefined && price !== "" ? parseFloat(price) : undefined,
    });

    invalidateMenuCaches("package write");

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[PACKAGE][UPDATE-DETAILS] Error:", error);
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
    invalidateMenuCaches("package write");
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[PACKAGE][CREATE] Error:", error);
    next(error);
  }
}

/**
 * POST /api/packages/:packageProductId/visibility
 * Show or hide a whole package on the QR menu.
 * Body: { isVisible: boolean }
 */
export async function setPackageVisibilityController(req, res, next) {
  try {
    const { packageProductId } = req.params;
    const { isVisible } = req.body;

    if (typeof isVisible !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "isVisible must be true or false",
      });
    }

    const id = Number(packageProductId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid package id",
      });
    }

    console.log("[PACKAGE][VISIBILITY] Setting package visibility:", { id, isVisible });

    const result = await setPackageVisibility(id, isVisible);

    invalidateMenuCaches("package visibility toggle");

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("[PACKAGE][VISIBILITY] Error:", error);
    next(error);
  }
}

export async function uploadPackageImageController(req, res, next) {
  try {
    const { packageProductId } = req.params;
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error: "Image is required",
      });
    }

    const result = await uploadPackageImage(parseInt(packageProductId), imageBase64);

    invalidateMenuCaches("package write");

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[PACKAGE][UPLOAD-IMAGE] Error:", error);
    next(error);
  }
}
