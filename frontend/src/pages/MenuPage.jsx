import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CartDrawer from "../component/CartDrawer";
import CategoryTabs from "../component/CategoryTabs";
import FilterBar from "../component/FilterBar";
import FloatingCartButton from "../component/FloatingCartButton";
import ItemCard from "../component/ItemCard";
import ItemModal from "../component/ItemModal";
import MenuGrid from "../component/MenuGrid";
import MenuGroupList from "../component/MenuGroupList";
import PackageListingCard from "../component/PackageListingCard";
// import SearchBar from "../component/SearchBar";
import { useTranslation } from "react-i18next";
import Icon from "../component/Icon";
import ScrollTopButton from "../component/ScrollTopButton";
import TopBar from "../component/TopBar";
import { useCart } from "../store/cartStore";
import { useUI } from "../store/uiStore";

// 🔌 LIVE API
import { log, error as logError } from "../lib/logger";
import { isOrderMode } from "../lib/orderMode";
import { getImageMapping, getQrCategories, getQrMenuItems, getSingleProductImageBinary } from "../services/menu.service";
import { getPackageHeaders } from "../services/package.service";
import { getPublicSettings, isChefSpecialActive, chefSpecialIds } from "../services/settings.service";
import { checkTableOrders } from "../services/payment.service";

// ————————————————————————————————————————————————
// Constants
const COMMON_IMAGE =
  import.meta?.env?.VITE_MENU_IMG ||
  "https://res.cloudinary.com/danoolbdz/image/upload/v1766755726/no-image-icon-23500_j6y6gn.jpg";
const MENU_CATEGORY_LAYOUT = import.meta?.env?.VITE_MENU_CATEGORY_LAYOUT || "drilldown";
const USE_VERTICAL_CATEGORY_NAV = MENU_CATEGORY_LAYOUT !== "legacy";

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

function mapRowToItem(row, lang = "en") {
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

  // Get Cloudinary URL and thumbnail from API response (if available)
  const cloudinaryUrl = row.cloudinaryUrl || null;
  const thumbnailUrl = row.thumbnailUrl || null;
  
  // Prefer Cloudinary URL, then fallback to other image sources
  const primaryImage = cloudinaryUrl || normalizeImage(row.image ?? row.DocImage ?? row.ImageLocation ?? normalizedImages[0] ?? null);

  // Use Arabic name if language is Arabic and DescriptionArabic is available
  // Check multiple possible field names: name_ar, DescriptionArabic, pm.DescriptionArabic, pm_DescriptionArabic
  const arabicName = row.name_ar || 
                     row.DescriptionArabic || 
                     row["pm.DescriptionArabic"] || 
                     row["pm_DescriptionArabic"] || 
                     null;
  
  const hasArabicName = arabicName && typeof arabicName === "string" && arabicName.trim() !== "";
  
  // Use ShortDescription for menu display (prefer ShortDescription over Description)
  const shortDesc = row["pm.ShortDescription"] ?? row["pm_ShortDescription"] ?? row.ShortDescription ?? null;
  const shortDescAr = row["pm.ShortDescriptionArabic"] ?? row["pm_ShortDescriptionArabic"] ?? row.ShortDescriptionArabic ?? null;
  const hasShortDescAr = shortDescAr && typeof shortDescAr === "string" && shortDescAr.trim() !== "";
  
  const itemName = (lang === "ar" && hasShortDescAr)
    ? shortDescAr.trim()
    : (lang === "ar" && hasArabicName)
    ? arabicName.trim()
    : (shortDesc && typeof shortDesc === "string" && shortDesc.trim() !== "")
    ? shortDesc.trim()
    : (row.name ?? row.Description ?? row["pm.Description"] ?? row["pm_Description"] ?? "Untitled");

  // Optimized: Removed debug logging for performance

  // Get FullDescription for item modal (prefer FullDescription over Specification/ShortDescription)
  const fullDescAr = row["pm.FullDescriptionArabic"] ?? row["pm_FullDescriptionArabic"] ?? row.FullDescriptionArabic ?? null;
  const hasFullDescAr = fullDescAr && typeof fullDescAr === "string" && fullDescAr.trim() !== "";
  const fullDesc = row["pm.FullDescription"] ?? row["pm_FullDescription"] ?? row.FullDescription ?? null;
  const hasFullDesc = fullDesc && typeof fullDesc === "string" && fullDesc.trim() !== "";
  
  // Fallback to Specification if FullDescription is not available
  const specAr = row["pm.SpecificationArabic"] ?? row["pm_SpecificationArabic"] ?? row.SpecificationArabic ?? null;
  const hasSpecAr = specAr && typeof specAr === "string" && specAr.trim() !== "";
  const spec = row["pm.Specification"] ?? row["pm_Specification"] ?? row.Specification ?? null;
  const hasSpec = spec && typeof spec === "string" && spec.trim() !== "";
  
  // Use FullDescription if available, otherwise fallback to Specification
  const itemDescription = (lang === "ar" && hasFullDescAr)
    ? fullDescAr.trim()
    : (lang === "ar" && hasSpecAr)
    ? specAr.trim()
    : (hasFullDesc)
    ? fullDesc.trim()
    : (hasSpec)
    ? spec.trim()
    : "";

  return {
    id: row.id ?? row.product_id ?? row.ID ?? row["pm.ProductID"] ?? row["pm_ProductID"] ?? row["pm.ProductID"],
    name: itemName,
    desc: itemDescription, // Use FullDescription (or Specification as fallback) instead of ShortDescription
    img: primaryImage || null,
    thumbnailUrl: thumbnailUrl || null, // Blur-up placeholder (loads instantly)
    images: normalizedImages.length > 0 ? normalizedImages : [],
    price: calculatedPrice,
    category: row.group_name ?? row.group_code ?? "",
    categoryId: row.group_id ?? row.GroupID ?? row["pm.GroupID"] ?? row["pm_GroupID"] ?? null,
    _raw: row
  };
}

/**
 * Chef's Special of the Week — dark spotlight banner shown above the menu.
 * Config comes from admin settings (title/tagline/dates). The dishes render as
 * standard ItemCards, so ordering (quantity stepper, modifiers, cart) works
 * exactly like anywhere else on the menu.
 */
