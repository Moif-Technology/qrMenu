// frontend/src/component/reservation/PhoneInputWithCountry.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  usePhoneInput,
  defaultCountries,
  parseCountry,
  FlagImage,
} from "react-international-phone";
import "react-international-phone/style.css";

export default function PhoneInputWithCountry({
  value = "",
  onChange,
  defaultCountry = "ae",
  placeholder = "Phone number",
  disabled = false,
  className = "",
  id,
  hasError = false,
}) {
  const wrapperRef = useRef(null);
  const popoverRef = useRef(null);
  const searchRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // prevent auto-detect from overriding a manual dropdown selection
  const lastManualPickAtRef = useRef(0);

  const {
    inputValue,
    handlePhoneValueChange,
    inputRef,
    country,
    setCountry,
  } = usePhoneInput({
    defaultCountry,
    value,
    onChange: (data) => onChange?.(data.phone || ""),
  });

  const countries = useMemo(() => {
    return defaultCountries
      .map(parseCountry)
      .map((c) => ({
        iso2: c.iso2,
        name: c.name,
        dialCode: `+${c.dialCode}`,
        rawDial: String(c.dialCode),
      }));
  }, []);

  const preferredIso2 = useMemo(
    () => ["ae", "sa", "qa", "kw", "om", "bh", "in", "pk", "gb", "us"],
    []
  );

  const preferredCountries = useMemo(() => {
    const set = new Set(preferredIso2);
    return countries.filter((c) => set.has(c.iso2));
  }, [countries, preferredIso2]);

  const filteredCountries = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return countries;

    const digits = q.replace(/[^\d]/g, "");
    const hasDigits = digits.length > 0;

    return countries.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(q);
      const isoMatch = c.iso2.toLowerCase().includes(q);
      const dialMatch = hasDigits
        ? c.rawDial.startsWith(digits) ||
          c.dialCode.replace("+", "").startsWith(digits)
        : c.dialCode.toLowerCase().includes(q);
      return nameMatch || isoMatch || dialMatch;
    });
  }, [countries, query]);

  // Normalize current country value from hook (sometimes it's string, sometimes object)
  const currentIso2 = useMemo(() => {
    if (typeof country === "string") return country;
    if (country && typeof country === "object" && country.iso2) return country.iso2;
    return defaultCountry;
  }, [country, defaultCountry]);

  const selected = useMemo(() => {
    return (
      countries.find((x) => x.iso2 === currentIso2) ||
      countries.find((x) => x.iso2 === defaultCountry) || {
        iso2: defaultCountry,
        name: "Country",
        dialCode: "+",
        rawDial: "",
      }
    );
  }, [countries, currentIso2, defaultCountry]);

  // ---- helpers to detect/replace dial code ----
  const dialCodesDesc = useMemo(() => {
    // longest first so +971 matches before +9 etc
    return [...new Set(countries.map((c) => c.rawDial))].sort(
      (a, b) => b.length - a.length
    );
  }, [countries]);

  const detectCountryFromPhone = useCallback(
    (phoneStr, preferredIso2) => {
      if (!phoneStr || !phoneStr.startsWith("+")) return null;

      for (const rawDial of dialCodesDesc) {
        if (phoneStr.startsWith(`+${rawDial}`)) {
          // When multiple countries share the same dial code (e.g. +1 for US/CA),
          // prefer the current selection to avoid flickering/resetting the input
          if (preferredIso2) {
            const preferred = countries.find((c) => c.iso2 === preferredIso2);
            if (preferred && preferred.rawDial === rawDial) return preferred;
          }
          return countries.find((c) => c.rawDial === rawDial) || null;
        }
      }
      return null;
    },
    [countries, dialCodesDesc]
  );

  const replaceDialCode = (phoneStr, newRawDial) => {
    const s = (phoneStr || "").trim();
    if (!s) return `+${newRawDial}`;
    if (!s.startsWith("+")) return `+${newRawDial}${s.replace(/[^\d]/g, "")}`;

    // remove current dial if found, keep rest
    for (const rawDial of dialCodesDesc) {
      const prefix = `+${rawDial}`;
      if (s.startsWith(prefix)) {
        const rest = s.slice(prefix.length); // keep the rest as-is
        return `+${newRawDial}${rest}`;
      }
    }

    // if no dial matched, just prepend new dial and keep digits
    const digitsOnly = s.replace(/[^\d]/g, "");
    return `+${newRawDial}${digitsOnly ? digitsOnly : ""}`;
  };

  // Auto-detect country from phone value (BUT don't override right after manual pick)
  // Pass currentIso2 so +1 (US/CA) etc. prefer the already-selected country and don't flicker
  useEffect(() => {
    const now = Date.now();
    if (now - lastManualPickAtRef.current < 600) return; // pause after manual pick

    const phoneStr = (value || inputValue || "").trim();
    if (!phoneStr || !phoneStr.startsWith("+")) return;

    const detected = detectCountryFromPhone(phoneStr, currentIso2);
    if (!detected) return;

    if (detected.iso2 !== currentIso2) {
      setCountry(detected.iso2);
    }
  }, [value, inputValue, currentIso2, setCountry, detectCountryFromPhone]);

  // Close on outside click / ESC
  useEffect(() => {
    if (!open) return;

    const onDown = (e) => {
      const w = wrapperRef.current;
      const p = popoverRef.current;
      if (!w || !p) return;

      if (!w.contains(e.target) && !p.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Autofocus search
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus?.(), 0);
  }, [open]);

  const pickCountry = (iso2) => {
    const picked = countries.find((c) => c.iso2 === iso2);
    if (!picked) return;

    // mark manual pick time to stop auto-detect overriding
    lastManualPickAtRef.current = Date.now();

    // update the selected country in the lib
    setCountry(iso2);

    // IMPORTANT: also update the phone value prefix so UI matches
    const basePhone = (value || inputValue || "").trim();
    const nextPhone = replaceDialCode(basePhone, picked.rawDial);

    onChange?.(nextPhone);

    setOpen(false);
    setQuery("");
    setTimeout(() => inputRef?.current?.focus?.(), 0);
  };

  return (
    <div ref={wrapperRef} className={["relative", className].join(" ").trim()}>
      {/* Input box */}
      <div
        className={[
          "flex h-11 w-full items-stretch overflow-hidden rounded-xl border bg-white transition",
          hasError
            ? "border-red-500 focus-within:ring-4 focus-within:ring-red-500/15"
            : "border-gray-300 focus-within:border-[#C91A4D] focus-within:ring-4 focus-within:ring-[#C91A4D]/15",
          disabled ? "opacity-70" : "",
        ].join(" ")}
      >
        {/* Country button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={[
            "flex w-[118px] min-w-[118px] items-center gap-2 border-r px-3 text-left",
            hasError ? "border-red-200" : "border-gray-200",
            disabled
              ? "cursor-not-allowed bg-gray-50"
              : "cursor-pointer bg-white hover:bg-gray-50",
          ].join(" ")}
          aria-label="Select country"
        >
          <FlagImage iso2={selected.iso2} size="20px" />
          <div className="flex flex-col leading-[1.05]">
            <div className="font-mono text-[13.5px] font-extrabold text-gray-900">
              {selected.dialCode}
            </div>
            <div className="text-[11.5px] font-extrabold text-gray-500">
              {selected.iso2.toUpperCase()}
            </div>
          </div>

          <svg className="ml-auto h-4 w-4 text-gray-700" viewBox="0 0 24 24" fill="none">
            <path
              d="M7 10l5 5 5-5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Phone input */}
        <input
          id={id}
          ref={inputRef}
          value={inputValue}
          onChange={handlePhoneValueChange}
          placeholder={placeholder}
          disabled={disabled}
          inputMode="tel"
          className="w-full flex-1 border-0 bg-transparent px-3 text-[15.5px] font-bold text-gray-900 outline-none placeholder:font-semibold placeholder:text-gray-400"
        />
      </div>

      {/* Dropdown - absolute, directly below input like a common dropdown */}
      {open && !disabled && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Country list"
          className="absolute left-0 top-full z-[9999] mt-1 w-[360px] max-w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_12px_30px_rgba(0,0,0,0.14)]"
        >
          {/* Top / search */}
          <div className="border-b border-gray-100 bg-gradient-to-b from-white to-[#fbfbfb] p-3">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code (e.g. UAE, +971, 971)"
              className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm font-bold text-gray-900 outline-none focus:border-[#C91A4D] focus:ring-4 focus:ring-[#C91A4D]/10"
            />
            <div className="mt-2 text-xs font-semibold text-gray-500">
              Tip: type <span className="font-extrabold">+971</span> or{" "}
              <span className="font-extrabold">971</span> for UAE quickly.
            </div>
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-auto p-2 [scrollbar-width:thin]">
            {!query && preferredCountries.length > 0 && (
              <>
                <div className="px-2 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-gray-500">
                  Popular
                </div>

                {preferredCountries.map((c) => {
                  const active = c.iso2 === selected.iso2;
                  return (
                    <button
                      key={`pref-${c.iso2}`}
                      type="button"
                      onClick={() => pickCountry(c.iso2)}
                      className={[
                        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left transition",
                        active ? "bg-[#FBE6EC]" : "hover:bg-gray-50 active:bg-gray-100",
                      ].join(" ")}
                    >
                      <FlagImage iso2={c.iso2} size="20px" />
                      <div className="min-w-0 flex-1 truncate text-sm font-extrabold text-gray-900">
                        {c.name}
                      </div>
                      <div className="font-mono text-[13px] font-extrabold text-gray-900/90">
                        {c.dialCode}
                      </div>
                    </button>
                  );
                })}

                <div className="my-2 border-t border-gray-100" />
              </>
            )}

            <div className="px-2 pb-1 pt-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-gray-500">
              {query ? `Results (${filteredCountries.length})` : "All countries"}
            </div>

            {filteredCountries.map((c) => {
              const active = c.iso2 === selected.iso2;
              return (
                <button
                  key={c.iso2}
                  type="button"
                  onClick={() => pickCountry(c.iso2)}
                  className={[
                    "flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left transition",
                    active ? "bg-[#FBE6EC]" : "hover:bg-gray-50 active:bg-gray-100",
                  ].join(" ")}
                >
                  <FlagImage iso2={c.iso2} size="20px" />
                  <div className="min-w-0 flex-1 truncate text-sm font-extrabold text-gray-900">
                    {c.name}
                  </div>
                  <div className="font-mono text-[13px] font-extrabold text-gray-900/90">
                    {c.dialCode}
                  </div>
                </button>
              );
            })}

            {filteredCountries.length === 0 && (
              <div className="p-3 text-sm font-semibold text-gray-500">
                No matches. Try “UAE” or “+971”.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
