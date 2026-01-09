import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
// import CartDrawer from "../component/CartDrawer";
import CategoryTabs from "../component/CategoryTabs";
import FilterBar from "../component/FilterBar";
// import FloatingCartButton from "../component/FloatingCartButton";
import ItemModal from "../component/ItemModal";
import MenuGrid from "../component/MenuGrid";
// import SearchBar from "../component/SearchBar";
import ScrollTopButton from "../component/ScrollTopButton";
import TopBar from "../component/TopBar";
import { useCart } from "../store/cartStore";
import { useTranslation } from "react-i18next";
import Icon from "../component/Icon";

// 🔌 LIVE API
import { getCategories, getItems, getSingleProductImage, getSingleProductImageBinary, getImageMapping, getQrCategories, getQrMenuItems } from "../services/menu.service";
import { checkTableOrders } from "../services/payment.service";

// ————————————————————————————————————————————————
// Helpers to normalize API → UI
function normalizeImage(src) {
  if (!src) return null; // Return null instead of empty string for better checks
  if (typeof src !== "string") return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  
  // Check if it's already a valid URL (http/https) or data URI
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }
  
  // Check if it's a valid base64 string (must have some length and valid base64 chars)
  if (trimmed.length > 10 && /^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return `data:image/jpeg;base64,${trimmed}`;
  }
  
  // Invalid image data
  return null;
}

function mapRowToItem(row) {
  const rawImages = Array.isArray(row.images)
    ? row.images
    : typeof row.images === "string"
    ? (() => {
        try {
          const parsed = JSON.parse(row.images);
          return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
          return [];
        }
      })()
    : [];

  const normalizedImages = rawImages
    .map((img) =>
      typeof img === "string"
        ? normalizeImage(img)
        : normalizeImage(img?.docImage ?? img?.DocImage ?? "")
    )
    .filter((img) => img !== null && img !== ""); // Filter out null and empty strings

  // Calculate price: use backend-calculated price, or calculate from UnitPrice + Tax1Amount
  let calculatedPrice = 0;
  if (row.price !== undefined && row.price !== null) {
    // Backend already calculated price (UnitPrice + Tax1Amount)
    calculatedPrice = Number(row.price);
  } else {
    // Calculate from UnitPrice + Tax1Amount
    const unitPrice = Number(
      row["pc.UnitPrice"] ?? 
      row["pc_UnitPrice"] ?? 
      0
    );
    const tax1Amount = Number(
      row["pc.Tax1Amount"] ?? 
      row["pc_Tax1Amount"] ?? 
      0
    );
    calculatedPrice = Number((unitPrice + tax1Amount).toFixed(2));
  }

  return {
    id: row.id ?? row.product_id ?? row.ID ?? row["pm.ProductID"] ?? row["pm_ProductID"] ?? row["pm.ProductID"],
    name: row.name ?? row.Description ?? row["pm.Description"] ?? row["pm_Description"] ?? "Untitled",
    desc: row.short_description ?? row.Specification ?? row["pm.Specification"] ?? row["pm_Specification"] ?? row["pm.ShortDescription"] ?? row["pm_ShortDescription"] ?? "",
    img: normalizeImage(row.image ?? row.DocImage ?? row.ImageLocation ?? normalizedImages[0] ?? null) || null,
    images: normalizedImages.length > 0 ? normalizedImages : [],
    price: calculatedPrice,
    category: row.group_name ?? row.group_code ?? "",
    categoryId: row.group_id ?? row.GroupID ?? row["pm.GroupID"] ?? row["pm_GroupID"] ?? null,
    _raw: row
  };
}

// Map your UI sort keys → API sort keys
function toApiSort(uiSort) {
  switch (uiSort) {
    case "pop":       return "new";      // newest first
    case "priceAsc":  return "name";     // until price exists, sort by name
    case "priceDesc": return "id_desc";  // stable alternative
    default:          return "new";
  }
}
// ————————————————————————————————————————————————