function ChefSpecialBanner({ items, config, lang, canOrder, onOpen }) {
  // Same quick-add wiring as MenuGrid, so the cards order identically
  const add = useCart((s) => s.add);
  if (!items?.length || !config) return null;
  const title = lang === "ar" && config.titleAr ? config.titleAr : config.title;
  const tagline =
    (lang === "ar" && config.subtitleAr ? config.subtitleAr : config.subtitle) ||
    (items.length === 1 ? items[0].desc : "");

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6">
      <div
        className="relative overflow-hidden rounded-[24px] shadow-[0_18px_40px_rgba(23,19,15,0.35)]"
        style={{ background: "linear-gradient(135deg, #17130f 0%, #241b12 55%, #17130f 100%)" }}
      >
        {/* thin gold frame, echoes the poster look */}
        <div className="pointer-events-none absolute inset-[10px] z-30 rounded-[16px] border border-[#C9A45C]/35" />

        <div className="relative z-20 px-5 pt-6 sm:px-8 sm:pt-7">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[#C9A45C] sm:text-[11px]">
            <Icon name="star" className="h-3.5 w-3.5" />
            {title}
          </p>
          {tagline && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/65 line-clamp-2 sm:text-sm">
              {tagline}
            </p>
          )}
        </div>

        <div className="relative z-20 flex gap-3 overflow-x-auto px-5 pb-6 pt-4 sm:gap-4 sm:px-8 sm:pb-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => (
            <div
              key={item.id}
              className={`${items.length === 1 ? "w-[270px] sm:w-[310px]" : "w-[235px] sm:w-[265px]"} shrink-0`}
            >
              <ItemCard
                item={item}
                onOpen={onOpen}
                onQuickAdd={(prod, selectedMods) => add(prod, selectedMods)}
                canOrder={canOrder}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
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

function categoryName(entity, lang, fallback) {
  if (lang === "ar" && entity?.name_ar && entity.name_ar.trim()) {
    return entity.name_ar.trim();
  }
  return (
    entity?.name ||
    entity?.GroupDescription ||
    entity?.MainGroupDescription ||
    entity?.SubgroupDescription ||
    fallback
  );
}

// Sort by explicit SortOrder first (> 0), then unordered (= 0/null) alphabetically.
// This ensures SortOrder=1 beats SortOrder=0 (which means "unset"), with name as tiebreaker.
function sortByOrder(items, nameKey) {
  const ordered = items.filter((i) => i.sortOrder > 0);
  const unordered = items.filter((i) => !(i.sortOrder > 0));
  ordered.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(a[nameKey] || "").localeCompare(String(b[nameKey] || ""));
  });
  unordered.sort((a, b) =>
    String(a[nameKey] || "").localeCompare(String(b[nameKey] || ""))
  );
  return [...ordered, ...unordered];
}

function buildTopLevelCategories(groups, lang) {
  const mainGroups = groups.filter((category) => {
    return category.type === "mainGroup" || category.mainGroupId;
  });
  const categoriesToShow = mainGroups.length > 0 ? mainGroups : groups;
  const sorted = sortByOrder(categoriesToShow, "name");

  return sorted.map((category) => {
    const isMainGroup = category.type === "mainGroup" || (category.mainGroupId && Array.isArray(category.groups));
    return {
      id: isMainGroup ? `main_group_${category.mainGroupId}` : `group_${category.groupId}`,
      name: categoryName(category, lang, `Group ${category.groupId || category.mainGroupId}`),
      type: isMainGroup ? "mainGroup" : "group",
      mainGroupId: category.mainGroupId,
      groupId: category.groupId,
      sortOrder: category.sortOrder,
      hasGroups: isMainGroup && category.groups && Array.isArray(category.groups) && category.groups.length > 0,
      hasSubgroups: category.subgroups && Array.isArray(category.subgroups) && category.subgroups.length > 0
    };
  });
}

function buildGroupCategories(groups, mainGroupId, lang) {
  const mainGroup = groups.find((category) => String(category.mainGroupId) === String(mainGroupId));
  if (!mainGroup?.groups || !Array.isArray(mainGroup.groups)) return [];
  const sorted = sortByOrder(mainGroup.groups, "name");
  return sorted.map((group) => ({
    id: `group_${group.groupId}`,
    name: categoryName(group, lang, `Group ${group.groupId}`),
    type: "group",
    mainGroupId,
    groupId: group.groupId,
    sortOrder: group.sortOrder,
    hasSubgroups: group.subgroups && Array.isArray(group.subgroups) && group.subgroups.length > 0
  }));
}

function buildSubgroupCategories(group, lang) {
  if (!group?.subgroups || !Array.isArray(group.subgroups)) return [];
  const sorted = sortByOrder(group.subgroups, "name");
  return sorted.map((subgroup) => {
    const subgroupName = categoryName(subgroup, lang, `Subgroup ${subgroup.subgroupId}`);
    return {
      id: `subgroup_${subgroup.subgroupId}`,
      name: subgroupName,
      type: "subgroup",
      subgroupId: subgroup.subgroupId,
      groupId: group.groupId,
      sortOrder: subgroup.sortOrder,
      isPackage: subgroupName.toLowerCase().includes("package")
    };
  });
}

function findGroupById(groups, groupId) {
  const allGroups = groups.flatMap((category) =>
    category.groups && Array.isArray(category.groups) ? category.groups : [category]
  );
  return allGroups.find((group) => String(group.groupId) === String(groupId));
}

