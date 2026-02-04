// src/utils/phone.js
// Normalize phone numbers from API (e.g. 0-prefix local format) to E.164 with country code

const COUNTRY_DIAL_CODES = {
  ae: "971",
  sa: "966",
  qa: "974",
  kw: "965",
  om: "968",
  bh: "973",
  in: "91",
  pk: "92",
  gb: "44",
  us: "1",
};

/**
 * Normalize a phone number for display in PhoneInputWithCountry.
 * Converts 0-prefix local numbers (e.g. "0501234567") to E.164 format (e.g. "+971501234567").
 * @param {string} rawPhone - Phone from API (may be "0501234567", "971501234567", "+971501234567", etc.)
 * @param {string} defaultCountry - ISO2 country code (e.g. "ae", "sa") used when converting 0-prefix numbers
 * @returns {string} Phone in E.164 format (with +) for use in the input
 */
export function normalizePhoneForInput(rawPhone, defaultCountry = "ae") {
  const s = (rawPhone || "").trim();
  if (!s) return "";

  const digitsOnly = s.replace(/\D/g, "");

  // Already in E.164 format
  if (s.startsWith("+") && digitsOnly.length > 0) {
    return `+${digitsOnly}`;
  }

  const dialCode = COUNTRY_DIAL_CODES[defaultCountry?.toLowerCase()] || COUNTRY_DIAL_CODES.ae;

  // 00-prefix: "00971501234567" -> "+971501234567"
  if (s.startsWith("00")) {
    const rest = digitsOnly.replace(/^0+/g, "");
    return rest ? `+${rest}` : "";
  }

  // 0-prefix local format: "0501234567" -> "+971501234567"
  if (s.startsWith("0") && digitsOnly.length > 0) {
    const localDigits = digitsOnly.replace(/^0+/, "");
    return localDigits ? `+${dialCode}${localDigits}` : "";
  }

  // Digits only - check if it already includes a known country code
  if (digitsOnly.length > 0) {
    const dialCodes = Object.values(COUNTRY_DIAL_CODES).sort((a, b) => b.length - a.length);
    for (const code of dialCodes) {
      if (digitsOnly.startsWith(code) && digitsOnly.length > code.length) {
        // Already has country code
        return `+${digitsOnly}`;
      }
    }
    // No country code - prepend default
    return `+${dialCode}${digitsOnly}`;
  }

  return s;
}
