// src/utils/currency.js
export function formatAED(value, opts = {}) {
  const n = Number(value ?? 0);
  const {
    min = 2, // show 2 decimals by default
    max = 2,
  } = opts;
  try {
    return new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency: "AED",
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(n);
  } catch {
    return `AED ${n.toFixed(max)}`;
  }
}
