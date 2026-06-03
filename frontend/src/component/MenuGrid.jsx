// src/components/MenuGrid.jsx
import { useCart } from "../store/cartStore";
import ItemCard from "./ItemCard";
import PackageCard from "./PackageCard";

export default function MenuGrid({ items, onQuickAdd, onOpen, categoryKey, isPackageView = false, sections = null, canOrder = true }) {
  const add = useCart((s) => s.add);

  const handleQuickAdd = onQuickAdd ?? ((prod, selectedMods) => add(prod, selectedMods));

  // Detect if we're showing packages (either explicit prop, category name contains "package", or items have IsPackageHeader = 1)
  const hasPackageItems = items.some(item => {
    const isPackageHeader = item._raw?.["pm.IsPackageHeader"] || item._raw?.IsPackageHeader;
    return isPackageHeader === 1 || isPackageHeader === true;
  });
  const showingPackages = isPackageView || categoryKey?.toLowerCase().includes('package') || hasPackageItems;

  return (
    <section className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 bg-[radial-gradient(140%_80%_at_50%_0%,rgba(139,111,71,0.12),transparent_55%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pb-16">
        {/* Package Header */}
        {showingPackages && items.length > 0 && (
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-3 rounded-full border-2 border-[rgba(139,111,71,0.2)] bg-gradient-to-r from-[rgba(139,111,71,0.08)] to-[rgba(92,74,61,0.08)] px-6 py-3 shadow-lg backdrop-blur-sm">
              <svg className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span 
                className="text-xl font-black uppercase tracking-wider"
                style={{ 
                  background: "linear-gradient(120deg, var(--grad-start), var(--grad-end))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text"
                }}
              >
                Premium Packages
              </span>
              <svg className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
          </div>
        )}

        {sections && sections.length > 0 ? (
          <div className="space-y-16 sm:space-y-20">
            {sections.map((section) => (
              <section key={section.id} aria-labelledby={`menu-section-title-${section.id}`}>
                <header className="mb-6">
                  <div className="flex items-center gap-4 border-b border-[rgba(92,74,61,0.16)] pb-5">
                    <span className="h-9 w-1.5 rounded-sm bg-[rgba(92,74,61,0.56)]" aria-hidden="true" />
                    <h2 id={`menu-section-title-${section.id}`} className="min-w-0 text-2xl font-semibold tracking-normal sm:text-3xl" style={{ color: "var(--text-primary)" }}>
                      {section.title}
                    </h2>
                  </div>
                </header>

                <ProductGrid
                  items={section.items}
                  categoryKey={`${categoryKey || "default"}_${section.id}`}
                  showingPackages={showingPackages}
                  handleQuickAdd={handleQuickAdd}
                  onOpen={onOpen}
                  canOrder={canOrder}
                />
              </section>
            ))}
          </div>
        ) : (
          <ProductGrid
            items={items}
            categoryKey={categoryKey}
            showingPackages={showingPackages}
            handleQuickAdd={handleQuickAdd}
            onOpen={onOpen}
            canOrder={canOrder}
          />
        )}
    </div>
    </section>
  );
}

function ProductGrid({ items, categoryKey, showingPackages, handleQuickAdd, onOpen, canOrder = true }) {
  return (
    <div className={`grid items-stretch gap-3 sm:gap-4 md:gap-6 ${
      showingPackages
        ? '[grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))] md:[grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]'
        : '[grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--card-min,170px)),1fr))] [--card-min:170px] sm:[--card-min:200px] md:[--card-min:220px] lg:[--card-min:240px]'
    }`}>
      {items.map((p) => {
        const productId = String(
          p._raw?.product_id ||
          p._raw?.["pm.ProductID"] ||
          p._raw?.["pm_ProductID"] ||
          p.product_id ||
          p.id
        );
        const uniqueKey = `${categoryKey || 'default'}_${p.id || p.name || productId}`;
        const isPackageItem = p._raw?.["pm.IsPackageHeader"] === 1 || p._raw?.IsPackageHeader === 1 || p._raw?.["pm.IsPackageHeader"] === true || p._raw?.IsPackageHeader === true;
        const CardComponent = isPackageItem ? PackageCard : ItemCard;

        return (
          <div key={uniqueKey} data-product-id={productId} className="h-full">
            <CardComponent
              item={p}
              onQuickAdd={handleQuickAdd}
              onOpen={onOpen}
              canOrder={canOrder}
            />
          </div>
        );
      })}
    </div>
  );
}
