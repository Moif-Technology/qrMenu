import { defaultCountries, parseCountry } from "react-international-phone";

const countries = defaultCountries.map(parseCountry).map((country) => ({
  iso2: country.iso2,
  name: country.name,
  rawDial: String(country.dialCode),
  dialCode: `+${country.dialCode}`,
  format: country.format,
}));

const dialCodesDesc = [...new Set(countries.map((country) => country.rawDial))].sort(
  (a, b) => b.length - a.length
);

const countMaskDigits = (mask) =>
  String(mask || "").split("").filter((char) => char === ".").length;

export function getPhoneCountryByIso2(iso2 = "ae") {
  return (
    countries.find((country) => country.iso2 === String(iso2).toLowerCase()) ||
    countries.find((country) => country.iso2 === "ae") ||
    countries[0]
  );
}

export function detectPhoneCountry(phone, preferredIso2 = "ae") {
  const normalized = String(phone || "").replace(/[^\d+]/g, "");
  if (!normalized.startsWith("+")) return getPhoneCountryByIso2(preferredIso2);

  const preferred = getPhoneCountryByIso2(preferredIso2);
  for (const rawDial of dialCodesDesc) {
    if (!normalized.startsWith(`+${rawDial}`)) continue;
    if (preferred?.rawDial === rawDial) return preferred;
    return countries.find((country) => country.rawDial === rawDial) || preferred;
  }

  return preferred;
}

export function getLocalPhoneDigits(phone, country) {
  const normalized = String(phone || "").replace(/[^\d+]/g, "");
  const selected = country || detectPhoneCountry(normalized);

  if (normalized.startsWith(`+${selected.rawDial}`)) {
    return normalized.slice(selected.rawDial.length + 1).replace(/\D/g, "");
  }

  if (normalized.startsWith("+")) {
    const detected = detectPhoneCountry(normalized, selected.iso2);
    if (normalized.startsWith(`+${detected.rawDial}`)) {
      return normalized.slice(detected.rawDial.length + 1).replace(/\D/g, "");
    }
  }

  if (normalized.startsWith(selected.rawDial)) {
    return normalized.slice(selected.rawDial.length).replace(/\D/g, "");
  }

  return normalized.replace(/\D/g, "");
}

export function getNationalNumberRules(country, localDigits = "") {
  const selected = country || getPhoneCountryByIso2("ae");
  const format = selected.format;

  if (typeof format === "string") {
    const length = countMaskDigits(format);
    return { min: length || 4, max: length || 15 };
  }

  if (format && typeof format === "object") {
    const masks = Object.entries(format)
      .map(([key, mask]) => ({ key, length: countMaskDigits(mask) }))
      .filter((rule) => rule.length > 0);

    const matching = masks.find((rule) => {
      if (rule.key === "default") return false;
      if (!rule.key.startsWith("/") || !rule.key.endsWith("/")) return false;
      try {
        return new RegExp(rule.key.slice(1, -1)).test(localDigits);
      } catch {
        return false;
      }
    });

    if (matching) return { min: matching.length, max: matching.length };

    const lengths = masks.map((rule) => rule.length);
    if (lengths.length) {
      return {
        min: Math.min(...lengths),
        max: Math.max(...lengths),
      };
    }
  }

  const max = Math.max(1, 15 - selected.rawDial.length);
  return { min: Math.min(7, max), max };
}

export function validatePhoneForSelectedCountry(phone, defaultCountry = "ae") {
  const country = detectPhoneCountry(phone, defaultCountry);
  const localDigits = getLocalPhoneDigits(phone, country);
  const rules = getNationalNumberRules(country, localDigits);
  const validLength =
    rules.min === rules.max
      ? localDigits.length === rules.max
      : localDigits.length >= rules.min && localDigits.length <= rules.max;

  return {
    valid: Boolean(localDigits && validLength),
    country,
    localDigits,
    rules,
  };
}

export function getPhoneValidationMessage(phone, defaultCountry = "ae") {
  const result = validatePhoneForSelectedCountry(phone, defaultCountry);
  if (result.valid) return "";

  const { country, localDigits, rules } = result;
  if (!localDigits) return `Enter the mobile number after ${country.dialCode}.`;
  if (rules.min === rules.max) {
    return `${country.name} numbers must have ${rules.max} digits after ${country.dialCode}.`;
  }
  return `${country.name} numbers must have ${rules.min}-${rules.max} digits after ${country.dialCode}.`;
}
