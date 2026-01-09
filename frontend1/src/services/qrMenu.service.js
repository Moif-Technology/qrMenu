import { API } from "../lib/api";

/**
 * QR Menu Service
 * All API calls for QR menu management
 */

// Products from ProductMaster
// filters: { searchTerm, groupId, subgroupId }
export async function getAllProductsFromMaster(filters = {}) {
  const params = new URLSearchParams();
  if (filters.searchTerm) params.append("searchTerm", filters.searchTerm);
  if (filters.groupId) params.append("groupId", filters.groupId);
  if (filters.subgroupId) params.append("subgroupId", filters.subgroupId);
  
  const url = params.toString() 
    ? `/qr-menu/products/all?${params.toString()}`
    : "/qr-menu/products/all";
  const { data } = await API.get(url);
  return data.data;
}

// Groups
export async function getQrGroups() {
  const { data } = await API.get("/qr-menu/groups");
  return data.data;
}

export async function createQrGroup(groupData) {
  const { data } = await API.post("/qr-menu/groups", groupData);
  return data.data;
}

export async function updateQrGroup(qrGroupId, updateData) {
  const { data } = await API.put(`/qr-menu/groups/${qrGroupId}`, updateData);
  return data.data;
}

export async function deleteQrGroup(qrGroupId) {
  const { data } = await API.delete(`/qr-menu/groups/${qrGroupId}`);
  return data.data;
}

// Subgroups
export async function getQrSubgroups(qrGroupId = null) {
  const url = qrGroupId 
    ? `/qr-menu/subgroups?qrGroupId=${qrGroupId}`
    : "/qr-menu/subgroups";
  const { data } = await API.get(url);
  return data.data;
}

export async function createQrSubgroup(subgroupData) {
  const { data } = await API.post("/qr-menu/subgroups", subgroupData);
  return data.data;
}

export async function updateQrSubgroup(qrSubgroupId, updateData) {
  const { data } = await API.put(`/qr-menu/subgroups/${qrSubgroupId}`, updateData);
  return data.data;
}

export async function deleteQrSubgroup(qrSubgroupId) {
  const { data } = await API.delete(`/qr-menu/subgroups/${qrSubgroupId}`);
  return data.data;
}

// QR Products
export async function getQrProducts(filters = {}) {
  const params = new URLSearchParams();
  if (filters.qrGroupId) params.append("qrGroupId", filters.qrGroupId);
  if (filters.qrSubgroupId) params.append("qrSubgroupId", filters.qrSubgroupId);
  if (filters.isActive !== undefined) params.append("isActive", filters.isActive);
  
  const url = params.toString() 
    ? `/qr-menu/products?${params.toString()}`
    : "/qr-menu/products";
  const { data } = await API.get(url);
  return data.data;
}

export async function addProductToQrMenu(productData) {
  const { data } = await API.post("/qr-menu/products", productData);
  return data.data;
}

export async function updateQrProductAssignment(productId, updateData) {
  const { data } = await API.put(`/qr-menu/products/${productId}`, updateData);
  return data.data;
}

export async function removeProductFromQrMenu(productId) {
  const { data } = await API.delete(`/qr-menu/products/${productId}`);
  return data.data;
}

