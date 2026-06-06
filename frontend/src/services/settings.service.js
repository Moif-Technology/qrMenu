// src/services/settings.service.js
import { API } from "../lib/api";

const DEFAULTS = { orderingEnabled: false, kotRouting: "kitchen" };

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

/** Admin — update settings. patch: { orderingEnabled?, kotRouting? } */
export async function updateAdminSettings(patch) {
  const { data } = await API.put("/settings", patch);
  return { ...DEFAULTS, ...(data?.settings || {}) };
}
