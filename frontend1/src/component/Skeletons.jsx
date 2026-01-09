export function CardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="h-40 bg-gray-200 shimmer" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-gray-200 rounded shimmer" />
        <div className="h-3 bg-gray-200 rounded w-2/3 shimmer" />
        <div className="h-6 bg-gray-200 rounded w-1/3 mt-2 shimmer" />
      </div>
    </div>
  );
}
