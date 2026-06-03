// src/lib/orderMode.js
// Ordering (add-to-cart + send-to-kitchen) is gated on an explicit flag,
// NOT on the table token — because real customers also carry a token (to view
// their bill). The flag is read from the URL (?order=1) and persisted per tab
// in sessionStorage so it survives the /r/:token -> / redirect.
//
//   Customer link : /r/<token>           -> menu + bill, no ordering
//   Test link     : /r/<token>?order=1   -> menu + bill + add-to-cart + kitchen
//
// ?order=0 explicitly clears it (handy to drop back to customer view in the
// same tab). Closing the tab clears it automatically.
const ORDER_MODE_KEY = "qr.orderMode";

export function isOrderMode() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("order");
    if (flag === "1") {
      sessionStorage.setItem(ORDER_MODE_KEY, "1");
    } else if (flag === "0") {
      sessionStorage.removeItem(ORDER_MODE_KEY);
    }
    return sessionStorage.getItem(ORDER_MODE_KEY) === "1";
  } catch (err) {
    return false;
  }
}
