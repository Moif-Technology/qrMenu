// backend/controllers/qrMenu.controller.js
import NodeCache from "node-cache";
import {
  getAllProductsFromMaster,
  createQrGroup,
  createQrSubgroup,
  addProductToQrMenu,
  listQrGroups,
  listQrSubgroups,
  listQrProducts,
  updateQrGroup,
  updateQrSubgroup,
  deleteQrGroup,
  deleteQrSubgroup,
  removeProductFromQrMenu,
  updateQrProductAssignment,
  getQrMenuCategories,
  getQrMenuItems,
} from "../services/qrMenu.service.js";

// Cache configuration: 3 minutes TTL for QR menu items (shorter than regular menu since QR menu may change more frequently)
const qrMenuCache = new NodeCache({ 
  stdTTL: 180, // 3 minutes
  checkperiod: 60, // Check for expired keys every minute
  useClones: false // Better performance for large objects
});

/**
 * GET /api/qr-menu/products/all
 * Fetch all products from ProductMaster
 * Query params: searchTerm, groupId, subgroupId
 */
export async function getAllProducts(req, res, next) {
  try {
    const { searchTerm, groupId, subgroupId } = req.query;
    
    const filters = {};
    if (searchTerm) filters.searchTerm = searchTerm;
    if (groupId) filters.groupId = Number(groupId);
    if (subgroupId) filters.subgroupId = Number(subgroupId);
    
    const products = await getAllProductsFromMaster(filters);
    res.json({ ok: true, data: products });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/qr-menu/groups
 * Create a new QR Group
 */
export async function createGroup(req, res, next) {
  try {
    const groupData = req.body;
    const result = await createQrGroup(groupData);
    
    // Clear QR menu cache to ensure fresh data after creating group
    clearQrMenuCache();
    
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/qr-menu/groups
 * List all QR Groups
 */
export async function getGroups(req, res, next) {
  try {
    const groups = await listQrGroups();
    res.json({ ok: true, data: groups });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/qr-menu/groups/:qrGroupId
 * Update a QR Group
 */
export async function updateGroup(req, res, next) {
  try {
    const { qrGroupId } = req.params;
    const updateData = req.body;
    const result = await updateQrGroup(Number(qrGroupId), updateData);
    
    // Clear QR menu cache to ensure fresh data after group updates
    clearQrMenuCache();
    
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/qr-menu/groups/:qrGroupId
 * Delete a QR Group
 */
export async function deleteGroup(req, res, next) {
  try {
    const { qrGroupId } = req.params;
    const result = await deleteQrGroup(Number(qrGroupId));
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/qr-menu/subgroups
 * Create a new QR Subgroup
 */
export async function createSubgroup(req, res, next) {
  try {
    const subgroupData = req.body;
    const result = await createQrSubgroup(subgroupData);
    
    // Clear QR menu cache to ensure fresh data after creating subgroup
    clearQrMenuCache();
    
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/qr-menu/subgroups
 * List QR Subgroups (optionally filtered by qrGroupId query param)
 */
export async function getSubgroups(req, res, next) {
  try {
    const { qrGroupId } = req.query;
    const qrGroupIdNum = qrGroupId ? Number(qrGroupId) : null;
    const subgroups = await listQrSubgroups(qrGroupIdNum);
    res.json({ ok: true, data: subgroups });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/qr-menu/subgroups/:qrSubgroupId
 * Update a QR Subgroup
 */
export async function updateSubgroup(req, res, next) {
  try {
    const { qrSubgroupId } = req.params;
    const updateData = req.body;
    const result = await updateQrSubgroup(Number(qrSubgroupId), updateData);
    
    // Clear QR menu cache to ensure fresh data after subgroup updates
    clearQrMenuCache();
    
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/qr-menu/subgroups/:qrSubgroupId
 * Delete a QR Subgroup
 */
export async function deleteSubgroup(req, res, next) {
  try {
    const { qrSubgroupId } = req.params;
    const result = await deleteQrSubgroup(Number(qrSubgroupId));
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/qr-menu/products
 * Add a product to QR Menu (from ProductMaster)
 */
export async function addProduct(req, res, next) {
  try {
    const productData = req.body;
    
    if (!productData.ProductID) {
      return res.status(400).json({ ok: false, error: "ProductID is required" });
    }
    
    const result = await addProductToQrMenu(productData);
    
    // Clear QR menu cache to ensure fresh data after adding product
    clearQrMenuCache();
    
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/qr-menu/products
 * List QR Products (optionally filtered by qrGroupId, qrSubgroupId, isActive query params)
 */
export async function getProducts(req, res, next) {
  try {
    const { qrGroupId, qrSubgroupId, isActive } = req.query;
    
    const filters = {};
    if (qrGroupId) filters.qrGroupId = Number(qrGroupId);
    if (qrSubgroupId) filters.qrSubgroupId = Number(qrSubgroupId);
    if (isActive !== undefined) filters.isActive = isActive === "true" || isActive === "1";
    
    const products = await listQrProducts(filters);
    res.json({ ok: true, data: products });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/qr-menu/products/:productId
 * Update QR product assignment (inline editing)
 */
export async function updateProduct(req, res, next) {
  try {
    const { productId } = req.params;
    const updateData = req.body;
    const result = await updateQrProductAssignment(Number(productId), updateData);
    
    // Clear QR menu cache to ensure fresh data after updates
    clearQrMenuCache();
    
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/qr-menu/products/:productId
 * Remove a product from QR Menu
 */
export async function removeProduct(req, res, next) {
  try {
    const { productId } = req.params;
    const result = await removeProductFromQrMenu(Number(productId));
    
    // Clear QR menu cache to ensure fresh data after removing product
    clearQrMenuCache();
    
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/qr-menu/categories
 * Get QR Menu Categories (Groups and Subgroups) for frontend display
 */
export async function getQrCategories(req, res, next) {
  try {
    const categories = await getQrMenuCategories();
    res.json({ ok: true, data: categories });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/qr-menu/menu-items
 * Get QR Menu Items (Products from QrProductMaster)
 * Query params: page, pageSize, search, qrGroupId, qrSubgroupId, sort, _t (cache-busting timestamp)
 */
export async function getQrMenuItemsController(req, res, next) {
  try {
    const { page = 1, pageSize = 24, search = "", qrGroupId, qrSubgroupId, sort = "new", _t } = req.query;
    
    // If cache-busting timestamp is provided, skip cache
    const skipCache = _t !== undefined;
    
    // Only cache if no search and no cache-busting (search results are dynamic)
    const hasSearch = search && search.trim().length > 0;
    const cacheKey = (hasSearch || skipCache)
      ? null // Don't cache search results or when cache-busting
      : `qr-menu-items:${qrGroupId || 'all'}:${qrSubgroupId || 'all'}:${page}:${pageSize}:${sort}`;
    
    // Check cache first (only if not skipping cache)
    let result = (!skipCache && cacheKey) ? qrMenuCache.get(cacheKey) : null;
    
    if (!result) {
      // Cache miss - fetch from database
      if (cacheKey && !skipCache) {
        console.log(`[QR-MENU][CACHE] MISS: ${cacheKey}`);
      } else if (skipCache) {
        console.log(`[QR-MENU][CACHE] BYPASS: Cache-busting requested (_t=${_t})`);
      }
      
      result = await getQrMenuItems({
        page: Number(page),
        pageSize: Number(pageSize),
        search: search.trim(),
        qrGroupId: qrGroupId ? Number(qrGroupId) : null,
        qrSubgroupId: qrSubgroupId ? Number(qrSubgroupId) : null,
        sort
      });
      
      // Cache the result (only if no search and not cache-busting)
      if (cacheKey && !skipCache) {
        qrMenuCache.set(cacheKey, result);
        console.log(`[QR-MENU][CACHE] CACHED: ${cacheKey} (${result.data?.length || 0} items)`);
      }
    } else {
      // Cache hit
      console.log(`[QR-MENU][CACHE] HIT: ${cacheKey} (${result.data?.length || 0} items)`);
    }
    
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
}

// Export cache instance for manual cache clearing (e.g., when QR menu is updated)
export function clearQrMenuCache() {
  qrMenuCache.flushAll();
  console.log("[QR-MENU][CACHE] Cache cleared");
}

