import { useState, useRef, useEffect } from "react";
import { X, Plus } from "lucide-react";

// Common allergens with icons
const COMMON_ALLERGENS = [
  { key: "dairy", label: "Dairy", icon: "🥛", aliases: ["milk", "dairy products"] },
  { key: "nuts", label: "Nuts", icon: "🥜", aliases: ["peanuts", "tree nuts"] },
  { key: "gluten", label: "Gluten", icon: "🌾", aliases: ["wheat", "barley", "rye"] },
  { key: "eggs", label: "Eggs", icon: "🥚", aliases: ["egg"] },
  { key: "soy", label: "Soy", icon: "🌱", aliases: ["soya", "soybean"] },
  { key: "fish", label: "Fish", icon: "🐟", aliases: [] },
  { key: "shellfish", label: "Shellfish", icon: "🦐", aliases: ["crustaceans", "mollusks"] },
  { key: "sesame", label: "Sesame", icon: "⚪", aliases: ["sesame seeds"] },
  { key: "mustard", label: "Mustard", icon: "🟡", aliases: ["mustard seeds"] },
  { key: "sulphites", label: "Sulphites", icon: "🍷", aliases: ["sulfites", "sulfur dioxide"] },
];

// Parse comma-separated allergies into array
function parseAllergies(allergiesText) {
  if (!allergiesText || !allergiesText.trim()) return [];
  return allergiesText
    .split(",")
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
}

// Format allergies array into comma-separated string
function formatAllergies(allergiesArray) {
  return allergiesArray.join(", ");
}

export default function AllergyTagInput({ value, onChange, placeholder, dir = "ltr" }) {
  const [tags, setTags] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Track if we're updating from internal changes vs external value changes
  const isInternalUpdate = useRef(false);

  // Initialize tags from value (comma-separated string) - only when value changes externally
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    
    if (value) {
      const parsed = parseAllergies(value);
      const currentFormatted = formatAllergies(tags);
      // Only update if the value actually changed (prevents infinite loop)
      if (currentFormatted !== value.trim()) {
        setTags(parsed);
      }
    } else {
      if (tags.length > 0) {
        setTags([]);
      }
    }
  }, [value]);

  // Update parent when tags change (but not on initial mount)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    isInternalUpdate.current = true;
    const formatted = formatAllergies(tags);
    onChange(formatted);
  }, [tags]);

  // Filter suggestions based on input
  const filteredSuggestions = COMMON_ALLERGENS.filter(
    allergen => {
      const tagLower = allergen.label.toLowerCase();
      const inputLower = inputValue.toLowerCase();
      const isAlreadyAdded = tags.includes(tagLower) || 
                            tags.some(tag => allergen.aliases?.some(alias => tag === alias.toLowerCase()));
      const matches = tagLower.includes(inputLower) || 
                     allergen.aliases?.some(alias => alias.toLowerCase().includes(inputLower));
      return !isAlreadyAdded && matches;
    }
  );

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    setShowSuggestions(val.length > 0);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue.trim());
    } else if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const addTag = (tag) => {
    const normalizedTag = tag.toLowerCase().trim();
    if (!normalizedTag) return;
    
    // Check if already exists (by label or alias)
    const exists = tags.some(t => {
      const allergen = COMMON_ALLERGENS.find(a => a.label.toLowerCase() === t || a.aliases?.some(alias => alias.toLowerCase() === t));
      const newAllergen = COMMON_ALLERGENS.find(a => a.label.toLowerCase() === normalizedTag || a.aliases?.some(alias => alias.toLowerCase() === normalizedTag));
      return allergen?.key === newAllergen?.key;
    });
    
    if (!exists) {
      // Normalize to allergen label if it's an alias
      const allergen = COMMON_ALLERGENS.find(a => 
        a.label.toLowerCase() === normalizedTag || 
        a.aliases?.some(alias => alias.toLowerCase() === normalizedTag)
      );
      const finalTag = allergen ? allergen.label.toLowerCase() : normalizedTag;
      setTags([...tags, finalTag]);
      setInputValue("");
      setShowSuggestions(false);
    }
  };

  const removeTag = (index) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const handleSuggestionClick = (allergen) => {
    addTag(allergen.label);
  };

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Tags Display */}
      <div className="flex flex-wrap gap-2 mb-2 min-h-[40px] p-2 border border-gray-300 rounded-lg bg-white">
        {tags.map((tag, index) => {
          const allergen = COMMON_ALLERGENS.find(a => 
            a.label.toLowerCase() === tag || 
            a.aliases?.some(alias => alias.toLowerCase() === tag)
          );
          return (
            <span
              key={index}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-sm font-medium text-amber-800"
            >
              {allergen?.icon && <span>{allergen.icon}</span>}
              <span>{allergen?.label || tag}</span>
              <button
                type="button"
                onClick={() => removeTag(index)}
                className="ml-1 hover:bg-amber-100 rounded-full p-0.5 transition-colors"
                aria-label={`Remove ${allergen?.label || tag}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          );
        })}
        
        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onFocus={() => setShowSuggestions(inputValue.length > 0)}
          placeholder={tags.length === 0 ? placeholder : "Add another allergy..."}
          className="flex-1 min-w-[120px] outline-none border-none bg-transparent text-sm"
          dir={dir}
        />
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filteredSuggestions.map((allergen) => (
            <button
              key={allergen.key}
              type="button"
              onClick={() => handleSuggestionClick(allergen)}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2 transition-colors"
            >
              <span>{allergen.icon}</span>
              <span className="text-sm font-medium">{allergen.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Add Button */}
      {inputValue.trim() && !filteredSuggestions.some(a => a.label.toLowerCase() === inputValue.toLowerCase()) && (
        <button
          type="button"
          onClick={() => addTag(inputValue.trim())}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add "{inputValue.trim()}"
        </button>
      )}

      {/* Quick Add Buttons */}
      <div className="mt-3">
        <p className="text-xs text-gray-500 mb-2">Quick add:</p>
        <div className="flex flex-wrap gap-2">
          {COMMON_ALLERGENS
            .filter(allergen => {
              const tagLower = allergen.label.toLowerCase();
              return !tags.includes(tagLower) && 
                     !tags.some(tag => allergen.aliases?.some(alias => tag === alias.toLowerCase()));
            })
            .slice(0, 5)
            .map((allergen) => (
              <button
                key={allergen.key}
                type="button"
                onClick={() => addTag(allergen.label)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                <span>{allergen.icon}</span>
                <span>{allergen.label}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
