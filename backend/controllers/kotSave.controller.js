// backend/controllers/kotSave.controller.js
import util from "node:util";
import { saveKot } from "../services/kotSave.service.js";

const isProd = process.env.NODE_ENV === "production";

// Pull useful info out of mssql/tedious errors
function unwrapSqlError(err) {
  const info = err?.originalError?.info || err?.info || {};
  const preceding = Array.isArray(err?.precedingErrors)
    ? err.precedingErrors.map(e => e?.message || String(e))
    : undefined;

  return {
    name: err?.name,
    message:
      info?.message ||
      err?.message ||
      "KOT save failed",

    // Common fields mssql/tedious put on the error
    code: err?.code || info?.code,
    number: info?.number,
    state: info?.state,
    class: info?.class,           // severity
    lineNumber: info?.lineNumber, // t-sql line
    serverName: info?.serverName,
    procName: info?.procName,

    // Stack & extras
    stack: err?.stack,
    precedingErrors: preceding
  };
}

export async function createKot(req, res) {
  // simple request id for tracing one submit end-to-end
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Compact payload log (avoid dumping huge arrays)
  const preview = {
    header: req.body?.header ?? null,
    items_len: Array.isArray(req.body?.items) ? req.body.items.length : 0,
    first_item: Array.isArray(req.body?.items) && req.body.items.length
      ? {
          qty: req.body.items[0].qty,
          unitPrice: req.body.items[0].unitPrice,
          product_id: req.body.items[0]?.product?.product_id,
          group_id: req.body.items[0]?.product?.group_id,
          tax1: req.body.items[0]?.product?.pc?.Tax1Rate
        }
      : null
  };

  console.log(`[KOT][${reqId}] POST ${req.originalUrl} payload:`, preview);

  try {
    const result = await saveKot(req.body);
    console.log(`[KOT][${reqId}] OK:`, result);
    return res.status(201).json(result);
  } catch (err) {
    const diag = unwrapSqlError(err);

    // Pretty-print the full error once in the server logs
    console.error(`[KOT][${reqId}] ERROR:`, util.inspect(diag, { depth: null, colors: true }));

    // Decide status code (400 for validation-ish, else 500)
    const msg = String(diag.message || "").toLowerCase();
    const code = (msg.includes("required") || msg.includes("tableid") || msg.includes("payload")) ? 400 : 500;

    // Return safe details to client (full debug only when NOT production)
    return res.status(code).json({
      ok: false,
      error: diag.message || "KOT save failed",
      debug: isProd ? undefined : diag
    });
  }
}
