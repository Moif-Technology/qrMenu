// frontend/src/component/PackageListingCard.jsx
// Card for displaying packages in listing view (when viewing PACKAGES subgroup)

import { useMemo, useState, useEffect } from "react";
import Icon from "./Icon";
import { useTranslation } from "react-i18next";

const COMMON_IMAGE =
  import.meta?.env?.VITE_MENU_IMG ||
  "https://res.cloudinary.com/danoolbdz/image/upload/v1766755726/no-image-icon-23500_j6y6gn.jpg";

export default function PackageListingCard({ packageData, onClick }) {
  const { t } = useTranslation();
  
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const name = packageData?.Description || "Package";
  const description = packageData?.Specification || packageData?.ShortDescription || "";
  const price = packageData?.price || 0;
  const itemCount = packageData?.itemCount || 0;
  const cloudinaryUrl = packageData?.cloudinaryUrl;
  
  const imageUrl = cloudinaryUrl || COMMON_IMAGE;
  const hasRealImage = imageUrl && imageUrl !== COMMON_IMAGE;
  
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [imageUrl]);

  return (
    <article 
      className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_rgba(122,0,38,0.15)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_32px_80px_rgba(122,0,38,0.25)] cursor-pointer border-2 border-transparent hover:border-[rgba(201,26,77,0.3)]"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View package details for ${name}`}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
          e.preventDefault();
          onClick();
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
      <div className="relative h-64 sm:h-72 overflow-hidden bg-gradient-to-br from-rose-100 via-pink-50 to-amber-50">
        {/* Actual Image */}
        {imageUrl && (
          <img
            src={imageUrl}
            alt={name}
            loading="lazy"
            onLoad={() => {
              setImageLoaded(true);
              setImageError(false);
            }}
            onError={() => {
              console.warn(`[PackageListingCard] Image failed to load for ${name}`);
              setImageError(true);
            }}
            className={`h-full w-full object-cover transition-all duration-700 group-hover:scale-110 relative z-10 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            referrerPolicy="no-referrer"
            decoding="async"
          />
        )}

        {/* Default Placeholder */}
        {(!hasRealImage || imageError) && (
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
              <span className="text-sm text-gray-500 font-semibold">PACKAGE</span>
            </div>
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        {/* Info Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onClick) onClick();
          }}
          className="absolute right-6 top-6 z-20 grid h-11 w-11 place-items-center rounded-full border-2 border-white/80 bg-white/90 backdrop-blur-md text-slate-700 shadow-lg transition hover:bg-white hover:scale-110"
          aria-label={`More info about ${name}`}
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

        {/* Package Name */}
        <div className="mb-4">
          <h3 className="text-2xl sm:text-3xl font-bold leading-tight mb-2" style={{ 
            background: "linear-gradient(120deg, var(--grad-start), var(--grad-end))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text"
          }}>
            {name}
          </h3>
          {description && (
            <p className="text-base text-gray-600 leading-relaxed line-clamp-2">
              {description}
            </p>
          )}
        </div>

        {/* Item Count Badge */}
        {itemCount > 0 && (
          <div className="mb-4 inline-flex items-center gap-2 self-start rounded-full bg-amber-50 border border-amber-200 px-4 py-2">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="text-sm font-bold text-amber-800">
              Includes {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
          </div>
        )}

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
                  {price.toFixed(0)}
                </span>
                <span className="text-2xl font-bold text-gray-400 pb-1">AED</span>
              </div>
            </div>
            
            {/* View Items Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick();
              }}
              className="relative inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold text-white shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-105 active:scale-95 group"
              style={{
                background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
              }}
              aria-label={`View items in ${name}`}
            >
              <div 
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: "linear-gradient(135deg, var(--grad-end), var(--grad-start))",
                }}
              />
              <span className="relative z-10 flex items-center gap-2">
                <span>View Items</span>
                <Icon name="arrow-right" className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

