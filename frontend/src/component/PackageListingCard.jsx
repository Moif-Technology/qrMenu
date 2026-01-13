// frontend/src/component/PackageListingCard.jsx
// Simple card for package listing - just name and price

export default function PackageListingCard({ packageData, onClick }) {
  const name = packageData?.Description || "Package";
  const price = packageData?.price || 0;

  return (
    <article 
      className="group relative overflow-hidden rounded-2xl bg-white border border-gray-200 hover:border-rose-500 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer p-6 hover:-translate-y-1"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View package: ${name}`}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Package Name */}
      <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-rose-600 transition-colors">
        {name}
      </h3>

      {/* Price */}
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black text-rose-600">
          {price.toFixed(0)}
        </span>
        <span className="text-lg font-bold text-gray-500">
          AED
        </span>
      </div>
    </article>
  );
}
