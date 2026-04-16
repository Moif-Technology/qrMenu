// frontend/src/component/PackageListingCard.jsx
// Package card: shows image when available, otherwise 3 hardcoded placeholders in order
// TODO: Make dynamic in future

import { useState } from "react";

// 3 hardcoded placeholder images (in order) - replace with your links when ready
const PLACEHOLDER_IMAGES = [
  "https://res.cloudinary.com/dayxivond/image/upload/v1776362197/English_breakfast_eohocd.jpg",
  "https://res.cloudinary.com/dayxivond/image/upload/v1776362484/Opaia_healthy_breakfast_rxfets.jpg",
  "https://res.cloudinary.com/dayxivond/image/upload/v1776362522/laventine_jjskgp.jpg",
];

export default function PackageListingCard({ packageData, onClick, placeholderIndex = 0 }) {
  const [imageError, setImageError] = useState(false);

  const name = packageData?.Description || "Package";
  const price = packageData?.price || 0;
  const imageUrl = packageData?.cloudinaryUrl?.trim();
  const hasImage =
    imageUrl &&
    imageUrl !== "null" &&
    imageUrl !== "undefined" &&
    (imageUrl.startsWith("http://") || imageUrl.startsWith("https://"));
  const showImage = hasImage && !imageError;
  const fallbackImage = PLACEHOLDER_IMAGES[placeholderIndex % PLACEHOLDER_IMAGES.length];

  return (
    <article
      className="group relative overflow-hidden rounded-2xl bg-white border border-gray-200 hover:border-rose-500 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer hover:-translate-y-1 flex flex-col min-w-0 w-full"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View package: ${name}`}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Image area - compact, full image visible (no zoom/crop) */}
      <div className="relative w-full aspect-[3/2] min-h-[100px] sm:min-h-[120px] bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
        {showImage ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-contain object-center group-hover:scale-[1.03] transition-transform duration-300"
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
          />
        ) : (
          <img
            src={fallbackImage}
            alt={name}
            className="w-full h-full object-contain object-center group-hover:scale-[1.03] transition-transform duration-300"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.src = PLACEHOLDER_IMAGES[0];
            }}
          />
        )}
      </div>

      {/* Name + Price */}
      <div className="p-3 sm:p-4 flex flex-col flex-1 min-w-0">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 group-hover:text-rose-600 transition-colors line-clamp-2">
          {name}
        </h3>
        <div className="flex items-baseline gap-2 mt-auto">
          <span className="text-xl sm:text-2xl font-black text-rose-600">
            {price.toFixed(0)}
          </span>
          <span className="text-sm sm:text-base font-bold text-gray-500">AED</span>
        </div>
      </div>
    </article>
  );
}
