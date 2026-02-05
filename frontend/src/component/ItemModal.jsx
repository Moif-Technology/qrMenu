import { useEffect, useState } from "react";
import { formatAED } from "../utils/currency";
import { useTranslation } from "react-i18next";
import { useUI } from "../store/uiStore";
import Icon from "./Icon";

// Allergen mapping with icons (matches AllergyTagInput)
const ALLERGEN_MAP = {
  dairy: { icon: "🥛", label: "Dairy", aliases: ["milk", "dairy products"] },
  nuts: { icon: "🥜", label: "Nuts", aliases: ["peanuts", "tree nuts"] },
  gluten: { icon: "🌾", label: "Gluten", aliases: ["wheat", "barley", "rye"] },
  eggs: { icon: "🥚", label: "Eggs", aliases: ["egg"] },
  soy: { icon: "🌱", label: "Soy", aliases: ["soya", "soybean"] },
  fish: { icon: "🐟", label: "Fish", aliases: [] },
  shellfish: { icon: "🦐", label: "Shellfish", aliases: ["crustaceans", "mollusks"] },
  sesame: { icon: "⚪", label: "Sesame", aliases: ["sesame seeds"] },
  mustard: { icon: "🟡", label: "Mustard", aliases: ["mustard seeds"] },
  sulphites: { icon: "🍷", label: "Sulphites", aliases: ["sulfites", "sulfur dioxide"] },
  tree_nuts: { icon: "🌰", label: "Tree Nuts", aliases: [] }, // Keep for backward compatibility
};

// Helper to parse allergies from comma-separated text
function parseAllergies(allergiesText) {
  if (!allergiesText || !allergiesText.trim()) return [];
  
  // Split by comma and trim each item
  const tags = allergiesText
    .split(",")
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0);
  
  if (tags.length === 0) return [];
  
  // Try to match each tag with known allergens
  const found = [];
  const unmatched = [];
  
  tags.forEach(tag => {
    let matched = false;
    // Check if tag matches any allergen key, label, or alias
    Object.keys(ALLERGEN_MAP).forEach((key) => {
      const allergen = ALLERGEN_MAP[key];
      const tagLower = tag.toLowerCase();
      const labelLower = allergen.label.toLowerCase();
      const keyLower = key.toLowerCase();
      
      // Check exact matches or partial matches
      if (tagLower === keyLower || 
          tagLower === labelLower || 
          tagLower.includes(keyLower) || 
          labelLower.includes(tagLower) ||
          allergen.aliases?.some(alias => tagLower === alias.toLowerCase() || tagLower.includes(alias.toLowerCase()))) {
        if (!found.includes(key)) {
          found.push(key);
          matched = true;
        }
      }
    });
    
    // If no match found, add as raw text (capitalize first letter)
    if (!matched && !unmatched.includes(tag)) {
      unmatched.push(tag.charAt(0).toUpperCase() + tag.slice(1));
    }
  });
  
  // Return matched allergens first, then unmatched as raw text
  return [...found, ...unmatched];
}

