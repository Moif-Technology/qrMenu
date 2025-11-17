import { API } from "../lib/api";


/** GET /api/menu/categories */
export async function getCategories() {
  const { data } = await API.get("/menu/group");
  return data.data; // [{ groupId, name, code, name_ar }, ...]
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
  console.log(data,"ith engane verunath?");

  // data = { ok, paging: { page, pageSize, total }, data: [...] }
  return data;
}
