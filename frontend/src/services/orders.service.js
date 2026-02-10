// src/services/orders.service.js
import { API } from "../lib/api";

/**
 * POST /pos/kot — log full payload, then send.
 */
export async function submitOrder(orderPayload) {
  const { data } = await API.post("/pos/kot", orderPayload);
  return data;
}
