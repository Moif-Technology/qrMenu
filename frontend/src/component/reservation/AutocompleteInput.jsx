// frontend/src/component/reservation/AutocompleteInput.jsx
import { useState, useEffect, useRef } from "react";
import { searchCustomers } from "../../services/reservation.service";

/**
 * Autocomplete Input Component
 * Shows customer suggestions as the user types. The backend search supports
 * name, phone, and email, so one field can be used as a customer lookup.
 */
export default function AutocompleteInput({
  value,
  onChange,
  onSelect,
  suggestions = [],
  field = "search",
  style = {},
  ...otherProps
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const searchValue = String(value || "").trim();
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      setFilteredSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
      setHighlightedIndex(-1);
      return;
    }

    if (searchValue.length < 2) {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await searchCustomers(searchValue, {
          page: 1,
          pageSize: 8,
          sort: "recent",
        });

        if (result.ok && result.customers) {
          setFilteredSuggestions(result.customers.slice(0, 8));
          setShowSuggestions(result.customers.length > 0);
        } else {
          setFilteredSuggestions([]);
          setShowSuggestions(false);
        }
      } catch (error) {
        console.error("Autocomplete search error:", error);
        setFilteredSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsSearching(false);
        setHighlightedIndex(-1);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSuggestionClick = (customer) => {
    skipNextSearchRef.current = true;
    setFilteredSuggestions([]);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    onSelect(customer);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || filteredSuggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
          e.preventDefault();
          handleSuggestionClick(filteredSuggestions[highlightedIndex]);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (filteredSuggestions.length > 0) {
            setShowSuggestions(true);
          }
          otherProps.onFocus?.();
        }}
        style={style}
        {...otherProps}
      />

      {(showSuggestions || isSearching) && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 1000,
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: "10px",
            marginTop: "4px",
            maxHeight: "280px",
            overflowY: "auto",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            padding: "4px 0",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              fontSize: "11px",
              fontWeight: "700",
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              borderBottom: "1px solid #f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Customer Master ({filteredSuggestions.length})</span>
            {isSearching && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#C91A4D"
                strokeWidth="2"
                style={{ animation: "spin 1s linear infinite" }}
              >
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            )}
          </div>

          {isSearching && filteredSuggestions.length === 0 && (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "#6b7280",
                fontSize: "13px",
              }}
            >
              Searching customers...
            </div>
          )}

          {filteredSuggestions.map((customer, index) => (
            <div
              key={`${customer.id ?? customer.customerId ?? customer.phone ?? customer.name ?? "customer"}-${index}`}
              onClick={() => handleSuggestionClick(customer)}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                background: highlightedIndex === index ? "var(--grad-start-soft)" : "#fff",
                borderLeft:
                  highlightedIndex === index
                    ? "3px solid var(--text-accent)"
                    : "3px solid transparent",
                transition: "all 0.15s",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
              onMouseEnter={(e) => {
                if (highlightedIndex !== index) {
                  e.currentTarget.style.background = "#f9fafb";
                }
              }}
              onMouseLeave={(e) => {
                if (highlightedIndex !== index) {
                  e.currentTarget.style.background = "#fff";
                }
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C91A4D" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: "700",
                      color: "#111827",
                      marginBottom: "2px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {customer.name || "Unnamed customer"}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#6b7280",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Phone: {customer.phone || "No phone"}
                    {customer.email && ` | Email: ${customer.email}`}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div
            style={{
              padding: "8px 12px",
              fontSize: "11px",
              color: "#9ca3af",
              borderTop: "1px solid #f3f4f6",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "4px",
            }}
          >
            <span>Tip</span>
            <span>Use Up/Down arrows to navigate, Enter to select</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
