// backend/controllers/menu.controller.js
import NodeCache from "node-cache";
import { listGroups, listMenuItems } from "../services/menu.service.js";

// Cache configuration: 5 minutes TTL for menu data (menu items don't change frequently)
const menuCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes
  checkperiod: 60, // Check for expired keys every minute
  useClones: false // Better performance for large objects
});

export async function getGroups(_req, res, next) {
  try {
    const cacheKey = "menu:groups";
    let data = menuCache.get(cacheKey);
    
    if (!data) {
      data = await listGroups();
      menuCache.set(cacheKey, data);
      console.log("[CACHE] Menu groups cached");
    } else {
      console.log("[CACHE] Menu groups served from cache");
    }
    
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
}

export async function getItems(req, res, next) {
  try {
    const { page, pageSize, search, groupId, groupCode, sort } = req.query;
    
    // Only cache if no search/filter (most common browsing case)
    // Search and filters are dynamic, so we don't cache those
    const hasSearchOrFilter = search || groupId || groupCode;
    const cacheKey = hasSearchOrFilter 
      ? null 
      : `menu:items:${page || 1}:${pageSize || 24}:${sort || "new"}`;
    
    let result = cacheKey ? menuCache.get(cacheKey) : null;
    
    if (!result) {
      result = await listMenuItems({ page, pageSize, search, groupId, groupCode, sort });
      if (cacheKey) {
        menuCache.set(cacheKey, result);
        console.log(`[CACHE] Menu items cached: ${cacheKey}`);
      }
    } else {
      console.log(`[CACHE] Menu items served from cache: ${cacheKey}`);
    }
    
    res.json({
      ok: true,
      paging: { page: result.page, pageSize: result.pageSize, total: result.total },
      data: result.data
    });
  } catch (e) {
    next(e);
  }
}

// Export cache instance for manual cache clearing if needed (e.g., when menu is updated)
export function clearMenuCache() {
  menuCache.flushAll();
  console.log("[CACHE] Menu cache cleared");
}
