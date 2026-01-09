// frontend/src/services/package.service.js
// Service for package hierarchy API calls

import { API } from "../lib/api";

/**
 * Get all package headers in a subgroup
 * @param {number} qrSubgroupId - QR Subgroup ID
 * @returns {Promise<Array>} Array of package headers
 */
export async function getPackageHeaders(qrSubgroupId) {
  try {
    const { data } = await API.get(`/packages/headers/${qrSubgroupId}`);
    return data.data || [];
  } catch (error) {
    console.error("[PACKAGE-SERVICE] Error fetching package headers:", error);
    return [];
  }
}

/**
 * Get all items in a package
 * @param {number} packageProductId - Package Product ID
 * @returns {Promise<Array>} Array of items in package
 */
export async function getPackageContents(packageProductId) {
  try {
    const { data } = await API.get(`/packages/${packageProductId}/contents`);
    return data.data || [];
  } catch (error) {
    console.error("[PACKAGE-SERVICE] Error fetching package contents:", error);
    return [];
  }
}

/**
 * Alias for getPackageContents (backward compatibility)
 */
export const getPackageItems = getPackageContents;

/**
 * Create a new package
 * @param {Object} packageData - Package data
 * @returns {Promise<Object>} Result
 */
export async function createNewPackage(packageData) {
  const { data } = await API.post("/packages/create", packageData);
  return data;
}

/**
 * Get package details
 * @param {number} packageProductId - Package Product ID
 * @returns {Promise<Object>} Package details
 */
export async function getPackageDetails(packageProductId) {
  try {
    const { data } = await API.get(`/packages/${packageProductId}/details`);
    return data.data || null;
  } catch (error) {
    console.error("[PACKAGE-SERVICE] Error fetching package details:", error);
    return null;
  }
}

// ===== Admin Management Functions =====

/**
 * Mark a product as package header
 * @param {number} productId - Product ID
 * @param {boolean} isPackageHeader - True to mark as package
 * @returns {Promise<Object>} Result
 */
export async function markAsPackageHeader(productId, isPackageHeader = true) {
  const { data } = await API.post(`/packages/mark-header`, {
    productId,
    isPackageHeader,
  });
  return data;
}

/**
 * Add a product to a package
 * @param {number} productId - Product ID to add
 * @param {number} packageProductId - Package Product ID
 * @param {number} displayOrder - Display order (optional)
 * @returns {Promise<Object>} Result
 */
export async function addProductToPackage(productId, packageProductId, displayOrder = 0) {
  const { data } = await API.post(`/packages/add-product`, {
    productId,
    packageProductId,
    displayOrder,
  });
  return data;
}

/**
 * Remove a product from a package
 * @param {number} productId - Product ID to remove
 * @returns {Promise<Object>} Result
 */
export async function removeProductFromPackage(productId) {
  const { data } = await API.post(`/packages/remove-product`, {
    productId,
  });
  return data;
}

/**
 * Update display order of product in package
 * @param {number} productId - Product ID
 * @param {number} displayOrder - New display order
 * @returns {Promise<Object>} Result
 */
export async function updatePackageItemOrder(productId, displayOrder) {
  const { data } = await API.post(`/packages/update-order`, {
    productId,
    displayOrder,
  });
  return data;
}

