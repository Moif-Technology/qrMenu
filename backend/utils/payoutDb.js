// backend/utils/payoutDb.js
// Payout tracker's typed-param query helper. Uses the same PaymentGateway
// pool the rest of the backend connects through (connectToPaymentDb) -
// merged in from qrmenu-dashboard so the whole app runs as one backend
// service instead of a second Express process on its own port.
import mssql from "mssql";
import { connectToPaymentDb } from "../config/dbConfig.js";

export async function query(sqlText, params = {}) {
  const pool = await connectToPaymentDb();
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) {
    if (v && typeof v === "object" && "type" in v) {
      req.input(k, v.type, v.value);
    } else {
      req.input(k, v);
    }
  }
  const result = await req.query(sqlText);
  return result.recordset;
}

export { mssql };
