import { useEffect, useState } from "react";
import { formatAED } from "../utils/currency";
import { useTranslation } from "react-i18next";

export default function ItemModal({ open, item, onClose, onAdd }) {
  const [selected, setSelected] = useState({}); // { groupName: option }
  const { t } = useTranslation();

  // reset selections when item changes or modal re-opens
  useEffect(() => {
    if (open) setSelected({});
  }, [open, item]);

  // lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !item) return null;

  const selectedMods = Object.values(selected);
  const addPrice = selectedMods.reduce((s, m) => s + (m.price || 0), 0);
  const total = item.price + addPrice;

  // Get item description from various possible fields
  const itemDescription = item.desc || item.subtitle || item._raw?.["pm.Specification"] || item._raw?.["pm_Specification"] || item._raw?.["pm.ShortDescription"] || item._raw?.["pm_ShortDescription"] || "";

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay with smooth backdrop - click outside to close */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70 backdrop-blur-md transition-opacity duration-300 cursor-pointer"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* centered panel with beautiful design */}
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="item-modal-title"
          className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl ring-1 ring-black/10 grid max-h-[95vh] grid-rows-[auto_1fr] overflow-hidden transform transition-all duration-300 scale-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* header with large image + close button */}
          <div className="relative h-64 sm:h-80 overflow-hidden">
            {(() => {
              const imageSrc = item.img || item.images?.[0];
              const fallbackImage = "https://res.cloudinary.com/danoolbdz/image/upload/v1766755726/no-image-icon-23500_j6y6gn.jpg";
              
              // Check if we have a valid image URL
              const hasValidImage = imageSrc && 
                                   typeof imageSrc === "string" && 
                                   imageSrc.trim() &&
                                   (imageSrc.startsWith("http://") || 
                                    imageSrc.startsWith("https://") || 
                                    imageSrc.startsWith("data:") || 
                                    imageSrc.startsWith("blob:"));
              
              return hasValidImage ? (
                <img
                  src={imageSrc}
                  alt={item.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    console.warn(`[ItemModal] Image failed to load:`, imageSrc?.substring(0, 50));
                    e.currentTarget.src = fallbackImage;
                  }}
                  onLoad={() => {
                    // Image loaded successfully
                  }}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className="grid h-20 w-20 place-items-center rounded-xl text-2xl font-bold text-white shadow-lg"
                      style={{
                        background: "linear-gradient(135deg, #C91A4D, #A0153E)",
                      }}
                      aria-hidden
                    >
                      {(item.name || "?").trim().charAt(0).toUpperCase() || "?"}
                    </div>
                    <span className="text-sm text-gray-500 font-medium">NO IMAGE AVAILABLE</span>
                  </div>
                </div>
              );
            })()}
            {/* Gradient overlay for better text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            
            {/* Close button - more elegant */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 backdrop-blur-sm text-slate-700 shadow-lg hover:bg-white hover:scale-110 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* body (scrollable) - beautiful content design */}
          <div className="overflow-y-auto overscroll-contain">
            <div className="p-6 sm:p-8 space-y-6">
              {/* Title and Price Section */}
              <div className="space-y-3 border-b border-gray-100 pb-6">
                <div id="item-modal-title" className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
                  {item.name}
                </div>
                
                {/* Price display - elegant */}
                <div className="flex items-baseline gap-3">
                  <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Price</span>
                  <span className="text-2xl sm:text-3xl font-bold text-[#C91A4D]">
                    {formatAED(item.price)}
                  </span>
                  {/* {item._raw?.["pc.Tax1Amount"] && (
                    <span className="text-sm text-gray-500">(VAT Inclusive)</span>
                  )} */}
                </div>
              </div>

              {/* Description Section */}
              {itemDescription && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Description</h3>
                  <p className="text-base sm:text-lg text-gray-600 leading-relaxed whitespace-pre-line">
                    {itemDescription}
                  </p>
                </div>
              )}

              {/* Category Section (Product ID hidden) */}
              {item.category && (
                <div className="pt-4 border-t border-gray-100">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</span>
                    <p className="text-sm font-medium text-gray-700">{item.category}</p>
                  </div>
                </div>
              )}

              {/* Modifiers Section (if any) */}
              {item.modifiers && item.modifiers.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Customization Options</h3>
                  {item.modifiers.map((g) => (
                    <div key={g.group} className="space-y-3">
                      <div className="font-semibold text-gray-800">{g.group}</div>
                      <div className="flex flex-wrap gap-2">
                        {g.options.map((opt) => {
                          const isSel = selected[g.group]?.name === opt.name;
                          return (
                            <button
                              key={opt.name}
                              onClick={() =>
                                setSelected((s) => ({ ...s, [g.group]: opt }))
                              }
                              className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${
                                isSel
                                  ? "bg-[#C91A4D] text-white border-[#C91A4D] shadow-md scale-105"
                                  : "bg-white text-gray-700 border-gray-200 hover:border-[#C91A4D] hover:text-[#C91A4D] hover:shadow-sm"
                              }`}
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

              {/* Close Button - centered and elegant */}
              <div className="pt-6 border-t border-gray-100">
                <button
                  onClick={onClose}
                  className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#C91A4D] to-[#A0153E] text-white font-semibold text-base shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
