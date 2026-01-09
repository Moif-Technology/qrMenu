// src/services/modifiers.service.js
// Uses your centralized Axios instance pattern (src/lib/api.js)
import { API } from "../lib/api";
export async function fetchAllModifiers() {
  const { data } = await API.get("/modifier");
  if (!data?.ok || !Array.isArray(data.data)) {
    throw new Error("Failed to fetch modifiers");
  }
  console.log(data,"Modifeirs veruuundo?");

  // data.data: [{ Modifier, ModifierID, ModifierArabic, UploadStatus }, ...]
  return data.data;
}
