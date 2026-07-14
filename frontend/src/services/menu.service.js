import { API } from "../lib/api";
import { error as logError, warn as logWarn } from "../lib/logger";


/** GET /api/menu/categories */
export async function getCategories() {
  const { data } = await API.get("/menu/group");
  return data.data; // [{ groupId, name, code, name_ar }, ...]
}

/** GET /api/menu/areas */
export async function getAreas() {
  const { data } = await API.get("/menu/areas");
  return data.data; // [{ areaId, areaName, areaNameArabic, supplyType, kotPrefix, priceLevel }, ...]
}

/**
 * GET /api/menu/items
 * @param {Object} params
 * @param {number} params.page
 * @param {number} params.pageSize
 * @param {string} params.search
 * @param {number} params.groupId
 * @param {string} params.groupCode
 * @param {"new"|"name"|"id_desc"|"id_asc"} params.sort
 */
export async function getItems(params = {}) {
  const {
    page = 1,
    pageSize = 24,
    search = "",
    groupId,
    groupCode,
    sort = "new"
  } = params;

  const { data } = await API.get("/menu/items", {
    params: { page, pageSize, search, groupId, groupCode, sort }
  });
  return data;
}

/**
 * POST /api/menu/images
 * Batch load images for multiple products
 * @param {string[]} productIds - Array of ProductID values
 * @returns {Object} Map of productId -> { image: string, images: string[] }
 */
export async function getProductImages(productIds = []) {
  if (!productIds || productIds.length === 0) {
    return {};
  }

  try {
    // Use shorter timeout for image loading (20 seconds)
    const { data } = await API.post("/menu/images", { productIds }, {
      timeout: 20000 // 20 seconds for image loading
    });
    return data.data || {}; // Returns { productId: { image, images }, ... }
  } catch (error) {
    logError("[MENU] Failed to load product images:", error);
    return {}; // Return empty object on error, images will use fallback
  }
}

/**
 * GET /api/menu/images/mapping
 * Get lightweight mapping of which products have images and their Cloudinary URLs
 * @returns {Object} Map of productId -> { hasImage: true, cloudinaryUrl?: string }
 */
export async function getImageMapping() {
  try {
    const { data } = await API.get("/menu/images/mapping", {
      timeout: 15000 // 15 seconds
    });
    // Returns { productId: { hasImage: true, cloudinaryUrl: '...' }, ... }
    // or { productId: true } for backward compatibility
    return data.data || {};
  } catch (error) {
    console.error("[MENU] Failed to load image mapping:", error);
    return {}; // Return empty object on error
  }
}

/**
 * QR MENU FUNCTIONS
 */

/** GET /api/qr-menu/categories */
export async function getQrCategories() {
  try {
    const response = await API.get("/qr-menu/categories");
    if (!response.data || !response.data.ok) {
      throw new Error(response.data?.error || "Invalid response from server");
    }
    return response.data.data || [];
  } catch (error) {
    logError("[MENU] getQrCategories failed:", error?.response?.data || error?.message);
    throw error;
  }
}

/**
 * GET /api/qr-menu/menu-items
 * @param {Object} params
 * @param {number} params.page
 * @param {number} params.pageSize
 * @param {string} params.search
 * @param {number} params.qrMainGroupId
 * @param {number} params.qrGroupId
 * @param {number} params.qrSubgroupId
 * @param {number} params.productId - fetch a single dish by ProductID (Chef's Special banner)
 * @param {number[]|string} params.productIds - fetch a set of dishes by ProductID (multi-pick)
 * @param {"new"|"name"|"id_desc"|"id_asc"} params.sort
 */
export async function getQrMenuItems(params = {}) {
  const {
    page = 1,
    pageSize = 24,
    search = "",
    qrMainGroupId,
    qrGroupId,
    qrSubgroupId,
    productId,
    productIds,
    sort = "new"
  } = params;

  const { data } = await API.get("/qr-menu/menu-items", {
    params: {
      page,
      pageSize,
      search,
      qrMainGroupId,
      qrGroupId,
      qrSubgroupId,
      productId,
      productIds: Array.isArray(productIds) ? productIds.join(",") : productIds,
      sort
    }
  });

  // data = { ok, paging: { page, pageSize, total }, data: [...] }
  return data;
}

/**
 * GET /api/menu/image/:productId/binary
 * Load single product image as binary blob or Cloudinary URL (MUCH FASTER)
 * @param {string} productId - ProductID
 * @param {number} retries - Number of retry attempts
 * @returns {string|null} Cloudinary URL, Object URL for the image blob, or null
 */
export async function getSingleProductImageBinary(productId, retries = 1) {
  if (!productId) {
    return null;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await API.get(`/menu/image/${encodeURIComponent(productId)}/binary`, {
        responseType: 'blob', // Important: fetch as blob, not JSON
        timeout: 15000, // 15 seconds for single image
        maxRedirects: 5 // Allow redirects (for Cloudinary URLs)
      });
      
      // Check if response is a redirect to Cloudinary (status 302)
      // If the response URL is a Cloudinary URL, return it directly
      if (response.request?.responseURL && response.request.responseURL.includes('cloudinary.com')) {
        return response.request.responseURL;
      }
      
      // Create object URL from blob (browser handles caching automatically)
      const blob = response.data;
      if (blob && blob.size > 0) {
        return URL.createObjectURL(blob);
      }
      return null;
    } catch (error) {
      // If timeout and we have retries left, wait and retry
      if (attempt < retries && (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))) {
        // Exponential backoff: 500ms, 1000ms
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      // Last attempt failed or non-timeout error
      if (attempt === retries) {
        logWarn(`[MENU] Failed to load binary image for product ${productId} after ${retries + 1} attempts:`, error.message);
      }
      return null;
    }
  }
  return null;
}

/**
 * GET /api/menu/image/:productId
 * Load single product image (faster, for lazy loading)
 * @param {string} productId - ProductID
 * @param {number} retries - Number of retry attempts
 * @returns {Object} { productId, image: string, images: string[] }
 */
export async function getSingleProductImage(productId, retries = 1) {
  if (!productId) {
    return null;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await API.get(`/menu/image/${encodeURIComponent(productId)}`, {
        timeout: 15000 // 15 seconds for single image (increased for slow DB)
      });
      return data.data || null;
    } catch (error) {
      // If timeout and we have retries left, wait and retry
      if (attempt < retries && (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))) {
        // Exponential backoff: 500ms, 1000ms
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      // Last attempt failed or non-timeout error
      if (attempt === retries) {
        logWarn(`[MENU] Failed to load image for product ${productId} after ${retries + 1} attempts:`, error.message);
      }
      return null;
    }
  }
  return null;
}
