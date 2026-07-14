// src/services/settings.service.js
import { API } from "../lib/api";

const DEFAULTS = { orderingEnabled: false, kotRouting: "kitchen", chefSpecial: null };

/** Normalized ProductID list from a chefSpecial config (handles legacy single productId). */
export function chefSpecialIds(cs) {
  if (!cs) return [];
  if (Array.isArray(cs.productIds)) return cs.productIds.filter(Boolean);
  return cs.productId ? [cs.productId] : [];
}

/**
 * True when the Chef's Special config is currently live (within its date range).
 * cs: { productIds: number[], title, titleAr, subtitle, subtitleAr, from, until } | null
 */
export function isChefSpecialActive(cs, now = new Date()) {
  if (chefSpecialIds(cs).length === 0) return false;
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD, matches stored format
  if (cs.from && today < cs.from) return false;
  if (cs.until && today > cs.until) return false;
  return true;
}

/** Public — read app settings (ordering switch, kot routing). Never throws. */
export async function getPublicSettings() {
  try {
    const { data } = await API.get("/settings");
    return { ...DEFAULTS, ...(data?.settings || {}) };
  } catch (err) {
    return { ...DEFAULTS };
  }
}

/** Admin — read app settings (same endpoint, kept separate for clarity). */
export async function getAdminSettings() {
  const { data } = await API.get("/settings");
  return { ...DEFAULTS, ...(data?.settings || {}) };
}

/** Admin — update settings. patch: { orderingEnabled?, kotRouting?, chefSpecial? (object | null to clear) } */
export async function updateAdminSettings(patch) {
  const { data } = await API.put("/settings", patch);
  return { ...DEFAULTS, ...(data?.settings || {}) };
}
