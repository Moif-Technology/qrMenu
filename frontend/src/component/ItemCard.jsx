// src/components/ItemCard.jsx
import { useEffect, useMemo, useState, memo, useRef } from "react";
import { useCart } from "../store/cartStore";
import Icon from "./Icon";
import ModifierModal from "./ModifierModal";
import { useTranslation } from "react-i18next";

/** 🔧 COMMON IMAGE */
const COMMON_IMAGE =
  import.meta?.env?.VITE_MENU_IMG ||
  "https://res.cloudinary.com/danoolbdz/image/upload/v1766755726/no-image-icon-23500_j6y6gn.jpg";
const USE_COMMON_IMAGE_ONLY = false;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function getVal(item, key) {
  const alt = key.includes(".") ? key.replaceAll(".", "_") : key.replaceAll("_", ".");
  if (item?.[key] !== undefined) return item[key];
  if (item?.[alt] !== undefined) return item[alt];
  if (item?._raw?.[key] !== undefined) return item._raw[key];
  if (item?._raw?.[alt] !== undefined) return item._raw[alt];
  return undefined;
}

function ItemCard({
  item,
  onQuickAdd,
  onOpen,
  onModifiers,
  qtyInCart,
}) {
  const items = useCart((s) => s.items);
  const inc = useCart((s) => s.inc);
  const dec = useCart((s) => s.dec);
  const remove = useCart((s) => s.remove);
  const { t } = useTranslation();

  const [selectedMods, setSelectedMods] = useState([]);
  const [showMods, setShowMods] = useState(false);

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
    getVal(item, "pm.ShortDescription") ??
    getVal(item, "pm_ShortDescription") ??
    getVal(item, "pm.Description") ??
    getVal(item, "pm_Description") ??
      "Item",
    [item]
  );

  const imageList = useMemo(() => {
    if (USE_COMMON_IMAGE_ONLY) {
      return [COMMON_IMAGE];
    }
    const list = [];
    if (Array.isArray(item?.images)) {
      item.images.forEach((src) => {
        if (typeof src === "string" && src.trim() && src !== "null" && src !== "undefined") {
          // Validate URL or data URI format
          if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:") || src.startsWith("blob:")) {
            list.push(src.trim());
          }
        }
      });
    }
    const single = item?.img || item?.image || item?._raw?.DocImage;
    if (single && typeof single === "string" && single.trim() && single !== "null" && single !== "undefined") {
      // Validate URL or data URI format
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

  useEffect(() => {
    setSelectedMods([]);
    setShowMods(false);
  }, [itemId]);

  const selectedIds = useMemo(
    () => [...selectedMods.map((m) => m.id ?? m.ModifierID ?? m.name)].sort(),
    [selectedMods]
  );

  const activeImage = imageList[Math.min(imageIndex, imageList.length - 1)] || COMMON_IMAGE;
  
  // Check if we have a real image (not the default fallback)
  // Also validate that it's a proper URL or data URI
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

  const initial = (itemName || "?").trim().charAt(0).toUpperCase() || "?";

  const unitPriceVal = useMemo(() => {
    // Don't use item.price as fallback since it's the total (UnitPrice + Tax1Amount)
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

  const totalPrice = useMemo(() => Number((unitPriceVal + tax1Amount).toFixed(2)), [
    unitPriceVal,
    tax1Amount,
  ]);

  const itemForCart = useMemo(
    () => ({ ...item, id: itemId, name: itemName, price: totalPrice }),
    [item, itemId, itemName, totalPrice]
  );

  const lineKey = useMemo(
    () => JSON.stringify({ id: itemId, mods: selectedIds }),
    [itemId, selectedIds]
  );

  const qtyFromStore = useMemo(() => {
    const line = items.find((x) => x._k === lineKey);
    return line?.qty ?? 0;
  }, [items, lineKey]);
  const totalQtyInCart = useMemo(() => {
    if (itemId == null) return 0;
    const id = String(itemId);
    return items.reduce((sum, line) => {
      if (String(line?.id) !== id) return sum;
      return sum + Number(line?.qty || 0);
    }, 0);
  }, [items, itemId]);
  const visibleQtyInCart = useMemo(
    () => Math.max(totalQtyInCart, Number(qtyInCart || 0)),
    [totalQtyInCart, qtyInCart]
  );

  const vibrate = (ms = 8) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
  };
  const setRipple = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
  };

  const liveRef = useRef(null);
  useEffect(() => {
    if (liveRef.current) liveRef.current.textContent = `Quantity ${qtyFromStore}`;
  }, [qtyFromStore]);

  const groupDesc =
    getVal(item, "gm.GroupDescription") ?? getVal(item, "gm_GroupDescription");

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[rgba(139,111,71,0.08)] bg-white/95 shadow-[0_12px_26px_rgba(58,46,46,0.06)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_24px_45px_rgba(58,46,46,0.12)] sm:rounded-[24px]">
      <div className="relative overflow-hidden rounded-t-2xl sm:rounded-t-[24px]">
        <div 
          className="relative w-full aspect-[4/3] bg-slate-100 overflow-hidden cursor-pointer"
          onClick={onOpen ? () => onOpen(itemForCart) : undefined}
          role="button"
          tabIndex={0}
          aria-label={`View details for ${itemName}`}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && onOpen) {
              e.preventDefault();
              onOpen(itemForCart);
            }
          }}
        >
          {/* Blur-up Placeholder - ALWAYS shows instantly (like Medium, Pinterest, Instagram) */}
          {/* This is the key: show blur placeholder immediately, no loading spinner */}
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
            // Fallback gradient background if no thumbnail
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200" />
          )}

          {/* Actual Image - Fades in smoothly when loaded */}
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
                // Smooth fade-in from blur to full image
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.transition = 'opacity 0.4s ease-in-out';
              }}
              onError={(e) => {
                console.warn(`[ItemCard] Image failed to load for ${itemName}:`, activeImage?.substring(0, 50));
                setImageError(true);
                // Try fallback to common image if current image is not already the fallback
                if (activeImage !== COMMON_IMAGE && activeImage) {
                  // If there are other images in the list, try next one
                  if (imageList.length > 1 && imageIndex < imageList.length - 1) {
                    setImageIndex(imageIndex + 1);
                  } else {
                    // Last resort: use common image
                    e.currentTarget.src = COMMON_IMAGE;
                  }
                } else {
                  // Already on fallback, keep blur placeholder visible
                  e.currentTarget.style.display = 'none';
                }
              }}
              className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 relative z-10 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              referrerPolicy="no-referrer"
              decoding="async"
              // 🚀 SPEED: Add width/height to prevent layout shift and enable browser optimization
              width="400"
              height="300"
              // 🚀 SPEED: Use sizes attribute for responsive images
              sizes="(max-width: 640px) 170px, (max-width: 768px) 200px, (max-width: 1024px) 220px, 240px"
            />
          )}

          {/* Default Image Placeholder - Show when no valid image or all images failed */}
          {(!hasRealImage || (imageError && imageList.length <= 1) || (imageError && imageIndex >= imageList.length - 1)) && (
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-100 to-slate-200">
              <div className="flex flex-col items-center gap-2">
                <div
                  className="grid h-16 w-16 place-items-center rounded-xl text-lg font-bold text-white shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                  }}
                  aria-hidden
                >
                  {initial}
                </div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>NO IMAGE AVAILABLE</span>
              </div>
            </div>
          )}

          {imageList.length > 1 && (
            <>
              <button
                type="button"
                onClick={prevImage}
                className="absolute left-2 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-700 shadow transition hover:bg-white"
                aria-label="Previous image"
              >
                <Icon name="arrow-left" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={nextImage}
                className="absolute right-2 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-700 shadow transition hover:bg-white"
                aria-label="Next image"
              >
                <Icon name="arrow-right" className="h-4 w-4" />
              </button>
              <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1">
                {imageList.map((_, idx) => (
                  <span
                    key={idx}
                    className={`h-2 w-2 rounded-full transition ${
                      idx === imageIndex ? "bg-white" : "bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(17,24,39,0.55)] via-transparent to-transparent" />

        {groupDesc && (
            <div className="absolute left-3 top-3 rounded-full border border-white/50 bg-white/80 px-3 py-1 text-[11px] font-medium shadow" style={{ color: 'var(--text-primary)' }}>
            {groupDesc}
          </div>
        )}

        <button
          onClick={onOpen ? () => onOpen(itemForCart) : undefined}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/60 bg-white/80 text-slate-700 shadow-sm transition hover:bg-white"
          aria-label={`More info about ${itemName}`}
          title="More info"
        >
            <Icon name="info" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-3 pb-4 pt-3 sm:px-4 sm:pb-5 sm:pt-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold leading-tight text-slate-900 line-clamp-2 sm:text-[1.05rem]">
            {itemName}
          </h3>
          {(item.subtitle || item.desc) && (
            <p className="text-[0.85rem] leading-relaxed line-clamp-3 sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              {item.subtitle || item.desc}
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-3">
          {/* OLD ORDERING FOOTER VERSION - full restore block.
              To bring back add-to-cart, in-cart label, quantity controls, and customize:
              replace the CURRENT READ-ONLY FOOTER VERSION below with this block.

          <div className="flex min-h-14 w-full shrink-0 items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center pr-1">
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-400" style={{ letterSpacing: "0.24em" }}>
                  {t("menu.price")}
                </div>
                {visibleQtyInCart > 0 && (
                  <span className="inline-flex h-5 items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold leading-none text-amber-700">
                    In cart: {visibleQtyInCart}
                  </span>
                )}
              </div>
              <div className="mt-1 text-lg font-bold text-slate-900 sm:text-[1.25rem]">
                AED {totalPrice.toFixed(2)}
              </div>
            </div>

            {qtyFromStore <= 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  setRipple(e);
                  vibrate(12);
                  onQuickAdd?.(itemForCart, selectedMods);
                }}
                onPointerDown={setRipple}
                className="item-card-add-cta relative grid h-10 w-10 shrink-0 touch-manipulation place-items-center overflow-hidden rounded-xl border border-stone-800/10 bg-[var(--text-primary)] text-[var(--bg-card)] shadow-sm transition hover:bg-stone-800 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 sm:h-11 sm:w-11"
                aria-label={`${t("menu.add_to_cart")}: ${itemName}`}
                title={t("menu.add_to_cart")}
              >
                <Icon name="plus" className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.25} />
                <span className="btn-ripple" aria-hidden />
              </button>
            ) : (
              <div
                className="flex h-10 shrink-0 items-stretch overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm sm:h-11"
                role="group"
                aria-label={`Quantity controls for ${itemName}`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    setRipple(e);
                    vibrate(8);
                    if (qtyFromStore <= 1) {
                      remove(lineKey);
                    } else {
                      dec(lineKey);
                    }
                  }}
                  onPointerDown={setRipple}
                  className="item-card-qty-btn relative grid min-h-10 min-w-10 touch-manipulation place-items-center overflow-hidden text-stone-600 transition hover:bg-stone-50 active:bg-stone-100 sm:min-h-11 sm:min-w-11"
                  aria-label={qtyFromStore <= 1 ? "Remove from cart" : "Decrease quantity"}
                  title={qtyFromStore <= 1 ? "Remove" : "Decrease"}
                >
                  <Icon name={qtyFromStore <= 1 ? "trash" : "minus"} className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.25} />
                  <span className="btn-ripple" aria-hidden />
                </button>
                <span className="flex min-w-[2rem] items-center justify-center border-x border-stone-200 px-1 text-sm font-semibold tabular-nums leading-none text-stone-900 sm:min-w-[2.25rem] sm:px-1.5">
                  {qtyFromStore}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    setRipple(e);
                    vibrate(8);
                    inc(lineKey);
                  }}
                  onPointerDown={setRipple}
                  className="item-card-qty-btn relative grid min-h-10 min-w-10 touch-manipulation place-items-center overflow-hidden text-stone-600 transition hover:bg-stone-50 active:bg-stone-100 sm:min-h-11 sm:min-w-11"
                  aria-label="Increase quantity"
                  title="Increase"
                >
                  <Icon name="plus" className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.25} />
                  <span className="btn-ripple" aria-hidden />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] font-medium text-gray-500 sm:text-xs">
            <button
              type="button"
              onClick={(e) => {
                setRipple(e);
                vibrate(8);
                setShowMods(true);
              }}
              onPointerDown={setRipple}
              className="relative inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-1.5 text-[var(--grad-end)] transition hover:border-[rgba(201,26,77,0.25)] hover:bg-[var(--grad-start-soft)] sm:px-3"
              title="Customize"
            >
              <Icon name="sliders" className="h-3.5 w-3.5" />
              {t("menu.customize")}
              <span className="btn-ripple" aria-hidden />
            </button>

            <span
              className="rounded-full border border-[rgba(139,111,71,0.08)] bg-[var(--grad-start-soft)] px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--grad-start)] sm:px-3 sm:text-[0.7rem]"
              style={{ letterSpacing: "0.2em" }}
              role="note"
            >
              {t("menu.vat_service_note") || "Prices are subject to VAT & service charge"}
            </span>
          </div>
          */}

          {/* CURRENT READ-ONLY FOOTER VERSION - active code. */}
          <div className="flex min-h-14 w-full shrink-0 items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center pr-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-400" style={{ letterSpacing: "0.24em" }}>
                {t("menu.price")}
              </div>
              <div className="mt-1 text-lg font-bold text-slate-900 sm:text-[1.25rem]">
                {/* AED {totalPrice.toFixed(2)} */}
                AED {unitPriceVal.toFixed(2)}

              </div>
            </div>
          </div>

          <div className="flex items-center justify-end text-[11px] font-medium text-gray-500 sm:text-xs">
            <span
              className="rounded-full border border-[rgba(139,111,71,0.08)] bg-[var(--grad-start-soft)] px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--grad-start)] sm:px-3 sm:text-[0.7rem]"
              style={{ letterSpacing: "0.2em" }}
              role="note"
            >
              {t("menu.vat_service_note") || "Prices are subject to VAT & service charge"}
            </span>
          </div>
        </div>
      </div>

      <span ref={liveRef} className="sr-only" aria-live="polite" />

      <ModifierModal
        open={showMods}
        item={itemForCart}
        initialSelectedIds={selectedIds}
        onClose={() => setShowMods(false)}
        onApply={(pickedMods) => {
          const oldKey = JSON.stringify({ id: itemId, mods: selectedIds });
          useCart.getState().updateMods(oldKey, itemForCart, pickedMods || []);
          setSelectedMods(pickedMods || []);
          setShowMods(false);
        }}
      />
    </article>
  );
}

// 🚀 SPEED OPTIMIZATION: Memoize ItemCard to prevent unnecessary re-renders
// Only re-render if item data actually changes
export default memo(ItemCard, (prevProps, nextProps) => {
  // Custom comparison: only re-render if item ID or image changes
  const prevItemId = prevProps.item?.id || prevProps.item?._raw?.product_id || prevProps.item?._raw?.["pm.ProductID"];
  const nextItemId = nextProps.item?.id || nextProps.item?._raw?.product_id || nextProps.item?._raw?.["pm.ProductID"];
  
  // Check both img and images array (updateItemImage updates item.img and item.images)
  const prevImage = prevProps.item?.img || prevProps.item?.image || prevProps.item?.images?.[0];
  const nextImage = nextProps.item?.img || nextProps.item?.image || nextProps.item?.images?.[0];
  
  // Re-render if ID changed OR image changed (return false means "should update")
  if (prevItemId !== nextItemId) return false;
  if (prevImage !== nextImage) return false;
  
  // No changes - skip re-render
  return true;
});
