// backend/controllers/menu.controller.js
import NodeCache from "node-cache";
import { listGroups, listMenuItems, listAreas, batchLoadProductImages, getSingleProductImage, getSingleProductImageBinary, getImageMapping } from "../services/menu.service.js";

// Cache configuration: 5 minutes TTL for menu data (menu items don't change frequently)
const menuCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes
  checkperiod: 60, // Check for expired keys every minute
  useClones: false // Better performance for large objects
});

export async function getGroups(req, res, next) {
  try {
    console.log("[MENU][GROUPS] hit", {
      url: req.originalUrl,
      host: req.headers.host,
      origin: req.headers.origin,
      referer: req.headers.referer,
    });

    const cacheKey = "menu:groups";
    let data = menuCache.get(cacheKey);

    if (!data) {
      console.log("[MENU][GROUPS] cache MISS -> fetching from DB");
      data = await listGroups();
      menuCache.set(cacheKey, data);
      console.log("[MENU][GROUPS] cached", { count: data?.length || 0 });
    } else {
      console.log("[MENU][GROUPS] cache HIT", { count: data?.length || 0 });
    }

    // 👇 VERY IMPORTANT: show first row (small sample)
    console.log("[MENU][GROUPS] sample", data?.[0] || null);

    return res.json({ ok: true, data });
  } catch (e) {
    console.error("[MENU][GROUPS] ERROR", e?.message || e);
    next(e);
  }
}


export async function getItems(req, res, next) {
  console.log("=".repeat(50));
  console.log("[MENU][ITEMS] ✅ FUNCTION CALLED - Request received");
  console.log("[MENU][ITEMS] URL:", req.originalUrl);
  console.log("[MENU][ITEMS] Method:", req.method);
  console.log("[MENU][ITEMS] Query:", req.query);
  console.log("=".repeat(50));
  try {
    const { page, pageSize, search, groupId, groupCode, sort, includeImages } = req.query;
    
    // By default, don't include images for better performance
    // Images can be loaded separately if needed
    const shouldIncludeImages = includeImages === 'true' || includeImages === '1';
    
    console.log("[MENU][ITEMS] Request:", { page, pageSize, search, groupId, groupCode, sort, includeImages: shouldIncludeImages });
    
    // Only cache if no search/filter (most common browsing case)
    // Search and filters are dynamic, so we don't cache those
    const hasSearchOrFilter = search || groupId || groupCode;
    const cacheKey = hasSearchOrFilter 
      ? null 
      : `menu:items:${page || 1}:${pageSize || 24}:${sort || "new"}:${shouldIncludeImages}`;
    
    let result = cacheKey ? menuCache.get(cacheKey) : null;
    
    if (!result) {
      console.log("[MENU][ITEMS] Cache MISS -> fetching from DB");
      const startTime = Date.now();
      try {
        result = await listMenuItems({ 
          page, 
          pageSize, 
          search, 
          groupId, 
          groupCode, 
          sort,
          includeImages: shouldIncludeImages
        });
        const duration = Date.now() - startTime;
        console.log(`[MENU][ITEMS] Query completed in ${duration}ms`, { 
          total: result.total, 
          items: result.data.length 
        });
        if (cacheKey) {
          menuCache.set(cacheKey, result);
          console.log(`[CACHE] Menu items cached: ${cacheKey}`);
        }
      } catch (dbError) {
        const duration = Date.now() - startTime;
        console.error(`[MENU][ITEMS] Database query failed after ${duration}ms:`, dbError?.message || dbError);
        // Check if it's a timeout error
        if (dbError?.code === 'ETIMEOUT' || dbError?.message?.includes('timeout')) {
          return res.status(504).json({
            ok: false,
            error: "Database query timeout. The request took too long to process. Please try again or contact support.",
            code: "QUERY_TIMEOUT"
          });
        }
        throw dbError;
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
    console.error("[MENU][ITEMS] Error:", e?.message || e);
    next(e);
  }
}

// Export cache instance for manual cache clearing if needed (e.g., when menu is updated)
export function clearMenuCache() {
  menuCache.flushAll();
  console.log("[CACHE] Menu cache cleared");
}

export async function getAreas(req, res, next) {
  try {
    console.log("[MENU][AREAS] hit", {
      url: req.originalUrl,
      host: req.headers.host,
      origin: req.headers.origin,
      referer: req.headers.referer,
    });

    const cacheKey = "menu:areas";
    let data = menuCache.get(cacheKey);

    if (!data) {
      console.log("[MENU][AREAS] cache MISS -> fetching from DB");
      data = await listAreas();
      menuCache.set(cacheKey, data);
      console.log("[MENU][AREAS] cached", { count: data?.length || 0 });
    } else {
      console.log("[MENU][AREAS] cache HIT", { count: data?.length || 0 });
    }

    // 👇 VERY IMPORTANT: show first row (small sample)
    console.log("[MENU][AREAS] sample", data?.[0] || null);

    return res.json({ ok: true, data });
  } catch (e) {
    console.error("[MENU][AREAS] ERROR", e?.message || e);
    next(e);
  }
}

/**
 * POST /api/menu/images
 * Batch load images for multiple products
 * Body: { productIds: string[] }
 */
export async function getProductImages(req, res, next) {
  try {
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "productIds must be a non-empty array"
      });
    }

    console.log("[MENU][IMAGES] Batch loading images", { count: productIds.length });
    const startTime = Date.now();
    
    const images = await batchLoadProductImages(productIds);
    const duration = Date.now() - startTime;
    
    const cloudinaryCount = Object.values(images).filter(img => img?.type === 'cloudinary').length;
    console.log(`[MENU][IMAGES] Loaded ${Object.keys(images).length} product images in ${duration}ms (${cloudinaryCount} from Cloudinary)`);
    
    res.json({
      ok: true,
      data: images
    });
  } catch (e) {
    console.error("[MENU][IMAGES] ERROR", e?.message || e);
    next(e);
  }
}