export default function MenuPage() {
  const add = useCart((s) => s.add);
  const syncExistingOrderLines = useCart((s) => s.syncExistingOrderLines);
  const tableId = useCart((s) => s.tableId);
  const tableArea = useCart((s) => s.tableArea);
  const tableNo = useCart((s) => s.tableNo);
  const tableName = useCart((s) => s.tableName);
  const token = useCart((s) => s.token);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const lang = useUI((s) => s.lang);
  const linkDetailsLoggedRef = useRef(false);

  // Ordering (add-to-cart + send-to-kitchen) is controlled by the admin setting
  // (OrderingEnabled) and applies to ALL tables. The ?order=1 URL flag still
  // works as a per-tab test override. When ordering is off, customers can only
  // browse the menu + view their bill.
  const [orderingEnabled, setOrderingEnabled] = useState(false);
  const urlOrderOverride = useMemo(() => isOrderMode(), []);
  const orderMode = orderingEnabled || urlOrderOverride;

  // Chef's Special of the Week (admin-configured featured dishes)
  const [chefSpecial, setChefSpecial] = useState(null);        // active config or null
  const [chefSpecialRows, setChefSpecialRows] = useState([]);  // raw dish rows from API

  // Fetch the admin settings once on mount (ordering switch + chef's special).
  useEffect(() => {
    let active = true;
    getPublicSettings().then((s) => {
      if (!active) return;
      setOrderingEnabled(!!s.orderingEnabled);
      setChefSpecial(isChefSpecialActive(s.chefSpecial) ? s.chefSpecial : null);
    });
    return () => { active = false; };
  }, []);

  // Load the featured dish rows. Dishes no longer on the menu are simply
  // skipped — the banner renders whatever is still available.
  const specialIds = chefSpecialIds(chefSpecial);
  const specialIdsKey = specialIds.join(",");
  useEffect(() => {
    let active = true;
    if (!specialIdsKey) {
      setChefSpecialRows([]);
      return;
    }
    const ids = specialIdsKey.split(",");
    getQrMenuItems({ productIds: ids, pageSize: ids.length })
      .then((res) => { if (active) setChefSpecialRows(res?.data || []); })
      .catch(() => { if (active) setChefSpecialRows([]); });
    return () => { active = false; };
  }, [specialIdsKey]);

  // Dev: show full link details in console when this page is opened from generated link (menu view)
  useEffect(() => {
    if (linkDetailsLoggedRef.current || !token) return;
    linkDetailsLoggedRef.current = true;
    if (typeof window !== "undefined") {
      log("[Link details]", {
        url: window.location.href,
        token,
        tableId: tableId ?? null,
        tableNo: tableNo ?? null,
        tableName: tableName ?? null,
        area: tableArea ?? null,
      });
    }
  }, [token, tableId, tableArea, tableNo, tableName]);

  // 🔍 DEBUG: Log language changes
  useEffect(() => {
    // Optimized: Removed debug logging
  }, [lang]);

  // UI state
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState(""); // will set after categories load
  const [sort, setSort] = useState("pop");
  const [selectedMainGroupId, setSelectedMainGroupId] = useState(null); // Track selected main group in drill-down view
  const [selectedGroupId, setSelectedGroupId] = useState(null); // Track selected group for showing subgroups
  const [qrGroups, setQrGroups] = useState([]); // Store full QR groups structure with subgroups
  const [isPackageSubgroup, setIsPackageSubgroup] = useState(false); // Track if viewing packages subgroup
  const [packageHeaders, setPackageHeaders] = useState([]); // Store package headers when viewing packages

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
  const [ongoingOrderStats, setOngoingOrderStats] = useState({ lines: 0, qty: 0 });
  const [checkingOrders, setCheckingOrders] = useState(false);
  const checkingOrdersRef = useRef(false); // Prevent duplicate simultaneous calls
  const loadingCategoriesRef = useRef(false); // Prevent duplicate getCategories calls

  const topLevelCats = useMemo(() => buildTopLevelCategories(qrGroups, lang), [qrGroups, lang]);

  // Mapped Chef's Special items in the admin's pick order (same shape as grid
  // items, so ItemModal + add-to-cart work exactly like any other dish)
  const chefSpecialItems = useMemo(() => {
    if (chefSpecialRows.length === 0) return [];
    const mapped = chefSpecialRows.map((row) => mapRowToItem(row, lang));
    const order = specialIdsKey.split(",");
    return order
      .map((id) => mapped.find((it) => String(it.id) === String(id)))
      .filter(Boolean);
  }, [chefSpecialRows, lang, specialIdsKey]);

  // Tag the featured dishes inside the normal grid so their cards show a badge too
  const displayItems = useMemo(() => {
    if (!specialIdsKey) return items;
    const idSet = new Set(specialIdsKey.split(","));
    const badgeTitle = lang === "ar" && chefSpecial?.titleAr ? chefSpecial.titleAr : chefSpecial?.title;
    return items.map((it) =>
      idSet.has(String(it.id)) ? { ...it, isChefSpecial: true, chefSpecialTitle: badgeTitle } : it
    );
  }, [items, chefSpecial, specialIdsKey, lang]);

  // Check for ongoing orders when token/tableId is available
  const checkOrders = useCallback(async () => {
    if (!token) {
      setHasOngoingOrders(false);
      setOngoingOrderStats({ lines: 0, qty: 0 });
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
      const lines = result.lines || [];
      const totalQty = lines.reduce((sum, line) => sum + Number(line?.Qty || 0), 0);
      setOngoingOrderStats({ lines: lines.length, qty: totalQty });
      syncExistingOrderLines(lines);
    } catch (e) {
      logError("Error checking table orders:", e);
      setHasOngoingOrders(false);
      setOngoingOrderStats({ lines: 0, qty: 0 });
      syncExistingOrderLines([]);
    } finally {
      setCheckingOrders(false);
      checkingOrdersRef.current = false;
    }
  }, [token, syncExistingOrderLines]);

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
        const raw = await getQrCategories();
        if (!raw || !Array.isArray(raw)) {
          throw new Error("Invalid response from API: expected array of groups");
        }
        
        if (raw.length === 0) {
          setCats([]);
          setQrGroups([]);
          setError("No QR menu groups found. Please create groups in the management page.");
          return;
        }
        // Store full structure
        setQrGroups(raw);
        
        // Initially show main groups and standalone groups (top level)
        // Use Arabic name if language is Arabic and name_ar is available
        const groupsOnly = buildTopLevelCategories(raw, lang);
        
        // Optimized: Removed debug logging
        setCats(groupsOnly);
        
        // Check if we should return to packages subgroup
        const returnToSubgroup = sessionStorage.getItem('returnToSubgroup');
        const returnToPackages = sessionStorage.getItem('returnToPackages');
        
        if (returnToPackages === 'true' && returnToSubgroup) {
          // Clear the flags
          sessionStorage.removeItem('returnToSubgroup');
          sessionStorage.removeItem('returnToPackages');
          
          // Find the group that contains this subgroup
          const allGroupsForReturn = raw.flatMap((category) =>
            category.groups && Array.isArray(category.groups) ? category.groups : [category]
          );
          const groupWithSubgroup = allGroupsForReturn.find(g =>
            g.subgroups && g.subgroups.some(sg => String(sg.subgroupId) === String(returnToSubgroup))
          );
          
          if (groupWithSubgroup) {
            // Optimized: Removed debug logging
            const subgroup = groupWithSubgroup.subgroups.find(sg => String(sg.subgroupId) === String(returnToSubgroup));
            
            // Set the subgroup as active
            setSelectedGroupId(groupWithSubgroup.groupId);
            
            // Show subgroups for this group
            // Use Arabic name if language is Arabic and name_ar is available
            const subgroupTabs = sortByOrder(groupWithSubgroup.subgroups, "name").map(sg => ({
              id: `subgroup_${sg.subgroupId}`,
              name: (lang === "ar" && sg.name_ar && sg.name_ar.trim())
                ? sg.name_ar.trim()
                : (sg.name || sg.SubgroupDescription || `Subgroup ${sg.subgroupId}`),
              type: 'subgroup',
              subgroupId: sg.subgroupId,
              sortOrder: sg.sortOrder,
              isPackage: sg.name?.toLowerCase().includes('package') || sg.SubgroupDescription?.toLowerCase().includes('package')
            }));
            setCats(subgroupTabs);
            
            // Set the packages subgroup as active
            const packagesSubgroupId = `subgroup_${returnToSubgroup}`;
            setActiveCat(packagesSubgroupId);
            setIsPackageSubgroup(true);
            
            // loadItems will be triggered by the useEffect and will automatically load package headers
          } else {
            // Fallback to first group
            if (groupsOnly.length > 0) {
              const firstGroupId = groupsOnly[0].id;
              setActiveCat(USE_VERTICAL_CATEGORY_NAV ? "" : firstGroupId);
              // Don't set selectedGroupId on initial load - only set it when user clicks
              // This prevents auto-expanding to subgroups on initial load
              setSelectedMainGroupId(null);
              setSelectedGroupId(null);
            }
          }
        } else if (groupsOnly.length > 0) {
          const firstGroupId = groupsOnly[0].id;
          setActiveCat(USE_VERTICAL_CATEGORY_NAV ? "" : firstGroupId);
          setSelectedMainGroupId(null);
          setSelectedGroupId(null);
        }
      } catch (e) {
        logError("❌ Error loading QR categories:", e);
        logError("❌ Error details:", {
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

  // Update category names when language changes
  useEffect(() => {
    if (qrGroups.length === 0) return;
    
    if (USE_VERTICAL_CATEGORY_NAV && selectedGroupId !== null) {
      const group = findGroupById(qrGroups, selectedGroupId);
      setCats(buildSubgroupCategories(group, lang));
      return;
    }

    if (USE_VERTICAL_CATEGORY_NAV && selectedMainGroupId !== null) {
      setCats(buildGroupCategories(qrGroups, selectedMainGroupId, lang));
      return;
    }

    if (selectedGroupId !== null) {
      const group = findGroupById(qrGroups, selectedGroupId);
      const subgroups = buildSubgroupCategories(group, lang);
      if (subgroups.length > 0) {
        setCats(subgroups);
      }
      return;
    }

    setCats(buildTopLevelCategories(qrGroups, lang));
  }, [lang, qrGroups, selectedMainGroupId, selectedGroupId]);

  // Handle category selection - show subgroups if group has them, otherwise show products
  const handleCategoryChange = useCallback((categoryId) => {
    if (!categoryId) {
      setSelectedMainGroupId(null);
      setSelectedGroupId(null);
      setActiveCat("");
      setCats(buildTopLevelCategories(qrGroups, lang));
      setItems([]);
      setLoading(false);
      return;
    }

    if (USE_VERTICAL_CATEGORY_NAV) {
      if (activeCat !== categoryId) {
        setItems([]);
      }
      setIsPackageSubgroup(false);
      setPackageHeaders([]);

      if (categoryId.startsWith('main_group_')) {
        const mainGroupId = categoryId.replace('main_group_', '');
        const childGroups = buildGroupCategories(qrGroups, mainGroupId, lang);

        // Single child group: skip this level, drill straight into it
        if (childGroups.length === 1) {
          setSelectedMainGroupId(mainGroupId);
          handleCategoryChange(childGroups[0].id);
          return;
        }

        if (childGroups.length > 0) {
          setSelectedMainGroupId(mainGroupId);
          setSelectedGroupId(null);
          setCats(childGroups);
          setActiveCat("");
          setLoading(false);
          return;
        }

        setSelectedMainGroupId(null);
        setSelectedGroupId(null);
        setActiveCat(categoryId);
        setLoading(true);
        return;
      }

      if (categoryId.startsWith('group_')) {
        const groupId = categoryId.replace('group_', '');
        const group = findGroupById(qrGroups, groupId);
        const subgroups = buildSubgroupCategories(group, lang);

        if (subgroups.length > 0) {
          setSelectedGroupId(group?.groupId ?? parseInt(groupId));
          setCats(subgroups);
          // Single subgroup: auto-open it instead of showing a one-chip list
          if (subgroups.length === 1) {
            if (activeCat !== subgroups[0].id) {
              setItems([]);
            }
            setActiveCat(subgroups[0].id);
            setLoading(true);
          } else {
            setActiveCat("");
            setLoading(false);
          }
          return;
        }

        setSelectedGroupId(null);
        setActiveCat(categoryId);
        setLoading(true);
        return;
      }

      if (categoryId.startsWith('subgroup_')) {
        setActiveCat(categoryId);
        setLoading(true);
        return;
      }
    }

    if (categoryId.startsWith('main_group_')) {
      if (activeCat !== categoryId) {
        setItems([]);
        setLoading(true);
      }
      setSelectedMainGroupId(null);
      setSelectedGroupId(null);
      setIsPackageSubgroup(false);
      setPackageHeaders([]);
      setActiveCat(categoryId);
    } else if (categoryId.startsWith('group_')) {
      const groupIdStr = categoryId.replace('group_', '');
      const groupId = parseInt(groupIdStr);
      const allGroups = qrGroups.flatMap((category) =>
        category.groups && Array.isArray(category.groups) ? category.groups : [category]
      );
      const group = allGroups.find(g => {
        const gId = typeof g.groupId === 'number' ? g.groupId : parseInt(g.groupId);
        return gId === groupId;
      });
      const isCurrentlyShowingSubgroups = selectedGroupId === groupId && cats.some(c => c.type === 'subgroup');
      if (group && group.subgroups && Array.isArray(group.subgroups) && group.subgroups.length > 0) {
        if (isCurrentlyShowingSubgroups) return;
        setSelectedMainGroupId(null);
        setSelectedGroupId(groupId);
        
        // Use Arabic name if language is Arabic and name_ar is available
        const subgroups = sortByOrder(group.subgroups, "name").map((subgroup) => ({
          id: `subgroup_${subgroup.subgroupId}`,
          name: (lang === "ar" && subgroup.name_ar && subgroup.name_ar.trim())
            ? subgroup.name_ar.trim()
            : (subgroup.name || subgroup.SubgroupDescription || `Subgroup ${subgroup.subgroupId}`),
          type: 'subgroup',
          subgroupId: subgroup.subgroupId,
          groupId: groupId,
          isPackage: (subgroup.name || subgroup.SubgroupDescription || '').toLowerCase().includes('package')
        }));
        // Set subgroups - they will be visible in CategoryTabs
        setCats(subgroups);
        // Auto-select first subgroup so products/packages load immediately
        if (subgroups.length > 0) {
          // Clear items immediately when switching to subgroups
          if (activeCat !== subgroups[0].id) {
            setItems([]);
            setLoading(true);
          }
          setActiveCat(subgroups[0].id);
        } else {
          setActiveCat("");
        }
      } else {
        // Group has no subgroups, show products directly
        setSelectedMainGroupId(null);
        setSelectedGroupId(null);
        // Clear items immediately when switching groups
        if (activeCat !== categoryId) {
          setItems([]);
          setLoading(true);
        }
        setActiveCat(categoryId);
      }
    } else if (categoryId.startsWith('subgroup_')) {
      // Subgroup selected, show products
      // Clear items immediately when switching subgroups
      if (activeCat !== categoryId) {
        setItems([]);
        setLoading(true);
      }
      setActiveCat(categoryId);
    }
  }, [activeCat, qrGroups, lang, selectedGroupId, cats]);

  // Handle back navigation - go back to groups
  const handleBackToGroups = useCallback(() => {
    if (USE_VERTICAL_CATEGORY_NAV && selectedMainGroupId !== null && (selectedGroupId !== null || activeCat)) {
      const parentGroups = buildGroupCategories(qrGroups, selectedMainGroupId, lang);
      // Level was skipped on the way in (single child group) — skip it going back too
      if (parentGroups.length === 1) {
        setCats(buildTopLevelCategories(qrGroups, lang));
        setSelectedMainGroupId(null);
        setSelectedGroupId(null);
        setActiveCat("");
        setItems([]);
        setIsPackageSubgroup(false);
        setPackageHeaders([]);
        setLoading(false);
        return;
      }
      setCats(parentGroups);
      setSelectedGroupId(null);
      setActiveCat("");
      setItems([]);
      setIsPackageSubgroup(false);
      setPackageHeaders([]);
      setLoading(false);
      return;
    }

    if (USE_VERTICAL_CATEGORY_NAV) {
      setCats(buildTopLevelCategories(qrGroups, lang));
      setSelectedMainGroupId(null);
      setSelectedGroupId(null);
      setActiveCat("");
      setItems([]);
      setIsPackageSubgroup(false);
      setPackageHeaders([]);
      setLoading(false);
      return;
    }

    // Use Arabic name if language is Arabic and name_ar is available
    const groupsOnly = buildTopLevelCategories(qrGroups, lang);
    setCats(groupsOnly);
    setSelectedMainGroupId(null);
    setSelectedGroupId(null);
    setActiveCat(groupsOnly.length > 0 ? groupsOnly[0].id : "");
  }, [activeCat, qrGroups, lang, selectedMainGroupId, selectedGroupId]);

  // 2) Fetch QR menu items with filters
  async function loadItems(page = 1) {
    // Prevent multiple simultaneous calls for the SAME page/category
    // But allow different categories/pages to load
    const currentCategory = activeCat || (search.trim().length > 0 ? `search_${search.trim()}` : null);
    const loadKey = `${currentCategory}-${page}`;
    
    // SIMPLIFIED GUARD: Only block if we're currently loading AND it's the same key
    // Allow if not loading or if it's a different category/page
    const isDuplicate = isLoadingItemsRef.current && lastLoadKeyRef.current === loadKey;
    if (isDuplicate) {
      return; // Skip duplicate requests
    }
    
    try {
      isLoadingItemsRef.current = true;
      lastLoadKeyRef.current = loadKey;
      
      // Only show loading spinner on initial category load (when items array is empty)
      // Don't show loading when paginating or when items already exist
      // Show loading immediately for page 1 (new category) or if no items
      const shouldShowLoading = page === 1;
      if (shouldShowLoading) {
        setLoading(true);
      }
      setError("");
      const trimmedSearch = search.trim();
      const searching = trimmedSearch.length > 0;
      
      // Parse activeCat to determine if it's a group or subgroup
      let qrMainGroupId = null;
      let qrGroupId = null;
      let qrSubgroupId = null;
      
      if (!searching && activeCat) {
        // Check if activeCat is a main group, subgroup, or group
        if (activeCat.startsWith('main_group_')) {
          qrMainGroupId = parseInt(activeCat.replace('main_group_', ''));
          setIsPackageSubgroup(false);
          setPackageHeaders([]);
        } else if (activeCat.startsWith('subgroup_')) {
          qrSubgroupId = parseInt(activeCat.replace('subgroup_', ''));
          
          // Check if this is a PACKAGES subgroup
          const currentSubgroup = cats.find(c => c.id === activeCat);
          const subgroupName = currentSubgroup?.name || '';
          const isPackages = currentSubgroup?.isPackage || 
                            subgroupName.toLowerCase().includes('package') ||
                            subgroupName.toLowerCase().includes('packages');
          
          if (isPackages) {
            // Load package headers instead of regular products
            setIsPackageSubgroup(true);
            try {
              const packages = await getPackageHeaders(qrSubgroupId);
              setPackageHeaders(packages || []);
              setItems([]);
              setPaging({ page: 1, pageSize: 24, total: packages.length });
              setLoading(false);
              isLoadingItemsRef.current = false;
              return;
            } catch (error) {
              setIsPackageSubgroup(false);
              setPackageHeaders([]);
            }
          } else {
            setIsPackageSubgroup(false);
            setPackageHeaders([]);
          }
        } else if (activeCat.startsWith('group_')) {
          const groupId = parseInt(activeCat.replace('group_', ''));
          qrGroupId = groupId;
          setIsPackageSubgroup(false);
          setPackageHeaders([]);
        }
      } else if (searching) {
        setIsPackageSubgroup(false);
        setPackageHeaders([]);
      } else {
        setIsPackageSubgroup(false);
        setPackageHeaders([]);
      }
      
      // Load QR menu items (optimized for speed)
      const res = await getQrMenuItems({
        page,
        pageSize: paging.pageSize,
        search: trimmedSearch || undefined,
        qrMainGroupId: qrMainGroupId || undefined,
        qrGroupId: qrGroupId || undefined,
        qrSubgroupId: qrSubgroupId || undefined,
        sort: toApiSort(sort)
      });
      
      const mappedItems = res.data.map((row) => mapRowToItem(row, lang));
      // Defensive filter: Ensure RAW MATERIAL products are never displayed (even if backend filter fails)
      // Filter out any products that might have ProductType = 'RAW MATERIAL' or similar
      // Include packages (IsPackageHeader = 1) - they will be displayed using PackageCard in MenuGrid
      let filteredItems = mappedItems.filter((item) => {
        // Filter by ProductType
        const productType = item._raw?.["pm.ProductType"] || item._raw?.ProductType;
        if (!productType) return true; // Allow NULL/undefined (backwards compatibility)
        const normalizedType = String(productType).trim().toUpperCase();
        return normalizedType === 'NORMAL'; // Only show Normal products (packages can have ProductType = 'NORMAL' too)
      });
      
      // Clear loading and loaded sets ONLY when category changes (not on pagination)
      const currentCategory = activeCat || (searching ? `search_${trimmedSearch}` : null);
      const categoryChanged = previousActiveCatRef.current !== currentCategory;
      
      if (categoryChanged) {
        loadingImagesRef.current.clear();
        // Keep loadedImagesRef - do NOT clear. Prevents re-fetching images when user returns to a category.
        previousActiveCatRef.current = currentCategory;
      }
      
      // 🚀 INSTANT LOADING: Items already have cloudinaryUrl and thumbnailUrl from API response
      // Use requestAnimationFrame for smooth, instant updates
      requestAnimationFrame(() => {
        // For page 1, always replace items (new category)
        if (page === 1) {
          setItems(filteredItems);
        } else if (filteredItems.length > 0) {
          setItems(filteredItems);
        }
        setPaging(res.paging);
        setLoading(false);
        
        // Preload images immediately after render
        if (filteredItems.length > 0) {
          requestAnimationFrame(() => {
            preloadVisibleImages(filteredItems);
          });
        }
      });
      
      // Return paging info so caller can decide if page 2 should be preloaded
      return { paging: res.paging, items: filteredItems };
      
      // NO CACHE - images are not cached to prevent memory issues
      // Images will load on-demand via Intersection Observer only
      // Previous items with images are automatically garbage collected by React
    } catch (e) {
      logError("❌ Error in loadItems:", e);
      setError(e?.response?.data?.error || e.message || "Failed to load items");
      // Don't clear items on error - keep existing items visible
      // setItems([]); // Commented out - don't clear items on error
      setPaging((p) => ({ ...p, total: 0 }));
      setLoading(false);
    } finally {
      // Always reset the loading flag, even on error
      isLoadingItemsRef.current = false;
      // Don't clear lastLoadKeyRef immediately - keep it briefly to prevent rapid duplicate calls
      // It will be cleared when a new category is selected (via lastTriggerRef)
      setTimeout(() => {
        lastLoadKeyRef.current = null;
      }, 300);
    }
  }

  // NO IMAGE CACHING - Base64 images are too large, cause "Out of Memory" errors
  // Only cache which products have images (lightweight), not the images themselves
  const imageMappingRef = useRef({});
  
  // 🚀 INSTANT LOADING: Preload images for visible items (optimized for speed)
  // Uses <link rel="preload"> for critical images - browser loads them immediately
  const preloadVisibleImages = useCallback((items) => {
    if (!items || items.length === 0) return;
    
    // Preload first 12 items (above the fold) - optimized for instant display
    const itemsToPreload = items.slice(0, 12);
    
    // Batch DOM operations for better performance
    const fragment = document.createDocumentFragment();
    const existingUrls = new Set();
    
    // Collect existing preload links
    document.head.querySelectorAll('link[rel="preload"][as="image"]').forEach(link => {
      existingUrls.add(link.href);
    });
    
    itemsToPreload.forEach((item, index) => {
      // Preload thumbnail first (instant blur placeholder) - HIGHEST PRIORITY
      if (item.thumbnailUrl && !existingUrls.has(item.thumbnailUrl)) {
        const linkThumb = document.createElement('link');
        linkThumb.rel = 'preload';
        linkThumb.as = 'image';
        linkThumb.href = item.thumbnailUrl;
        linkThumb.fetchPriority = 'high';
        fragment.appendChild(linkThumb);
        existingUrls.add(item.thumbnailUrl);
      }
      
      // Preload full image (first 6 get high priority, rest auto)
      if (item.img && item.img.startsWith('http') && !existingUrls.has(item.img)) {
        const linkFull = document.createElement('link');
        linkFull.rel = 'preload';
        linkFull.as = 'image';
        linkFull.href = item.img;
        linkFull.fetchPriority = index < 6 ? 'high' : 'auto';
        fragment.appendChild(linkFull);
        existingUrls.add(item.img);
      }
    });
    
    // Batch append all preload links at once
    if (fragment.children.length > 0) {
      document.head.appendChild(fragment);
    }
  }, []);
  
  // Track which images are currently loading to avoid duplicate requests
  const loadingImagesRef = useRef(new Set());
  // Track which images are already loaded
  const loadedImagesRef = useRef(new Set());
  // Track previous activeCat to detect category changes
  const previousActiveCatRef = useRef(null);
  // Prevent multiple simultaneous loadItems calls
  const isLoadingItemsRef = useRef(false);
  const lastLoadKeyRef = useRef(null);
  const lastTriggerRef = useRef(null);
  // Request queue to limit concurrent API requests (not needed for Cloudinary URLs)
  const imageQueueRef = useRef([]);
  const activeImageRequestsRef = useRef(0);
  const MAX_CONCURRENT_API_REQUESTS = 2; // Only for API fallback (Cloudinary URLs don't need this limit)

  // Load image mapping on mount (lightweight, fast) - OPTIMIZED: Load immediately, cache in localStorage
  useEffect(() => {
    // Try to load from cache first (instant)
    const cacheKey = 'imageMappingCache';
    const cacheTimestamp = 'imageMappingCacheTimestamp';
    const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes TTL - reduces API requests for image mapping
    
    try {
      const cached = localStorage.getItem(cacheKey);
      const cachedTime = localStorage.getItem(cacheTimestamp);
      
      if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < CACHE_DURATION) {
        const mapping = JSON.parse(cached);
        imageMappingRef.current = mapping;
        // Optimized: Removed debug logging
        
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
      
      // Optimized: Removed debug logging for performance
    }).catch(() => {
      // Silent fail - image mapping is optional
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
          // Optimized: Removed debug logging
          
          // Add cache busting parameter to force reload (especially important on mobile)
          const imageUrlWithCacheBust = cloudinaryUrl + (cloudinaryUrl.includes('?') ? '&' : '?') + `_t=${Date.now()}`;
          
          // Load instantly - no queue, no delay, no API call!
          loadedImagesRef.current.add(productId);
          updateItemImage(productId, { 
            image: imageUrlWithCacheBust, 
            images: [imageUrlWithCacheBust],
            type: 'cloudinary'
          });
        } else {
          // Optimized: Removed debug logging
        }
      } else {
        // Optimized: Removed debug logging
      }
    });
  }

  // Helper to get reliable viewport height (handles mobile address bar)
  const getViewportHeight = useCallback(() => {
    // Use visualViewport API if available (better for mobile)
    if (typeof window !== 'undefined' && window.visualViewport) {
      return window.visualViewport.height;
    }
    // Fallback to window.innerHeight
    return window.innerHeight || document.documentElement.clientHeight;
  }, []);

  // Detect if device is mobile/tablet
  const isMobileDevice = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768);
  }, []);

  // Intersection Observer for viewport-based loading (optimized for Cloudinary)
  const observerRef = useRef(null);
  const pendingItemsRef = useRef(new Map()); // Track items waiting to load
  const scrollTimeoutRef = useRef(null); // For scroll-based fallback on mobile

  useEffect(() => {
    // Disconnect previous observer to force re-observation when items change
    // This is critical when navigating back to a previously viewed group
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    // Mobile devices need larger rootMargin and different threshold
    const isMobile = isMobileDevice();
    const rootMargin = isMobile ? "400px" : "200px"; // Larger buffer for mobile
    const threshold = isMobile ? 0.001 : 0.01; // More aggressive on mobile
    
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
            // Don't unobserve immediately on mobile - keep observing for scroll changes
            if (!isMobile) {
              observerRef.current?.unobserve(entry.target);
            }
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
        rootMargin: rootMargin, // Larger buffer for mobile
        threshold: threshold, // More aggressive on mobile
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

    // OPTIMIZATION: Load above-the-fold images and observe cards
    // Use requestAnimationFrame to ensure DOM is ready after items change
    const loadAboveFoldImages = () => {
      const viewportHeight = getViewportHeight();
      const isMobile = isMobileDevice();
      const buffer = isMobile ? 600 : 300; // Larger buffer for mobile
      const cards = Array.from(document.querySelectorAll('[data-product-id]'));
      
      const aboveFoldItems = cards
        .filter(card => {
          const rect = card.getBoundingClientRect();
          return rect.top < viewportHeight + buffer; // Larger buffer for mobile
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
          // Use consistent productId extraction
          const productId = String(
            item._raw?.product_id || 
            item._raw?.["pm.ProductID"] || 
            item._raw?.["pm_ProductID"] ||
            item.product_id ||
            item.id
          );
          // Check if not already loaded AND item doesn't have a valid image yet
          // Explicitly check for null/empty to ensure images reload when category changes
          const hasImage = item.img && 
            item.img !== null &&
            item.img !== "" &&
            item.img !== COMMON_IMAGE && 
            (item.img.startsWith('http://') || item.img.startsWith('https://') || item.img.startsWith('data:') || item.img.startsWith('blob:'));
          const needsLoading = !loadedImagesRef.current.has(productId) && !hasImage;
          if (needsLoading) {
            // Optimized: Removed debug logging
          }
          return needsLoading;
        });

      if (aboveFoldItems.length > 0) {
        // Optimized: Removed debug logging
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

    // Use requestAnimationFrame to ensure DOM is updated before observing/loading
    // This is critical when switching back to a previously viewed group
    requestAnimationFrame(() => {
      observeCards();
      loadAboveFoldImages();
      
      // Also check ALL visible items (not just above fold) when coming back to a group
      // This ensures images load even if user scrolled down
      const viewportHeight = getViewportHeight();
      const isMobile = isMobileDevice();
      const buffer = isMobile ? 800 : 500;
      
      const allVisibleItems = Array.from(document.querySelectorAll('[data-product-id]'))
        .filter(card => {
          const rect = card.getBoundingClientRect();
          return rect.top < viewportHeight + buffer;
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
          const productId = String(
            item._raw?.product_id || 
            item._raw?.["pm.ProductID"] || 
            item._raw?.["pm_ProductID"] ||
            item.product_id ||
            item.id
          );
          // Explicitly check for null/empty to ensure images reload when category changes
          const hasImage = item.img && 
            item.img !== null &&
            item.img !== "" &&
            item.img !== COMMON_IMAGE && 
            (item.img.startsWith('http://') || item.img.startsWith('https://') || item.img.startsWith('data:') || item.img.startsWith('blob:'));
          return !loadedImagesRef.current.has(productId) && !hasImage;
        });
      
      if (allVisibleItems.length > 0) {
        // Optimized: Removed debug logging
        loadCloudinaryImagesBatch(allVisibleItems);
      }
      
      // Also observe after a delay to catch any late-rendered cards (longer on mobile)
      const observeDelay = isMobile ? 150 : 50;
      setTimeout(() => {
        observeCards();
        loadAboveFoldImages(); // Try again in case some cards weren't ready
      }, observeDelay);
    });
    
    const timeoutId = setTimeout(() => {
      observeCards();
    }, isMobileDevice() ? 200 : 100);

    // Add scroll event listener as fallback for mobile (Intersection Observer can be unreliable on mobile)
    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      scrollTimeoutRef.current = setTimeout(() => {
        const viewportHeight = getViewportHeight();
        const buffer = 600;
        const cards = Array.from(document.querySelectorAll('[data-product-id]'));
        
        const visibleItems = cards
          .filter(card => {
            const rect = card.getBoundingClientRect();
            return rect.top < viewportHeight + buffer && rect.bottom > -buffer;
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
            const productId = String(
              item._raw?.product_id || 
              item._raw?.["pm.ProductID"] || 
              item._raw?.["pm_ProductID"] ||
              item.product_id ||
              item.id
            );
            const hasImage = item.img && 
              item.img !== null &&
              item.img !== "" &&
              item.img !== COMMON_IMAGE && 
              (item.img.startsWith('http://') || item.img.startsWith('https://') || item.img.startsWith('data:') || item.img.startsWith('blob:'));
            return !loadedImagesRef.current.has(productId) && !hasImage;
          });
        
        if (visibleItems.length > 0) {
          // Optimized: Removed debug logging
          loadCloudinaryImagesBatch(visibleItems);
        }
      }, 100); // Debounce scroll events
    };

    // Only add scroll listener on mobile devices
    if (isMobileDevice()) {
      window.addEventListener('scroll', handleScroll, { passive: true });
      // Also listen to visualViewport resize (mobile address bar show/hide)
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleScroll);
      }
    }

    return () => {
      clearTimeout(timeoutId);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (isMobileDevice()) {
        window.removeEventListener('scroll', handleScroll);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleScroll);
        }
      }
    };
  }, [items, getViewportHeight, isMobileDevice]);

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
      // Optimized: Removed debug logging
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
        
        // Optimized: Removed debug logging
        
        // Cloudinary URL is already available - use it directly! 🚀
        updateItemImage(productId, { 
          image: cloudinaryUrl, 
          images: [cloudinaryUrl],
          type: 'cloudinary'
        });
        loadingImagesRef.current.delete(productId);
        return; // Done! No API call needed - image loads instantly from CDN
      } else {
        // Invalid URL format - will fallback to API
      }
    }

    // PRIORITY 2: Fallback to API call (for images not yet migrated or if Cloudinary URL missing)
    const apiStartTime = Date.now();
    try {
      const imageUrl = await getSingleProductImageBinary(productId, 1); // 1 retry
      const apiDuration = Date.now() - apiStartTime;
      
      if (imageUrl) {
        loadedImagesRef.current.add(productId);
        // Update the item immediately with binary image URL
        // Browser automatically caches binary images, much more efficient than base64
        updateItemImage(productId, { image: imageUrl, images: [imageUrl] });
      }
    } catch (error) {
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

  // Helper function to load images for visible cards
  const loadImagesForVisibleCards = useCallback((cards, itemsToUse, viewportHeight, buffer) => {
    const visibleItems = Array.from(cards)
      .filter(card => {
        const rect = card.getBoundingClientRect();
        return rect.top < viewportHeight + buffer && rect.bottom > -buffer;
      })
      .map(card => {
        const productId = card.dataset.productId;
        return itemsToUse.find(
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
        const productId = String(
          item._raw?.product_id || 
          item._raw?.["pm.ProductID"] || 
          item._raw?.["pm_ProductID"] ||
          item.product_id ||
          item.id
        );
        const hasImage = item.img && 
          item.img !== COMMON_IMAGE && 
          item.img !== null &&
          item.img !== "" &&
          (item.img.startsWith('http://') || item.img.startsWith('https://') || item.img.startsWith('data:') || item.img.startsWith('blob:'));
        return !loadedImagesRef.current.has(productId) && !hasImage;
      });
    
    if (visibleItems.length > 0) {
      // Optimized: Removed debug logging
      loadCloudinaryImagesBatch(visibleItems);
      
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
      
      apiFallbackItems.forEach(item => {
        if (!loadingImagesRef.current.has(String(item.id || item._raw?.product_id))) {
          imageQueueRef.current.push({ item, delay: 0 });
        }
      });
      
      processImageQueue();
    }
  }, []);

  // Force image loading for items that don't have images yet
  useEffect(() => {
    if (items.length === 0) return;
    
    // Check if any items need images loaded
    const itemsNeedingImages = items.filter(item => {
      const productId = String(
        item._raw?.product_id || 
        item._raw?.["pm.ProductID"] || 
        item._raw?.["pm_ProductID"] ||
        item.product_id ||
        item.id
      );
      
      if (!productId || loadedImagesRef.current.has(productId)) {
        return false;
      }
      
      // Check if item has no image or only placeholder
      const hasImage = item.img && 
        item.img !== COMMON_IMAGE && 
        item.img !== null &&
        item.img !== "" &&
        (item.img.startsWith('http://') || item.img.startsWith('https://') || item.img.startsWith('data:') || item.img.startsWith('blob:'));
      
      return !hasImage;
    });
    
    if (itemsNeedingImages.length > 0) {
      // Optimized: Removed debug logging
      
      // Load Cloudinary images immediately
      itemsNeedingImages.forEach(item => {
        const productId = String(
          item._raw?.product_id || 
          item._raw?.["pm.ProductID"] || 
          item._raw?.["pm_ProductID"] ||
          item.product_id ||
          item.id
        );
        
        const imageInfo = imageMappingRef.current[productId];
        
        // Try Cloudinary URL
        if (imageInfo && typeof imageInfo === 'object' && imageInfo.cloudinaryUrl) {
          const cloudinaryUrl = String(imageInfo.cloudinaryUrl).trim();
          
          if (cloudinaryUrl && 
              cloudinaryUrl !== "null" && 
              cloudinaryUrl !== "undefined" &&
              (cloudinaryUrl.startsWith('http://') || cloudinaryUrl.startsWith('https://'))) {
            loadedImagesRef.current.add(productId);
            updateItemImage(productId, { 
              image: cloudinaryUrl, 
              images: [cloudinaryUrl],
              type: 'cloudinary'
            });
            return;
          }
        }
        
        // Check if product has image (for API fallback)
        const hasImage = imageInfo === true || (imageInfo && typeof imageInfo === 'object' && imageInfo.hasImage);
        if (hasImage && !loadingImagesRef.current.has(productId)) {
          loadingImagesRef.current.add(productId);
          loadImageForItem(item, 0).catch(() => {
            loadingImagesRef.current.delete(productId);
          });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Reload items when language changes (to show Arabic names)
  useEffect(() => {
    if (activeCat && items.length > 0) {
      loadItems(1).catch(() => {}); // Silent fail
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // 3) Load on category/sort change (optimized for speed)
  useEffect(() => {
    // Prevent duplicate calls - use a ref to track the last trigger
    const currentTrigger = `${activeCat || ''}-${sort}-${search}-${lang}`;
    
    // Only trigger if this is a new category/sort/search/language combination
    if (lastTriggerRef.current === currentTrigger) {
      return; // Skip duplicate
    }
    
    // If category changed, clear items immediately to prevent showing old items
    const previousTrigger = lastTriggerRef.current || '';
    const previousCategory = previousTrigger.split('-')[0];
    const currentCategory = currentTrigger.split('-')[0];
    
    if (previousCategory && previousCategory !== currentCategory && previousCategory !== '' && currentCategory !== '') {
      setItems([]); // Clear items immediately when category changes
      setLoading(true); // Show loading state immediately
    }
    
    lastTriggerRef.current = currentTrigger;
    
    // Always load items when activeCat changes (if it's set)
    if (activeCat) {
      loadItems(1).then((result) => {
        // Preload next page in background (optimized - no delay)
        if (result?.paging && result.paging.total > result.paging.pageSize) {
          // Use requestIdleCallback for background preloading (doesn't block main thread)
          if (window.requestIdleCallback) {
            requestIdleCallback(() => {
              loadItems(2).catch(() => {}); // Silent fail
            }, { timeout: 2000 });
          } else {
            setTimeout(() => loadItems(2).catch(() => {}), 500); // Fallback
          }
        }
      }).catch(() => {}); // Silent fail - error state handled in loadItems
    } else if (search.trim().length > 0) {
      // Search mode - load items
      loadItems(1).catch(() => {}); // Silent fail
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCat, sort, search, lang]);

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

  const groupedSections = useMemo(() => {
    if (!activeCat?.startsWith("main_group_") || displayItems.length === 0) {
      return null;
    }

    const sectionMap = new Map();
    displayItems.forEach((item) => {
      const raw = item._raw || {};
      const groupId = raw["pm.QrGroupID"] || raw["pm_QrGroupID"] || raw.QrGroupID || "ungrouped";
      const groupName = (lang === "ar" && raw["pm.QrGroupDescriptionArabic"])
        ? raw["pm.QrGroupDescriptionArabic"]
        : (raw["pm.QrGroupDescription"] || raw.QrGroupDescription || "Other");
      const sortOrder = Number(raw["pm.QrGroupSortOrder"] ?? raw.QrGroupSortOrder ?? 0);

      if (!sectionMap.has(groupId)) {
        sectionMap.set(groupId, {
          id: groupId,
          title: groupName,
          sortOrder,
          items: [],
        });
      }
      sectionMap.get(groupId).items.push(item);
    });

    return Array.from(sectionMap.values()).sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return String(a.title).localeCompare(String(b.title));
    });
  }, [activeCat, displayItems, lang]);

  const handleGoToPayment = () => {
    if (token) {
      navigate(`/r/${token}`);
    }
  };

  const showVerticalCategoryList =
    USE_VERTICAL_CATEGORY_NAV &&
    search.trim().length === 0 &&
    cats.length > 0 &&
    !activeCat;
  const showVerticalBackButton =
    USE_VERTICAL_CATEGORY_NAV &&
    search.trim().length === 0 &&
    Boolean(activeCat);
  const verticalCategoryTitle =
    selectedGroupId !== null
      ? "Choose Subcategory"
      : selectedMainGroupId !== null
      ? "Select Category"
      : "Explore Our Menu";
  const verticalCategorySubtitle =
    selectedMainGroupId !== null || selectedGroupId !== null
      ? "Refine your selection"
      : "Delicious varieties";
  const tableDisplayLabel =
    tableNo !== null && tableNo !== undefined && String(tableNo).trim() !== ""
      ? t("common.table_label", { id: tableNo })
      : tableName || "";

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(120% 60% at 50% 0%, rgba(139,111,71,0.08), transparent 55%)",
        backgroundColor: "transparent",
      }}
    >
      <TopBar 
        onCart={() => setDrawer(true)} 
        onHome={() => handleCategoryChange(null)}
        isHome={!selectedMainGroupId && !selectedGroupId && !activeCat && search.trim() === ""}
        tableLabel={tableDisplayLabel}
      />
      
      {/* Payment/Billing Banner - Show when table has ongoing orders */}
      {hasOngoingOrders && token && (
        <div className="sticky top-[73px] z-30 mx-auto max-w-6xl px-4 sm:px-6 pt-4">
          <div className="rounded-xl border border-[rgba(139,111,71,0.25)] bg-[var(--grad-start-soft)] px-3 py-3 sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {tableDisplayLabel || "Your table"} already has a running order
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {ongoingOrderStats.qty > 0
                    ? `${ongoingOrderStats.qty} items already in order`
                    : `${ongoingOrderStats.lines} lines already in order`}
                </p>
              </div>
              <button
                onClick={handleGoToPayment}
                className="h-9 shrink-0 rounded-lg bg-[var(--text-primary)] px-4 text-xs font-semibold text-white transition hover:opacity-90 sm:h-10 sm:px-5 sm:text-sm"
              >
                View Bill
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="relative pb-24 pt-6">
        {/* Chef's Special of the Week — featured dish banner */}
        {chefSpecialItems.length > 0 && search.trim().length === 0 && (
          <ChefSpecialBanner
            items={chefSpecialItems}
            config={chefSpecial}
            lang={lang}
            canOrder={orderMode}
            onOpen={openModal}
          />
        )}

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
          {!USE_VERTICAL_CATEGORY_NAV && search.trim().length === 0 && cats.length > 0 && (
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

          {showVerticalCategoryList && (
            <MenuGroupList
              categories={cats}
              activeId={activeCat}
              onSelect={handleCategoryChange}
              onBack={handleBackToGroups}
              showBack={selectedMainGroupId !== null || selectedGroupId !== null}
              title={verticalCategoryTitle}
              subtitle={verticalCategorySubtitle}
              backLabel={selectedGroupId !== null ? "Back to Groups" : "Back to Main Groups"}
              tableLabel={tableDisplayLabel}
            />
          )}

          {showVerticalBackButton && (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={handleBackToGroups}
                className="group flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-gray-400 transition-colors hover:text-gray-900"
              >
                <Icon name="arrow-left" className="h-3 w-3 transition-transform group-hover:-translate-x-1" />
                {selectedGroupId !== null || selectedMainGroupId !== null ? "Back to Groups" : "Back to Main Groups"}
              </button>
              {tableDisplayLabel ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(184,134,11,0.25)] bg-[rgba(184,134,11,0.06)] px-3 py-1">
                  <Icon name="map-pin" className="h-3 w-3 text-[#B8860B]" />
                  <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#7A4E05]">{tableDisplayLabel}</span>
                </div>
              ) : null}
            </div>
          )}
          
          {/* Show message if no categories found */}
          {!loading && cats.length === 0 && search.trim().length === 0 && !error && (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-center text-gray-500">
              No menu categories found. Please create QR groups in the management page.
            </div>
          )}

      {(!USE_VERTICAL_CATEGORY_NAV || Boolean(activeCat) || search.trim().length > 0) && (
        <FilterBar sort={sort} onSort={setSort} />
      )}
        </div>

      {error && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-red-600">
            {error}
          </div>
      )}

      {/* Show package listing if viewing packages subgroup */}
      {showVerticalCategoryList ? null : isPackageSubgroup && packageHeaders.length > 0 ? (
        <section className="relative">
          <div
            className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 bg-[radial-gradient(140%_80%_at_50%_0%,rgba(201,26,77,0.12),transparent_55%)]"
            aria-hidden="true"
          />
          
          <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pb-16">
            {/* Premium Packages Header */}
           
            {/* Package Listing Grid - responsive: 1 col mobile, 2 col tablet, 3 col desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 auto-rows-fr">
              {packageHeaders.map((pkg, index) => (
                <PackageListingCard
                  key={pkg.ProductID}
                  packageData={pkg}
                  placeholderIndex={index}
                  onClick={() => navigate(`/package/${pkg.ProductID}`, { 
                    state: { 
                      fromPackages: true,
                      subgroupId: pkg.QrSubgroupID 
                    } 
                  })}
                />
              ))}
            </div>
          </div>
        </section>
      ) : items.length > 0 ? (
        <MenuGrid
          items={displayItems}
          onQuickAdd={undefined}
          onOpen={openModal}
          categoryKey={activeCat}
          isPackageView={false}
          sections={groupedSections}
          canOrder={orderMode}
        />
      ) : loading ? (
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
        </div>
      ) : (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center text-gray-500">
          No items found
        </div>
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
        onAdd={(mods) => {
          if (modalItem) add(modalItem, mods);
        }}
      />

      {orderMode && <CartDrawer open={drawer} onClose={() => setDrawer(false)} />}

      {orderMode && (
        <FloatingCartButton
          isOpen={drawer || modalOpen}
          onClick={() => setDrawer(true)}
        />
      )}

      <ScrollTopButton />
    </div>
  );
}