export default function ItemModal({ open, item, onClose, onAdd }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const { t } = useTranslation();
  const lang = useUI((s) => s.lang);
  const isRTL = lang === "ar";

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setImageLoaded(false);
      setIsClosing(false);
    }
  }, [open, item]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && handleClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Handle close with animation
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose?.();
    }, 200);
  };

  if (!open || !item) return null;

  // Unit price only (exclude tax) - match ItemCard display
  const unitPriceVal = (() => {
    const v = item["pc.UnitPrice"] ?? item["pc_UnitPrice"] ?? item._raw?.["pc.UnitPrice"] ?? item._raw?.["pc_UnitPrice"] ?? 0;
    return Number.isFinite(Number(v)) ? Number(v) : 0;
  })();

  // Get item name - use Arabic if available and language is Arabic
  const arabicName = item._raw?.["pm.DescriptionArabic"] || 
                     item._raw?.["pm_DescriptionArabic"] || 
                     item._raw?.DescriptionArabic || 
                     item._raw?.name_ar || 
                     null;
  const hasArabicName = arabicName && typeof arabicName === "string" && arabicName.trim() !== "";
  const displayName = (isRTL && hasArabicName) 
    ? arabicName.trim() 
    : (item.name || "Untitled");

  // Get full description - use FullDescription field (prefer FullDescription over Specification)
  const fullDescAr = item._raw?.["pm.FullDescriptionArabic"] || 
                     item._raw?.["pm_FullDescriptionArabic"] || 
                     item._raw?.FullDescriptionArabic || 
                     null;
  const hasFullDescAr = fullDescAr && typeof fullDescAr === "string" && fullDescAr.trim() !== "";
  const fullDesc = item._raw?.["pm.FullDescription"] || 
                   item._raw?.["pm_FullDescription"] || 
                   item._raw?.FullDescription || 
                   null;
  const hasFullDesc = fullDesc && typeof fullDesc === "string" && fullDesc.trim() !== "";
  
  // Fallback to Specification if FullDescription is not available
  const arabicDesc = item._raw?.["pm.SpecificationArabic"] || 
                     item._raw?.["pm_SpecificationArabic"] || 
                     item._raw?.SpecificationArabic || 
                     null;
  const hasArabicDesc = arabicDesc && typeof arabicDesc === "string" && arabicDesc.trim() !== "";
  
  const itemDescription = (isRTL && hasFullDescAr)
    ? fullDescAr.trim()
    : (isRTL && hasArabicDesc)
    ? arabicDesc.trim()
    : (hasFullDesc)
    ? fullDesc.trim()
    : (item.desc || item.subtitle || item._raw?.["pm.Specification"] || item._raw?.["pm_Specification"] || "");

  // Get allergies information
  const allergiesAr = item._raw?.["pm.AllergiesArabic"] || 
                      item._raw?.["pm_AllergiesArabic"] || 
                      item._raw?.AllergiesArabic || 
                      null;
  const hasAllergiesAr = allergiesAr && typeof allergiesAr === "string" && allergiesAr.trim() !== "";
  const allergies = item._raw?.["pm.Allergies"] || 
                    item._raw?.["pm_Allergies"] || 
                    item._raw?.Allergies || 
                    null;
  const hasAllergies = allergies && typeof allergies === "string" && allergies.trim() !== "";
  const allergiesText = (isRTL && hasAllergiesAr)
    ? allergiesAr.trim()
    : (hasAllergies)
    ? allergies.trim()
    : null;
  
  // Parse allergies into array for badge display
  const allergensList = allergiesText ? parseAllergies(allergiesText) : [];

  const imageSrc = item.img || item.images?.[0];
  const fallbackImage = "https://res.cloudinary.com/danoolbdz/image/upload/v1766755726/no-image-icon-23500_j6y6gn.jpg";
  const hasValidImage = imageSrc && 
                       typeof imageSrc === "string" && 
                       imageSrc.trim() &&
                       (imageSrc.startsWith("http://") || 
                        imageSrc.startsWith("https://") || 
                        imageSrc.startsWith("data:") || 
                        imageSrc.startsWith("blob:"));

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          isClosing ? "opacity-0" : "opacity-100"
        }`}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        dir={isRTL ? "rtl" : "ltr"}
        className={`relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col transition-all duration-200 ${
          isClosing
            ? "translate-y-full md:translate-y-0 md:scale-95 opacity-0"
            : "translate-y-0 md:scale-100 opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with image */}
        <div className="relative">
          {/* Image */}
          <div className="relative aspect-[4/3] bg-neutral-100 overflow-hidden rounded-t-3xl md:rounded-t-3xl">
            {!imageLoaded && hasValidImage && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--grad-start)', borderTopColor: 'transparent' }} />
              </div>
            )}
            {hasValidImage ? (
              <img
                src={imageSrc}
                alt={displayName}
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  imageLoaded ? "opacity-100" : "opacity-0"
                }`}
                onLoad={() => setImageLoaded(true)}
                onError={(e) => {
                  console.warn(`[ItemModal] Image failed to load:`, imageSrc?.substring(0, 50));
                  e.currentTarget.src = fallbackImage;
                  setImageLoaded(true);
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100">
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{
                      background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                    }}
                  >
                    <span className="text-3xl font-bold text-white">
                      {(displayName || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs text-neutral-400 uppercase tracking-wider">No image available</span>
                </div>
              </div>
            )}

            {/* Category badge */}
            {item.category && (
              <div className={`absolute bottom-4 ${isRTL ? 'right-4' : 'left-4'}`}>
                <span className="px-3 py-1.5 text-xs font-medium bg-black/40 backdrop-blur-md text-white rounded-full">
                  {item.category}
                </span>
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            className={`absolute top-4 ${isRTL ? 'left-4' : 'right-4'} w-10 h-10 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm text-neutral-700 hover:bg-white transition-colors shadow-lg`}
            aria-label="Close modal"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-5 sm:p-6 space-y-5">
            {/* Name, Price */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <h2 id="modal-title" className="text-xl sm:text-2xl font-bold text-neutral-900 leading-tight flex-1">
                  {displayName}
                </h2>
                <div className="flex-shrink-0 px-4 py-2 rounded-xl" style={{ background: 'rgba(139, 111, 71, 0.1)' }}>
                  <span className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--grad-start)' }}>
                    {formatAED(unitPriceVal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            {itemDescription && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  {t("menu.description") || "Description"}
                </h3>
                <p className="text-sm sm:text-base text-neutral-600 leading-relaxed whitespace-pre-line">
                  {itemDescription}
                </p>
              </div>
            )}

            {/* Allergy Information - Always show this section */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                {t("menu.allergies") || "Allergy Information"}
              </h3>
              {allergiesText ? (
                allergensList.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {allergensList.map((allergen, idx) => {
                        const mapped = ALLERGEN_MAP[allergen];
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-neutral-100 text-neutral-700 rounded-full border border-neutral-200"
                          >
                            <span>{mapped?.icon || "⚠️"}</span>
                            <span>{mapped?.label || allergen}</span>
                          </span>
                        );
                      })}
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                      <Icon name="alert-circle" className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'rgb(217, 119, 6)' }} />
                      <p className="text-xs" style={{ color: 'rgb(217, 119, 6)' }}>
                        {isRTL 
                          ? "إذا كنت تعاني من حساسية شديدة، يرجى إبلاغ موظفينا قبل الطلب."
                          : "If you have severe allergies, please inform our staff before ordering."
                        }
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-line">
                    {allergiesText}
                  </p>
                )
              ) : (
                <p className="text-sm text-neutral-500 italic">
                  {isRTL ? "لا توجد معلومات عن الحساسية متوفرة." : "No allergen information provided."}
                </p>
              )}
            </div>

            {/* Modifiers Section (if any) */}
            {item.modifiers && item.modifiers.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-neutral-100">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Customization Options
                </h3>
                {item.modifiers.map((g) => (
                  <div key={g.group} className="space-y-3">
                    <div className="font-semibold text-neutral-800">{g.group}</div>
                    <div className="flex flex-wrap gap-2">
                      {g.options.map((opt) => {
                        const isSel = item._selectedMods?.[g.group]?.name === opt.name;
                        return (
                          <button
                            key={opt.name}
                            onClick={() => {
                              // Handle modifier selection if needed
                            }}
                            className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${
                              isSel
                                ? "text-white shadow-md"
                                : "bg-white text-neutral-700 border-neutral-200 hover:shadow-sm"
                            }`}
                            style={isSel ? {
                              background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                              borderColor: "var(--grad-start)"
                            } : {}}
                          >
                            {opt.name}
                            {opt.price ? ` +${formatAED(opt.price)}` : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-neutral-100 bg-white/80 backdrop-blur-sm flex-shrink-0">
          <button
            onClick={handleClose}
            className="w-full py-3.5 px-6 rounded-2xl text-white font-semibold text-base hover:opacity-90 active:scale-[0.98] transition-all shadow-lg"
            style={{
              background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
              boxShadow: "0 10px 25px rgba(139, 111, 71, 0.2)"
            }}
          >
            {t("buttons.close") || "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
