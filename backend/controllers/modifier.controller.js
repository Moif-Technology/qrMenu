// backend/controllers/modifier.controller.js
import { listAllModifiers } from "../services/modifier.service.js";

export async function getModifiers(req, res, next) {
  try {
    const data = await listAllModifiers();
    res.json({ ok: true, data }); // field names unchanged
  } catch (err) {
    next(err);
  }
}