/**
 * GET /api/menu/image/:productId
 * Get single product image (faster for lazy loading)
 */
export async function getSingleImage(req, res, next) {
  try {
    const { productId } = req.params;
    
    if (!productId) {
      return res.status(400).json({
        ok: false,
        error: "productId is required"
      });
    }

    const startTime = Date.now();
    const imageResult = await getSingleProductImageBinary(productId);
    const duration = Date.now() - startTime;
    
    if (imageResult) {
      // If Cloudinary URL, return it directly
      if (imageResult.type === 'cloudinary' && imageResult.url) {
        console.log(`[MENU][IMAGE] Loaded Cloudinary URL for product ${productId} in ${duration}ms`);
        return res.json({
          ok: true,
          data: {
            productId,
            image: imageResult.url,
            images: [imageResult.url],
            type: 'cloudinary'
          }
        });
      }
      
      // Fallback: Convert binary to base64 (for backward compatibility)
      if (imageResult.type === 'binary' && imageResult.buffer) {
        const imageBase64 = imageResult.buffer.toString('base64');
        console.log(`[MENU][IMAGE] Loaded binary image for product ${productId} in ${duration}ms`);
        return res.json({
        ok: true,
        data: {
          productId,
          image: imageBase64,
            images: [imageBase64],
            type: 'base64'
        }
      });
      }
    }
    
      res.json({
        ok: true,
        data: {
          productId,
          image: null,
          images: []
        }
      });
  } catch (e) {
    console.error("[MENU][IMAGE] ERROR", e?.message || e);
    next(e);
  }
}

/**
 * GET /api/menu/image/:productId/binary
 * Get single product image as binary or Cloudinary URL (MUCH FASTER)
 * Returns Cloudinary URL if available, otherwise serves binary with proper caching headers
 */
export async function getSingleImageBinary(req, res, next) {
  try {
    const { productId } = req.params;
    
    if (!productId) {
      return res.status(400).send("productId is required");
    }

    const startTime = Date.now();
    const imageResult = await getSingleProductImageBinary(productId);
    const duration = Date.now() - startTime;
    
    if (!imageResult) {
      return res.status(404).send("Image not found");
    }

    // If Cloudinary URL is available, redirect to it (fastest option)
    if (imageResult.type === 'cloudinary' && imageResult.url) {
      console.log(`[MENU][IMAGE_BINARY] Redirecting to Cloudinary for product ${productId} in ${duration}ms`);
      return res.redirect(302, imageResult.url);
    }

    // Fallback to binary serving
    if (imageResult.type === 'binary' && imageResult.buffer) {
      console.log(`[MENU][IMAGE_BINARY] Serving binary image for product ${productId} in ${duration}ms`);
      
      // Set proper headers for image serving with caching
      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': imageResult.buffer.length,
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        'ETag': `"${productId}-${imageResult.buffer.length}"`
      });
      
      return res.send(imageResult.buffer);
    }

    res.status(404).send("Image not found");
  } catch (e) {
    console.error("[MENU][IMAGE_BINARY] ERROR", e?.message || e);
    next(e);
  }
}

/**
 * GET /api/menu/images/mapping
 * Get lightweight mapping of which products have images
 * Returns: { productId: true, ... }
 */
export async function getImageMappingEndpoint(req, res, next) {
  try {
    const cacheKey = "menu:image:mapping";
    let mapping = menuCache.get(cacheKey);

    if (!mapping) {
      console.log("[MENU][IMAGE_MAPPING] Cache MISS -> fetching from DB");
      const startTime = Date.now();
      mapping = await getImageMapping();
      const duration = Date.now() - startTime;
      menuCache.set(cacheKey, mapping, 600); // Cache for 10 minutes
      console.log(`[MENU][IMAGE_MAPPING] Loaded mapping for ${Object.keys(mapping).length} products in ${duration}ms`);
    } else {
      console.log("[MENU][IMAGE_MAPPING] Cache HIT");
    }

    res.json({
      ok: true,
      data: mapping
    });
  } catch (e) {
    console.error("[MENU][IMAGE_MAPPING] ERROR", e?.message || e);
    next(e);
  }
}