export default function MenuPage() {
  const add = useCart((s) => s.add);
  const tableId = useCart((s) => s.tableId);
  const token = useCart((s) => s.token);
  const navigate = useNavigate();
  const { t } = useTranslation();

  // UI state
  // const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState(""); // will set after categories load
  const [sort, setSort] = useState("pop");
  const [selectedGroupId, setSelectedGroupId] = useState(null); // Track selected group for showing subgroups
  const [qrGroups, setQrGroups] = useState([]); // Store full QR groups structure with subgroups

  // Data state
  const [cats, setCats] = useState([]);               // [{ id, name }] - current level categories (groups or subgroups)
  const [items, setItems] = useState([]);             // mapped cards
  const [paging, setPaging] = useState({ page: 1, pageSize: 24, total: 0 });
  

  // UI feedback
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalItem, setModalItem] = useState(null);
  const [error, setError] = useState("");
  
  // Payment/Order state
  const [hasOngoingOrders, setHasOngoingOrders] = useState(false);
  const [checkingOrders, setCheckingOrders] = useState(false);
  const checkingOrdersRef = useRef(false); // Prevent duplicate simultaneous calls
  const loadingCategoriesRef = useRef(false); // Prevent duplicate getCategories calls

  // Check for ongoing orders when token/tableId is available
  const checkOrders = useCallback(async () => {
    if (!token) {
      setHasOngoingOrders(false);
      return;
    }
    
    // Prevent duplicate simultaneous calls (React Strict Mode causes double calls in dev)
    if (checkingOrdersRef.current) {
      return;
    }
    
    try {
      checkingOrdersRef.current = true;
      setCheckingOrders(true);
      const result = await checkTableOrders(token);
      setHasOngoingOrders(result.hasOrders);
    } catch (e) {
      console.error("Error checking table orders:", e);
      setHasOngoingOrders(false);
    } finally {
      setCheckingOrders(false);
      checkingOrdersRef.current = false;
    }
  }, [token]);

  useEffect(() => {
    // Add small delay to prevent race conditions with other effects
    const timer = setTimeout(() => {
      checkOrders();
    }, 100);
    return () => clearTimeout(timer);
  }, [checkOrders]);

  // Refresh check when page becomes visible (user returns from payment page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && token && !checkingOrdersRef.current) {
        // Add delay to prevent immediate duplicate calls
        setTimeout(() => {
          checkOrders();
        }, 200);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token, checkOrders]);

  // 1) Load QR categories once, choose first as active
  // Add protection against React Strict Mode double calls
  useEffect(() => {
    // Prevent duplicate calls (React Strict Mode causes double invocation)
    if (loadingCategoriesRef.current || qrGroups.length > 0) {
      return;
    }
    
    (async () => {
      try {
        loadingCategoriesRef.current = true;
        setLoading(true);
        setError("");
        
        console.log("🔄 Fetching QR categories...");
        // Use QR Menu categories instead of normal categories
        const raw = await getQrCategories(); // [{ groupId, name, code, name_ar, subgroups: [...] }, ...]
        
        console.log("📦 Raw QR categories from API:", raw);
        console.log("📦 Is array?", Array.isArray(raw));
        console.log("📦 Length:", raw?.length);
        
        if (!raw || !Array.isArray(raw)) {
          throw new Error("Invalid response from API: expected array of groups");
        }
        
        if (raw.length === 0) {
          console.warn("⚠️ No QR groups found in database");
          setCats([]);
          setQrGroups([]);
          setError("No QR menu groups found. Please create groups in the management page.");
          return;
        }
        
        console.log("📦 First group:", raw[0]);
        console.log("📦 First group subgroups:", raw[0]?.subgroups);
        console.log("📦 First group subgroups length:", raw[0]?.subgroups?.length);
        
        // Store full structure
        setQrGroups(raw);
        
        // Initially show only groups (top level)
        const groupsOnly = raw.map((group) => ({
          id: `group_${group.groupId}`,
          name: group.name || group.GroupDescription || `Group ${group.groupId}`,
          type: 'group',
          groupId: group.groupId,
          hasSubgroups: group.subgroups && Array.isArray(group.subgroups) && group.subgroups.length > 0
        }));
        
        console.log("✅ Mapped groups:", groupsOnly);
        setCats(groupsOnly);
        
        if (groupsOnly.length > 0) {
          const firstGroupId = groupsOnly[0].id;
          setActiveCat(firstGroupId);
          setSelectedGroupId(groupsOnly[0].groupId);
          console.log("✅ Set first group as active:", firstGroupId);
        }
      } catch (e) {
        console.error("❌ Error loading QR categories:", e);
        console.error("❌ Error details:", {
          message: e?.message,
          response: e?.response?.data,
          status: e?.response?.status,
          url: e?.config?.url
        });
        setError(e?.response?.data?.error || e?.message || "Failed to load categories");
        setCats([]);
        setQrGroups([]);
      } finally {
        loadingCategoriesRef.current = false;
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle category selection - show subgroups if group has them, otherwise show products
  const handleCategoryChange = useCallback((categoryId) => {
    console.log("🔵 handleCategoryChange called:", categoryId);
    console.log("🔵 qrGroups:", qrGroups);
    console.log("🔵 qrGroups length:", qrGroups.length);
    
    // Check if it's a group or subgroup
    if (categoryId.startsWith('group_')) {
      const groupIdStr = categoryId.replace('group_', '');
      const groupId = parseInt(groupIdStr);
      console.log("🔵 Looking for groupId:", groupId, "(from string:", groupIdStr + ")");
      
      // Try to find group - handle both number and string comparison
      const group = qrGroups.find(g => {
        const gId = typeof g.groupId === 'number' ? g.groupId : parseInt(g.groupId);
        return gId === groupId;
      });
      
      console.log("🔵 Found group:", group);
      console.log("🔵 Group subgroups:", group?.subgroups);
      console.log("🔵 Group subgroups length:", group?.subgroups?.length);
      console.log("🔵 Is array?", Array.isArray(group?.subgroups));
      
      if (group && group.subgroups && Array.isArray(group.subgroups) && group.subgroups.length > 0) {
        // Show subgroups for this group
        console.log("✅ Group has subgroups, showing them:", group.subgroups.length);
        setSelectedGroupId(groupId);
        const subgroups = group.subgroups.map((subgroup) => ({
          id: `subgroup_${subgroup.subgroupId}`,
          name: subgroup.name || subgroup.SubgroupDescription || `Subgroup ${subgroup.subgroupId}`,
          type: 'subgroup',
          subgroupId: subgroup.subgroupId,
          groupId: groupId
        }));
        console.log("✅ Mapped subgroups:", subgroups);
        // Set subgroups - they will be visible in CategoryTabs
        setCats(subgroups);
        // Auto-select first subgroup so products load immediately AND subgroups are visible
        if (subgroups.length > 0) {
          console.log("✅ Auto-selecting first subgroup:", subgroups[0].id);
          setActiveCat(subgroups[0].id);
        } else {
          setActiveCat("");
        }
        // Clear items initially
        setItems([]);
      } else {
        // Group has no subgroups, show products directly
        console.log("❌ Group has no subgroups, loading products directly");
        console.log("❌ Setting activeCat to:", categoryId);
        setSelectedGroupId(groupId);
        // Keep groups visible in CategoryTabs (don't clear cats)
        // Set activeCat to trigger product load - this should trigger useEffect
        setActiveCat(categoryId);
        console.log("❌ activeCat set, should trigger loadItems via useEffect");
        // Also ensure we don't clear items immediately - let useEffect handle it
      }
    } else if (categoryId.startsWith('subgroup_')) {
      // Subgroup selected, show products
      console.log("✅ Subgroup selected:", categoryId);
      setActiveCat(categoryId); // Set active category to trigger product load
      // Keep selectedGroupId for back navigation
    }
  }, [qrGroups]);

  // Handle back navigation - go back to groups
  const handleBackToGroups = useCallback(() => {
    const groupsOnly = qrGroups.map((group) => ({
      id: `group_${group.groupId}`,
      name: group.name,
      type: 'group',
      groupId: group.groupId,
      hasSubgroups: group.subgroups && group.subgroups.length > 0
    }));
    setCats(groupsOnly);
    setSelectedGroupId(null);
    setActiveCat(groupsOnly.length > 0 ? groupsOnly[0].id : "");
  }, [qrGroups]);

  // 2) Fetch QR menu items with filters
  async function loadItems(page = 1) {
    try {
      setLoading(true);
      setError("");
      const trimmedSearch = search.trim();
      const searching = trimmedSearch.length > 0;
      
      // Parse activeCat to determine if it's a group or subgroup
      let qrGroupId = null;
      let qrSubgroupId = null;
      
      console.log("🔄 loadItems called - activeCat:", activeCat, "searching:", searching);
      
      if (!searching && activeCat) {
        // Check if activeCat is a subgroup
        if (activeCat.startsWith('subgroup_')) {
          qrSubgroupId = parseInt(activeCat.replace('subgroup_', ''));
          console.log("🔄 Loading products for subgroup:", qrSubgroupId);
        } else if (activeCat.startsWith('group_')) {
          // Group selected - load products from this group
          const groupId = parseInt(activeCat.replace('group_', ''));
          qrGroupId = groupId;
          console.log("🔄 Loading products for group:", qrGroupId);
        }
      } else if (searching) {
        console.log("🔄 Loading products with search:", trimmedSearch);
      }
      
      // Load QR menu items (fast, without images)
      console.log("🔄 Calling getQrMenuItems with params:", {
        page,
        pageSize: paging.pageSize,
        search: trimmedSearch || undefined,
        qrGroupId: qrGroupId || undefined,
        qrSubgroupId: qrSubgroupId || undefined,
        sort: toApiSort(sort)
      });
      
      const res = await getQrMenuItems({
        page,
        pageSize: paging.pageSize,
        search: trimmedSearch || undefined,
        qrGroupId: qrGroupId || undefined,
        qrSubgroupId: qrSubgroupId || undefined,
        sort: toApiSort(sort)
      });
      
      console.log("🔄 getQrMenuItems response:", res);
      console.log("🔄 Response data length:", res.data?.length);
      console.log("🔄 Response paging:", res.paging);
      
      const mappedItems = res.data.map(mapRowToItem);
      console.log("🔄 Mapped items length:", mappedItems.length);
      
      // Defensive filter: Ensure RAW MATERIAL products are never displayed (even if backend filter fails)
      // Filter out any products that might have ProductType = 'RAW MATERIAL' or similar
      const filteredItems = mappedItems.filter((item) => {
        const productType = item._raw?.["pm.ProductType"] || item._raw?.ProductType;
        if (!productType) return true; // Allow NULL/undefined (backwards compatibility)
        const normalizedType = String(productType).trim().toUpperCase();
        return normalizedType === 'NORMAL'; // Only show Normal products
      });
      
      console.log("🔄 Filtered items length (after ProductType filter):", filteredItems.length);
      
      // Clear loading set when switching groups
      loadingImagesRef.current.clear();
      
      // Set new items (images will load on-demand via Intersection Observer)
      setItems(filteredItems);
      setPaging(res.paging);
      setLoading(false); // Show items immediately, images will load lazily
      
      // NO CACHE - images are not cached to prevent memory issues
      // Images will load on-demand via Intersection Observer only
      // Previous items with images are automatically garbage collected by React
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || e.message || "Failed to load items");
      setItems([]);
      setPaging((p) => ({ ...p, total: 0 }));
      setLoading(false);
    }
  }

  // NO IMAGE CACHING - Base64 images are too large, cause "Out of Memory" errors
  // Only cache which products have images (lightweight), not the images themselves
  const imageMappingRef = useRef({});
  // Track which images are currently loading to avoid duplicate requests
  const loadingImagesRef = useRef(new Set());
  // Track which images are already loaded
  const loadedImagesRef = useRef(new Set());
  // Request queue to limit concurrent API requests (not needed for Cloudinary URLs)
  const imageQueueRef = useRef([]);
  const activeImageRequestsRef = useRef(0);
  const MAX_CONCURRENT_API_REQUESTS = 2; // Only for API fallback (Cloudinary URLs don't need this limit)

  // Load image mapping on mount (lightweight, fast) - OPTIMIZED: Load immediately, cache in localStorage
  useEffect(() => {
    // Try to load from cache first (instant)
    const cacheKey = 'imageMappingCache';
    const cacheTimestamp = 'imageMappingCacheTimestamp';
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
    
    try {
      const cached = localStorage.getItem(cacheKey);
      const cachedTime = localStorage.getItem(cacheTimestamp);
      
      if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < CACHE_DURATION) {
        const mapping = JSON.parse(cached);
        imageMappingRef.current = mapping;
        console.log(`[IMAGE] ⚡ Loaded from cache (instant)`);
        
        // Still fetch fresh data in background (non-blocking)
    getImageMapping().then(mapping => {
      imageMappingRef.current = mapping;
          localStorage.setItem(cacheKey, JSON.stringify(mapping));
          localStorage.setItem(cacheTimestamp, Date.now().toString());
        }).catch(() => {}); // Silent fail - cache is fine
        return;
      }
    } catch (e) {
      // Cache failed, continue with normal load
    }

    // Load fresh mapping
    getImageMapping().then(mapping => {
      imageMappingRef.current = mapping;
      
      // Cache for next time
      try {
        localStorage.setItem(cacheKey, JSON.stringify(mapping));
        localStorage.setItem(cacheTimestamp, Date.now().toString());
      } catch (e) {
        // localStorage might be full, ignore
      }
      
      // Log mapping statistics for debugging
      const totalProducts = Object.keys(mapping).length;
      const cloudinaryCount = Object.values(mapping).filter(
        info => info && typeof info === 'object' && info.cloudinaryUrl
      ).length;
      const fallbackCount = totalProducts - cloudinaryCount;
      
      console.log(`[IMAGE] 📊 Image mapping loaded:`, {
        totalProducts,
        cloudinaryUrls: cloudinaryCount,
        fallbackNeeded: fallbackCount,
        coverage: totalProducts > 0 ? `${Math.round((cloudinaryCount / totalProducts) * 100)}%` : '0%'
      });
      
      // Log sample entries for debugging
      const sampleEntries = Object.entries(mapping).slice(0, 3);
      console.log(`[IMAGE] 📋 Sample mapping entries:`, sampleEntries);
      
      if (fallbackCount > 0) {
        console.warn(`[IMAGE] ⚠️ ${fallbackCount} products will use API fallback (no Cloudinary URL)`);
      }
    }).catch(err => {
      console.error("[IMAGE] ❌ Failed to load image mapping:", err);
    });
  }, []);

  // DISABLED: Background preloading completely removed to prevent "Out of Memory" errors
  // Images will load on-demand when user actually views them via Intersection Observer

  // Process image queue (only for API fallback - Cloudinary URLs load instantly)
  async function processImageQueue() {
    while (imageQueueRef.current.length > 0 && activeImageRequestsRef.current < MAX_CONCURRENT_API_REQUESTS) {
      const { item, delay } = imageQueueRef.current.shift();
      activeImageRequestsRef.current++;

      // Process immediately (delay handled in loadImageForItem if needed)
      loadImageForItem(item, delay).finally(() => {
        activeImageRequestsRef.current--;
        // Process next immediately (no delay)
        processImageQueue();
      });
    }
  }

  // Batch load Cloudinary URLs for visible items (INSTANT - no API calls) - OPTIMIZED
  function loadCloudinaryImagesBatch(itemsToLoad) {
    // OPTIMIZATION: Process ALL items immediately (no batching delay for Cloudinary)
    // Cloudinary URLs are just assignments, no network overhead
    if (itemsToLoad.length === 0) return;
    
    // 🚀 SPEED: Process all at once - Cloudinary URLs are instant
    itemsToLoad.forEach(item => {
      const productId = String(
        item._raw?.product_id || 
        item._raw?.["pm.ProductID"] || 
        item._raw?.["pm_ProductID"] ||
        item.product_id ||
        item.id
      );

      if (!productId || loadedImagesRef.current.has(productId)) {
        return; // Already loaded or no ID
      }

      const imageInfo = imageMappingRef.current[productId];
      if (imageInfo && typeof imageInfo === 'object' && imageInfo.cloudinaryUrl) {
        // Use Cloudinary URL directly (already optimized from database)
        const cloudinaryUrl = String(imageInfo.cloudinaryUrl).trim();
        
        // Validate Cloudinary URL format
        if (cloudinaryUrl && 
            cloudinaryUrl !== "null" && 
            cloudinaryUrl !== "undefined" &&
            (cloudinaryUrl.startsWith('http://') || cloudinaryUrl.startsWith('https://'))) {
          console.log(`[IMAGE] ✅ Loading Cloudinary URL for ${productId}:`, cloudinaryUrl.substring(0, 80) + '...');
          
          // Load instantly - no queue, no delay, no API call!
          loadedImagesRef.current.add(productId);
          updateItemImage(productId, { 
            image: cloudinaryUrl, 
            images: [cloudinaryUrl],
            type: 'cloudinary'
          });
        } else {
          console.warn(`[IMAGE] ⚠️ Invalid Cloudinary URL format for ${productId}:`, cloudinaryUrl);
        }
      } else {
        console.log(`[IMAGE] ⚠️ No Cloudinary URL for ${productId}, imageInfo:`, imageInfo);
      }
    });
  }

  // Intersection Observer for viewport-based loading (optimized for Cloudinary)
  const observerRef = useRef(null);
  const pendingItemsRef = useRef(new Map()); // Track items waiting to load

  useEffect(() => {
    // Create Intersection Observer with optimized settings
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Batch process all intersecting entries
        const visibleItems = [];
        
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const productId = entry.target.dataset.productId;
            if (productId) {
              // Find item
              const item = items.find(
                (i) =>
                  String(
                    i._raw?.product_id ||
                    i._raw?.["pm.ProductID"] ||
                    i._raw?.["pm_ProductID"] ||
                    i.product_id ||
                    i.id
                  ) === productId
              );
              
              if (item && !loadedImagesRef.current.has(productId)) {
                visibleItems.push(item);
              }
            }
            // Unobserve after processing
            observerRef.current?.unobserve(entry.target);
          }
        });

        // OPTIMIZATION: Batch load Cloudinary URLs instantly (no queue, no delay)
        if (visibleItems.length > 0) {
          // Load Cloudinary URLs immediately in batch (they're just URL assignments)
          loadCloudinaryImagesBatch(visibleItems);
          
          // For items without Cloudinary URLs, queue them for API fallback
          const apiFallbackItems = visibleItems.filter(item => {
            const productId = String(
              item._raw?.product_id || 
              item._raw?.["pm.ProductID"] || 
              item._raw?.["pm_ProductID"] ||
              item.product_id ||
              item.id
            );
            const imageInfo = imageMappingRef.current[productId];
            return !(imageInfo && typeof imageInfo === 'object' && imageInfo.cloudinaryUrl);
          });

          // Queue API fallback items (limited concurrency)
          apiFallbackItems.forEach(item => {
            if (!loadingImagesRef.current.has(String(item.id || item._raw?.product_id))) {
              imageQueueRef.current.push({ item, delay: 0 });
            }
          });
          
          // Process API queue
          processImageQueue();
        }
      },
      {
        rootMargin: "200px", // Load images 200px before they're visible (even smoother scrolling)
        threshold: 0.01, // Trigger as soon as 1% is visible (more aggressive for better UX)
      }
    );

    // Observe all product cards
    const observeCards = () => {
      const cards = document.querySelectorAll('[data-product-id]');
      cards.forEach((card) => {
        if (observerRef.current) {
          observerRef.current.observe(card);
        }
      });
    };

    // OPTIMIZATION: Observe immediately (no delay)
    observeCards();
    
    // Also observe after a micro-delay to catch any late-rendered cards
    const timeoutId = setTimeout(observeCards, 10);

    // OPTIMIZATION: Load above-the-fold images IMMEDIATELY (no delay)
    const loadAboveFoldImages = () => {
      const viewportHeight = window.innerHeight;
      const cards = Array.from(document.querySelectorAll('[data-product-id]'));
      
      const aboveFoldItems = cards
        .filter(card => {
          const rect = card.getBoundingClientRect();
          return rect.top < viewportHeight + 300; // 300px buffer for faster loading
        })
        .map(card => {
          const productId = card.dataset.productId;
          return items.find(
            (i) =>
              String(
                i._raw?.product_id ||
                i._raw?.["pm.ProductID"] ||
                i._raw?.["pm_ProductID"] ||
                i.product_id ||
                i.id
              ) === productId
          );
        })
        .filter(Boolean)
        .filter(item => {
          const productId = String(item.id || item._raw?.product_id);
          return !loadedImagesRef.current.has(productId);
        });

      if (aboveFoldItems.length > 0) {
        console.log(`[IMAGE] 🚀 Loading ${aboveFoldItems.length} above-the-fold images IMMEDIATELY`);
        loadCloudinaryImagesBatch(aboveFoldItems);
        
        // OPTIMIZATION: Preload images using <link rel="preload"> for critical images
        aboveFoldItems.slice(0, 6).forEach(item => { // Preload first 6
          const productId = String(
            item._raw?.product_id || 
            item._raw?.["pm.ProductID"] || 
            item._raw?.["pm_ProductID"] ||
            item.product_id ||
            item.id
          );
          const imageInfo = imageMappingRef.current[productId];
          if (imageInfo && typeof imageInfo === 'object' && imageInfo.cloudinaryUrl) {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'image';
            link.href = imageInfo.cloudinaryUrl;
            document.head.appendChild(link);
          }
        });
      }
    };

    // Load above-fold images IMMEDIATELY (no delay)
    loadAboveFoldImages();

    return () => {
      clearTimeout(timeoutId);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [items]);

  // NO PRELOADING - All images load via Intersection Observer only
  // This prevents "Out of Memory" errors by only loading visible images
  function loadImagesLazily(items) {
    // DISABLED: No preloading - Intersection Observer handles everything
    // Images will load automatically when they come into viewport
  }

  // Load image for a single item (optimized - uses Cloudinary URLs when available)
  async function loadImageForItem(item, delay = 0) {
    // Wait for delay if specified
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Get product ID
    const productId = String(
      item._raw?.product_id || 
      item._raw?.["pm.ProductID"] || 
      item._raw?.["pm_ProductID"] ||
      item.product_id ||
      item.id
    );

    if (!productId) return;

    // Check if product has image (from mapping)
    const imageInfo = imageMappingRef.current[productId];
    
    // Support both old format { productId: true } and new format { productId: { hasImage: true, cloudinaryUrl: '...' } }
    const hasImage = imageInfo === true || (imageInfo && typeof imageInfo === 'object' && imageInfo.hasImage);
    if (!hasImage) {
      // Product doesn't have image, skip
      console.log(`[IMAGE] Product ${productId}: No image in mapping, skipping`);
      return;
    }

    // Check if already loading (prevent duplicate requests)
    if (loadingImagesRef.current.has(productId)) {
      return; // Already loading, skip
    }

    // Mark as loading
    loadingImagesRef.current.add(productId);

    // PRIORITY 1: Use Cloudinary URL directly if available (INSTANT - no API call needed!)
    if (imageInfo && typeof imageInfo === 'object' && imageInfo.cloudinaryUrl) {
      const cloudinaryUrl = String(imageInfo.cloudinaryUrl).trim();
      
      // Validate Cloudinary URL format before using
      if (cloudinaryUrl && 
          cloudinaryUrl !== "null" && 
          cloudinaryUrl !== "undefined" &&
          (cloudinaryUrl.startsWith('http://') || cloudinaryUrl.startsWith('https://'))) {
        // Mark as loaded immediately
        loadedImagesRef.current.add(productId);
        
        console.log(`[IMAGE] ✅ Product ${productId}: Using Cloudinary CDN (INSTANT)`, {
          productId,
          source: 'Cloudinary CDN',
          url: cloudinaryUrl.substring(0, 80) + '...',
          method: 'Direct URL (no API call, no queue)'
        });
        
        // Cloudinary URL is already available - use it directly! 🚀
        updateItemImage(productId, { 
          image: cloudinaryUrl, 
          images: [cloudinaryUrl],
          type: 'cloudinary'
        });
        loadingImagesRef.current.delete(productId);
        return; // Done! No API call needed - image loads instantly from CDN
      } else {
        console.warn(`[IMAGE] ⚠️ Product ${productId}: Invalid Cloudinary URL format, falling back to API`, {
          productId,
          cloudinaryUrl: cloudinaryUrl?.substring(0, 50),
          reason: 'Invalid URL format'
        });
      }
    }

    // PRIORITY 2: Fallback to API call (for images not yet migrated or if Cloudinary URL missing)
    console.log(`[IMAGE] ⚠️ Product ${productId}: Cloudinary URL not available, falling back to API (SLOW)`, {
      productId,
      source: 'Backend API',
      reason: imageInfo && typeof imageInfo === 'object' ? 'No cloudinaryUrl in mapping' : 'Old mapping format',
      method: 'API call (binary fetch)'
    });
    
    const apiStartTime = Date.now();
    try {
      const imageUrl = await getSingleProductImageBinary(productId, 1); // 1 retry
      const apiDuration = Date.now() - apiStartTime;
      
      if (imageUrl) {
        loadedImagesRef.current.add(productId);
        console.log(`[IMAGE] ✅ Product ${productId}: Loaded from API in ${apiDuration}ms`, {
          productId,
          source: 'Backend API',
          duration: `${apiDuration}ms`,
          url: imageUrl.substring(0, 50) + '...',
          type: 'Binary blob'
        });
        
        // Update the item immediately with binary image URL
        // Browser automatically caches binary images, much more efficient than base64
        updateItemImage(productId, { image: imageUrl, images: [imageUrl] });
      } else {
        console.warn(`[IMAGE] ❌ Product ${productId}: API returned no image`);
      }
    } catch (error) {
      const apiDuration = Date.now() - apiStartTime;
      console.error(`[IMAGE] ❌ Product ${productId}: API call failed after ${apiDuration}ms`, {
        productId,
        error: error.message,
        duration: `${apiDuration}ms`
      });
      // Silently fail - item will use fallback image
    } finally {
      // Remove from loading set after a delay (allows retry if needed)
      setTimeout(() => {
        loadingImagesRef.current.delete(productId);
      }, 5000); // Remove after 5 seconds
    }
  }

  // Update a single item's image
  function updateItemImage(productId, imageData) {
    setItems(prevItems => {
      return prevItems.map(item => {
        const itemProductId = String(
          item._raw?.product_id || 
          item._raw?.["pm.ProductID"] || 
          item._raw?.["pm_ProductID"] ||
          item.product_id ||
          item.id
        );

        if (itemProductId === productId && imageData) {
          // Normalize image - handle Cloudinary URLs, blob URLs, and base64
          let normalizedImage = null;
          if (imageData.image && typeof imageData.image === "string") {
            const img = imageData.image.trim();
            if (img && img !== "null" && img !== "undefined") {
              if (img.startsWith('blob:') || 
                  img.startsWith('data:') || 
                  img.startsWith('http://') ||
                  img.startsWith('https://')) {
                normalizedImage = img;
              } else if (img.length > 10) {
                // Assume base64 if it's a long string
                normalizedImage = `data:image/jpeg;base64,${img}`;
              }
            }
          }

          // Normalize images array
          let normalizedImages = item.images || [];
          if (imageData.images && Array.isArray(imageData.images) && imageData.images.length > 0) {
            normalizedImages = imageData.images
              .filter(img => img && typeof img === "string" && img.trim() && img !== "null" && img !== "undefined")
              .map(img => {
                const trimmed = img.trim();
                if (trimmed.startsWith('blob:') || 
                    trimmed.startsWith('data:') || 
                    trimmed.startsWith('http://') ||
                    trimmed.startsWith('https://')) {
                  return trimmed;
                } else if (trimmed.length > 10) {
                  return `data:image/jpeg;base64,${trimmed}`;
                }
                return null;
              })
              .filter(img => img !== null);
          }

          return {
            ...item,
            img: normalizedImage || item.img,
            images: normalizedImages.length > 0 ? normalizedImages : (item.images || [])
          };
        }
        return item;
      });
    });
  }

  // 3) Load on category/sort change
  useEffect(() => {
    console.log("🔄 useEffect triggered - activeCat:", activeCat, "sort:", sort, "search:", search);
    
    // Always load items when activeCat changes (if it's set)
    // This handles both groups and subgroups
    if (activeCat) {
      console.log("🔄 activeCat is set, calling loadItems");
      loadItems(1);
    } else if (search.trim().length > 0) {
      // Search mode - load items
      console.log("🔄 Search mode, calling loadItems");
      loadItems(1);
    } else {
      console.log("🔄 No activeCat and no search, skipping loadItems");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCat, sort, search]);

  // 4) Debounce search
  useEffect(() => {
    if (search.trim().length === 0) return;
    const t = setTimeout(() => loadItems(1), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Modal + cart
  const openModal = (item) => {
    setModalItem(item);
    setModalOpen(true);
  };
  // const quickAdd = (item) => add(item, []);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((paging.total || 0) / (paging.pageSize || 24))),
    [paging]
  );

  const handleGoToPayment = () => {
    if (token) {
      navigate(`/r/${token}`);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(120% 60% at 50% 0%, rgba(201,26,77,0.16), transparent 55%), #fdf8fa",
      }}
    >
      <TopBar onCart={() => {}} />
      
      {/* Payment/Billing Banner - Show when table has ongoing orders */}
      {hasOngoingOrders && token && (
        <div className="sticky top-[73px] z-30 mx-auto max-w-6xl px-4 sm:px-6 pt-4">
          <div
            className="rounded-2xl border p-4 shadow-lg backdrop-blur-xl"
            style={{
              background: "linear-gradient(135deg, rgba(201,26,77,0.1), rgba(122,0,38,0.05))",
              borderColor: "var(--grad-end-soft)",
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full grid place-items-center"
                  style={{
                    background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                  }}
                >
                  <Icon name="receipt" className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {tableId ? `Table ${tableId}` : "Your table"} has an ongoing order
                  </div>
                  <div className="text-xs text-gray-600">
                    View your bill and make payment
                  </div>
                </div>
              </div>
              <button
                onClick={handleGoToPayment}
                className="btn-pill h-10 px-6 text-sm font-semibold whitespace-nowrap"
                style={{
                  background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                }}
              >
                View Bill
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="relative pb-24 pt-6">
        {/* Search section hidden */}
        {/* <section className="relative overflow-hidden pt-6 pb-8">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[260px]"
            style={{
              background:
                "radial-gradient(140% 90% at 50% -20%, rgba(122,0,38,0.12), transparent 65%)",
            }}
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-[30px] border border-white/70 bg-white/85 backdrop-blur-xl shadow-[0_20px_48px_rgba(122,0,38,0.12)]">
              <div
                className="pointer-events-none absolute -top-14 right-8 h-24 w-24 rounded-full opacity-40 blur-2xl"
                style={{
                  background:
                    "radial-gradient(circle at center, rgba(201,26,77,0.35), transparent 70%)",
                }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-14 left-8 h-28 w-28 rounded-full opacity-30 blur-2xl"
                style={{
                  background:
                    "radial-gradient(circle at center, rgba(122,0,38,0.32), transparent 70%)",
                }}
                aria-hidden
              />

              <div className="relative px-4 py-6 sm:px-6 sm:py-7">
                <SearchBar value={search} onChange={setSearch} variant="hero" />
              </div>
            </div>
          </div>
        </section> */}

        <div className="relative mt-6 space-y-6">
          {/* Show error if categories failed to load */}
          {error && search.trim().length === 0 && (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-700">
                <Icon name="alert-circle" className="h-5 w-5" />
                <span className="font-medium">Error loading menu categories</span>
              </div>
              <p className="mt-1 text-sm text-red-600">{error}</p>
            </div>
          )}
          
          {/* Show loading state for categories */}
          {loading && cats.length === 0 && search.trim().length === 0 && (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
                  <div 
                    className="absolute inset-0 border-4 border-transparent border-t-[var(--grad-start)] border-r-[var(--grad-end)] rounded-full animate-spin"
                  ></div>
                </div>
                <p className="text-sm font-medium text-gray-700">Loading menu categories...</p>
              </div>
            </div>
          )}
          
          {/* Show categories when available */}
          {search.trim().length === 0 && cats.length > 0 && (
            <>
              {/* Back button when showing subgroups */}
              {selectedGroupId && cats.some(c => c.type === 'subgroup') && (
                <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-2">
                  <button
                    onClick={handleBackToGroups}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <Icon name="arrow-left" className="h-4 w-4" />
                    <span>Back to Groups</span>
                  </button>
                </div>
              )}
              
              {/* CategoryTabs - should show subgroups when cats contains subgroups */}
              <CategoryTabs
                categories={cats}
                activeId={activeCat}
                onChange={handleCategoryChange}
              />
            </>
          )}
          
          {/* Show message if no categories found */}
          {!loading && cats.length === 0 && search.trim().length === 0 && !error && (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-center text-gray-500">
              No menu categories found. Please create QR groups in the management page.
            </div>
          )}

      <FilterBar sort={sort} onSort={setSort} />
        </div>

      {error && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-red-600">
            {error}
          </div>
      )}

      {loading ? (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          {/* Spinner with loading message */}
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="relative w-16 h-16">
              {/* Outer spinning ring */}
              <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
              {/* Inner spinning ring with gradient colors */}
              <div 
                className="absolute inset-0 border-4 border-transparent border-t-[var(--grad-start)] border-r-[var(--grad-end)] rounded-full animate-spin"
              ></div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Loading menu items...</p>
              <p className="text-xs text-gray-500 mt-1">Please wait</p>
            </div>
          </div>
          
          {/* Skeleton loaders as fallback (optional - can be removed if spinner is enough) */}
          {/* <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-48 rounded-[22px] border border-white/60 bg-white/70 shadow-inner shimmer opacity-50"
              />
            ))}
          </div> */}
        </div>
      ) : (
        <MenuGrid items={items} onQuickAdd={undefined} onOpen={openModal} />
      )}

      {!loading && paging.total > paging.pageSize && (
          <div className="flex items-center justify-center gap-3 my-10">
          <button
            className="btn-pill-outline"
            disabled={paging.page <= 1}
            onClick={() => loadItems(Number(paging.page) - 1)}
          >
              {t("buttons.prev")}
          </button>
            <span className="text-sm text-gray-600">
            Page {paging.page} / {totalPages}
          </span>
          <button
            className="btn-pill-outline"
            disabled={paging.page >= totalPages}
            onClick={() => loadItems(Number(paging.page) + 1)}
          >
              {t("buttons.next")}
          </button>
        </div>
      )}
      </main>

      <ItemModal
        open={modalOpen}
        item={modalItem}
        onClose={() => setModalOpen(false)}
        onAdd={undefined}
        // onAdd={(mods) => add(modalItem, mods)}
      />

      {/* Cart components hidden */}
      {/* <CartDrawer open={drawer} onClose={() => setDrawer(false)} /> */}

      {/* <FloatingCartButton
        isOpen={drawer || modalOpen}
        onClick={() => setDrawer(true)}
      /> */}

      <ScrollTopButton />
    </div>
  );
}
