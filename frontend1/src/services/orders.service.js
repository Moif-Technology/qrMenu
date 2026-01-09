// src/services/orders.service.js
import { API } from "../lib/api";

/**
 * POST /pos/kot — log full payload, then send.
 */
export async function submitOrder(orderPayload) {
  console.log("POST /pos/kot payload:", orderPayload); // 👈 full payload
  const { data } = await API.post("/pos/kot", orderPayload);
  console.log("POST /pos/kot response:", data);        // (optional) response
  return data;
}
