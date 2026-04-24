import Icon from "./Icon";

export default function MenuGroupList({
  categories,
  activeId,
  onSelect,
  onBack,
  showBack = false,
  title = "Menu",
  subtitle = "Sections",
  backLabel = "Back",
  tableLabel = "",
}) {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-4 sm:px-6">
      {/* Premium Navigation - Simplified */}
      {showBack && (
        <div className="mb-8 border-b border-gray-100 pb-6">
          <button
            type="button"
            onClick={onBack}
            className="group flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-gray-500 transition-colors hover:text-gray-900"
          >
            <Icon name="arrow-left" className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            {backLabel}
          </button>
        </div>
      )}

      {/* Elegant Header */}
      <header className="mb-14 text-center space-y-4">
        {tableLabel ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(184,134,11,0.3)] bg-[rgba(184,134,11,0.06)] px-4 py-1.5 mb-2">
            <Icon name="map-pin" className="h-3.5 w-3.5 text-[#B8860B]" />
            <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#7A4E05]">{tableLabel}</span>
          </div>
        ) : null}
        <h2 className="text-[11px] font-bold uppercase tracking-[0.5em] text-[#B8860B]">
          {subtitle}
        </h2>
        <h1 className="text-5xl font-light tracking-tight text-gray-950 sm:text-6xl md:text-7xl italic serif">
          {title}
        </h1>
        <div className="mx-auto h-px w-16 bg-[#B8860B]/40 mt-8" />
      </header>

      {/* Sophisticated Grid Layout with Higher Visibility */}
      <div 
        className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 pb-24"
        role="list"
        aria-label={title}
      >
        {categories.map((category, index) => {
          const active = activeId === category.id;
          const hasChildren = category.hasGroups || category.hasSubgroups;

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.id)}
              className={`group relative flex items-center justify-between overflow-hidden rounded-xl border border-gray-100 py-6 px-5 text-left transition-all duration-500 shadow-sm bg-gray-50/40 hover:bg-white hover:shadow-md hover:border-[#B8860B]/10 ${
                active ? "bg-white border-[#B8860B]/30 shadow-md ring-0" : ""
              }`}
              aria-pressed={active}
            >
              <div className="flex items-center gap-5">
                <span className="text-[10px] font-semibold tabular-nums tracking-[0.2em] text-[#B8860B]/60">
                  {String(index + 1).padStart(2, '0')}
                </span>
                
                <div className="space-y-0.5">
                  <h3 className={`text-lg font-light tracking-wide transition-colors duration-300 sm:text-xl ${
                    active ? "text-gray-900" : "text-gray-700 group-hover:text-gray-900"
                  }`}>
                    {category.name}
                  </h3>
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-gray-400 group-hover:text-[#B8860B]/60 transition-colors">
                    {hasChildren ? "Collection" : "View"}
                  </p>
                </div>
              </div>

              {/* Minimalist Indicator */}
              <div className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-500 ${
                active 
                  ? "border-[#B8860B]/20 bg-[#B8860B]/10 text-[#B8860B] rotate-90" 
                  : "border-gray-200 text-gray-300 group-hover:border-[#B8860B]/20 group-hover:text-[#B8860B]"
              }`}>
                <Icon name="arrow-right" className="h-3.5 w-3.5" />
              </div>

              {/* Sophisticated Side Accent */}
              <div className={`absolute top-0 left-0 h-full w-[2px] bg-[#B8860B] transition-all duration-700 ${
                active ? "opacity-100" : "opacity-0 group-hover:opacity-30"
              }`} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
