// src/component/PackageCard.jsx
import { useMemo, useState, useEffect } from "react";
import Icon from "./Icon";
import { useTranslation } from "react-i18next";

const COMMON_IMAGE =
  import.meta?.env?.VITE_MENU_IMG ||
  "https://res.cloudinary.com/danoolbdz/image/upload/v1766755726/no-image-icon-23500_j6y6gn.jpg";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function getVal(item, key) {
  const alt = key.includes(".") ? key.replaceAll(".", "_") : key.replaceAll("_", ".");
  if (item?.[key] !== undefined) return item[key];
  if (item?.[alt] !== undefined) return item[alt];
  if (item?._raw?.[key] !== undefined) return item._raw[key];
  if (item?._raw?.[alt] !== undefined) return item._raw[alt];
  return undefined;
}

export default function PackageCard({ item, onOpen }) {
  const { t } = useTranslation();

  const itemId = useMemo(
    () =>
      getVal(item, "id") ??
      getVal(item, "pm.ID") ??
      getVal(item, "pm_ID") ??
      getVal(item, "product_id") ??
      getVal(item, "pm.ProductID") ??
      getVal(item, "pm_ProductID") ??
      null,
    [item]
  );

  const itemName = useMemo(
    () =>
      item?.name ??
      getVal(item, "pm.Description") ??
      getVal(item, "pm_Description") ??
      getVal(item, "pm.ShortDescription") ??
      getVal(item, "pm_ShortDescription") ??
      "Package",
    [item]
  );

  const itemDesc = useMemo(
    () =>
      item?.desc ??
      item?.subtitle ??
      getVal(item, "pm.Specification") ??
      getVal(item, "pm_Specification") ??
      getVal(item, "pm.ShortDescription") ??
      getVal(item, "pm_ShortDescription") ??
      "",
    [item]
  );

  // Extract package price (e.g., "70" from "70 AED Package")
  const extractedPrice = useMemo(() => {
    const match = itemName.match(/(\d+)\s*(AED|aed)?/i);
    return match ? parseInt(match[1]) : null;
  }, [itemName]);

  const imageList = useMemo(() => {
    const list = [];
    if (Array.isArray(item?.images)) {
      item.images.forEach((src) => {
        if (typeof src === "string" && src.trim() && src !== "null" && src !== "undefined") {
          if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:") || src.startsWith("blob:")) {
            list.push(src.trim());
          }
        }
      });
    }
    const single = item?.img || item?.image || item?._raw?.DocImage;
    if (single && typeof single === "string" && single.trim() && single !== "null" && single !== "undefined") {
      if (single.startsWith("http://") || single.startsWith("https://") || single.startsWith("data:") || single.startsWith("blob:")) {
        if (!list.includes(single)) list.unshift(single);
      }
    }
    return list.length ? list : [COMMON_IMAGE];
  }, [item]);

  const [imageIndex, setImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageIndex(0);
    setImageError(false);
    setImageLoaded(false);
  }, [imageList, itemName]);

  const activeImage = imageList[Math.min(imageIndex, imageList.length - 1)] || COMMON_IMAGE;
  const hasRealImage = activeImage && 
                       activeImage !== COMMON_IMAGE && 
                       (activeImage.startsWith("http://") || 
                        activeImage.startsWith("https://") || 
                        activeImage.startsWith("data:") || 
                        activeImage.startsWith("blob:"));

  const nextImage = () => {
    setImageIndex((idx) => (idx + 1) % imageList.length);
  };
  const prevImage = () => {
    setImageIndex((idx) => (idx - 1 + imageList.length) % imageList.length);
  };

  const unitPrice = useMemo(() => {
    const v =
      getVal(item, "pc.UnitPrice") ??
      getVal(item, "pc_UnitPrice") ??
      0;
    return num(v);
  }, [item]);

  const tax1Amount = useMemo(() => {
    const v =
      getVal(item, "pc.Tax1Amount") ??
      getVal(item, "pc_Tax1Amount") ??
      0;
    return num(v);
  }, [item]);

  const totalPrice = useMemo(() => Number((unitPrice + tax1Amount).toFixed(2)), [
    unitPrice,
    tax1Amount,
  ]);

  const itemForCart = useMemo(
    () => ({ ...item, id: itemId, name: itemName, price: totalPrice }),
    [item, itemId, itemName, totalPrice]
  );

  const initial = (itemName || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <article 
      className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_rgba(122,0,38,0.15)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_32px_80px_rgba(122,0,38,0.25)] cursor-pointer border-2 border-transparent hover:border-[rgba(201,26,77,0.3)]"
      onClick={onOpen ? () => onOpen(itemForCart) : undefined}
      role="button"
      tabIndex={0}
      aria-label={`View package details for ${itemName}`}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onOpen) {
          e.preventDefault();
          onOpen(itemForCart);
        }
      }}
    >
      {/* Premium Badge */}
      <div className="absolute left-6 top-6 z-20 flex items-center gap-2 rounded-full border border-white/80 bg-white/95 backdrop-blur-md px-4 py-2 shadow-lg">
        <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
        <span className="text-sm font-bold text-gray-800 uppercase tracking-wider">Package</span>
      </div>

      {/* Image Section */}
      <div className="relative h-64 sm:h-72 md:h-80 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
        {/* Blur-up Placeholder */}
        {item?.thumbnailUrl && hasRealImage ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover scale-110"
            style={{ 
              filter: 'blur(20px)',
              transform: 'scale(1.1)',
              transition: 'opacity 0.3s ease-out'
            }}
            loading="eager"
            fetchPriority="high"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-rose-100 via-pink-50 to-amber-50" />
        )}

        {/* Actual Image */}
        {activeImage && (
          <img
            key={`${activeImage}-${imageIndex}`}
            src={activeImage}
            alt={itemName}
            loading={activeImage.startsWith('https://res.cloudinary.com') ? 'eager' : 'lazy'}
            fetchPriority={activeImage.startsWith('https://res.cloudinary.com') ? 'high' : 'auto'}
            onLoad={(e) => {
              setImageLoaded(true);
              setImageError(false);
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.transition = 'opacity 0.4s ease-in-out';
            }}
            onError={(e) => {
              console.warn(`[PackageCard] Image failed to load for ${itemName}`);
              setImageError(true);
              if (activeImage !== COMMON_IMAGE && activeImage) {
                if (imageList.length > 1 && imageIndex < imageList.length - 1) {
                  setImageIndex(imageIndex + 1);
                } else {
                  e.currentTarget.src = COMMON_IMAGE;
                }
              } else {
                e.currentTarget.style.display = 'none';
              }
            }}
            className={`h-full w-full object-cover transition-all duration-700 group-hover:scale-110 relative z-10 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            referrerPolicy="no-referrer"
            decoding="async"
            width="600"
            height="400"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        )}

        {/* Default Placeholder */}
        {(!hasRealImage || (imageError && imageList.length <= 1) || (imageError && imageIndex >= imageList.length - 1)) && (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-rose-100 via-pink-50 to-amber-50">
            <div className="flex flex-col items-center gap-3">
              <div
                className="grid h-24 w-24 place-items-center rounded-2xl text-3xl font-bold text-white shadow-2xl"
                style={{
                  background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                }}
                aria-hidden
              >
                {initial}
              </div>
              <span className="text-sm text-gray-500 font-semibold">PACKAGE IMAGE</span>
            </div>
          </div>
        )}

        {/* Image Navigation */}
        {imageList.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prevImage();
              }}
              className="absolute left-4 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 backdrop-blur-sm text-slate-700 shadow-lg transition hover:bg-white hover:scale-110"
              aria-label="Previous image"
            >
              <Icon name="arrow-left" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                nextImage();
              }}
              className="absolute right-4 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 backdrop-blur-sm text-slate-700 shadow-lg transition hover:bg-white hover:scale-110"
              aria-label="Next image"
            >
              <Icon name="arrow-right" className="h-5 w-5" />
            </button>
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5">
              {imageList.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-2 w-2 rounded-full transition ${
                    idx === imageIndex ? "bg-white w-6" : "bg-white/50"
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {/* Gradient Overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        {/* Info Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onOpen) onOpen(itemForCart);
          }}
          className="absolute right-6 top-6 z-20 grid h-11 w-11 place-items-center rounded-full border-2 border-white/80 bg-white/90 backdrop-blur-md text-slate-700 shadow-lg transition hover:bg-white hover:scale-110"
          aria-label={`More info about ${itemName}`}
          title="More info"
        >
          <Icon name="info" className="h-5 w-5" />
        </button>
      </div>

      {/* Content Section */}
      <div className="relative flex flex-1 flex-col p-6 sm:p-7">
        {/* Decorative Pattern */}
        <div 
          className="absolute top-0 left-0 right-0 h-1 opacity-80"
          style={{
            background: "linear-gradient(90deg, var(--grad-start), var(--grad-mid), var(--grad-end), var(--grad-mid), var(--grad-start))",
            backgroundSize: "200% 100%",
            animation: "shimmer 3s linear infinite"
          }}
        />
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>

        {/* Package Name */}
        <div className="mb-4">
          <h3 className="text-2xl sm:text-3xl font-bold leading-tight mb-2" style={{ 
            background: "linear-gradient(120deg, var(--grad-start), var(--grad-end))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text"
          }}>
            {itemName}
          </h3>
          {itemDesc && (
            <p className="text-base text-gray-600 leading-relaxed line-clamp-3">
              {itemDesc}
            </p>
          )}
        </div>

        {/* Price Section */}
        <div className="mt-auto pt-4 border-t border-gray-100">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                Package Price
              </div>
              <div className="flex items-baseline gap-2">
                <span 
                  className="text-4xl sm:text-5xl font-black"
                  style={{ 
                    background: "linear-gradient(120deg, var(--grad-start), var(--grad-end))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text"
                  }}
                >
                  {totalPrice.toFixed(0)}
                </span>
                <span className="text-2xl font-bold text-gray-400 pb-1">AED</span>
              </div>
            </div>
            
            {/* View Details Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOpen) onOpen(itemForCart);
              }}
              className="relative inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold text-white shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-105 active:scale-95 group"
              style={{
                background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
              }}
              aria-label={`View details for ${itemName}`}
            >
              <span>View</span>
              <Icon name="arrow-right" className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              <div 
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: "linear-gradient(135deg, var(--grad-end), var(--grad-start))",
                }}
              />
              <span className="relative z-10 flex items-center gap-2">
                <span>View</span>
                <Icon name="arrow-right" className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </span>
            </button>
          </div>

          {/* VAT Notice */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">VAT Inclusive • Service charge may apply</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

