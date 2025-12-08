import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CartDrawer from "../component/CartDrawer";
import CategoryTabs from "../component/CategoryTabs";
import FilterBar from "../component/FilterBar";
import FloatingCartButton from "../component/FloatingCartButton";
import ItemModal from "../component/ItemModal";
import MenuGrid from "../component/MenuGrid";
import SearchBar from "../component/SearchBar";
import ScrollTopButton from "../component/ScrollTopButton";
import TopBar from "../component/TopBar";
import { useCart } from "../store/cartStore";
import { useTranslation } from "react-i18next";
import Icon from "../component/Icon";

// 🔌 LIVE API
import { getCategories, getItems } from "../services/menu.service";
import { checkTableOrders } from "../services/payment.service";

// ————————————————————————————————————————————————
// Helpers to normalize API → UI
function normalizeImage(src) {
  if (!src) return "";
  if (typeof src !== "string") return "";
  const trimmed = src.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }
  // assume base64 blob
  return `data:image/jpeg;base64,${trimmed}`;
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
    .filter(Boolean);

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
    id: row.id ?? row.product_id ?? row.ID,
    name: row.name ?? row.Description ?? "Untitled",
    desc: row.short_description ?? row.Specification ?? "",
    img: normalizeImage(row.image ?? row.DocImage ?? row.ImageLocation ?? normalizedImages[0] ?? ""),
    images: normalizedImages,
    price: calculatedPrice,
    category: row.group_name ?? row.group_code ?? "",
    categoryId: row.group_id ?? row.GroupID ?? null,
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
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState(""); // will set after categories load
  const [sort, setSort] = useState("pop");

  // Data state
  const [cats, setCats] = useState([]);               // [{ id, name }]
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

  // Check for ongoing orders when token/tableId is available
  useEffect(() => {
    if (!token) {
      setHasOngoingOrders(false);
      return;
    }
    
    (async () => {
      try {
        setCheckingOrders(true);
        const result = await checkTableOrders(token);
        setHasOngoingOrders(result.hasOrders);
      } catch (e) {
        console.error("Error checking table orders:", e);
        setHasOngoingOrders(false);
      } finally {
        setCheckingOrders(false);
      }
    })();
  }, [token]);

  // 1) Load categories once, choose first as active
  useEffect(() => {
    (async () => {
      try {
        const raw = await getCategories(); // [{ groupId, name, code, name_ar }]
        const mapped = raw.map((g) => ({ id: g.groupId, name: g.name }));
        setCats(mapped);
        if (mapped.length > 0) setActiveCat((prev) => prev || mapped[0].id);
      } catch (e) {
        console.error(e);
        setError(e?.message || "Failed to load categories");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Fetch items with filters
  async function loadItems(page = 1) {
    try {
      setLoading(true);
      setError("");
      const trimmedSearch = search.trim();
      const searching = trimmedSearch.length > 0;
      const groupFilter = searching ? undefined : activeCat || undefined;
      const res = await getItems({
        page,
        pageSize: paging.pageSize,
        search: trimmedSearch || undefined,
        groupId: groupFilter,
        sort: toApiSort(sort)
      });
      setItems(res.data.map(mapRowToItem));
      setPaging(res.paging);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || e.message || "Failed to load items");
      setItems([]);
      setPaging((p) => ({ ...p, total: 0 }));
    } finally {
      setLoading(false);
    }
  }

  // 3) Load on category/sort change
  useEffect(() => {
    if (!activeCat) return;
    loadItems(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCat, sort]);

  // 4) Debounce search
  useEffect(() => {
    if (!activeCat) return;
    const t = setTimeout(() => loadItems(1), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Modal + cart
  const openModal = (item) => {
    setModalItem(item);
    setModalOpen(true);
  };
  const quickAdd = (item) => add(item, []);

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
      <TopBar onCart={() => setDrawer(true)} />
      
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

      <main className="relative pb-24">
        <section className="relative overflow-hidden pt-6 pb-8">
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
        </section>

        <div className="relative mt-6 space-y-6">
          {search.trim().length === 0 && (
      <CategoryTabs
        categories={cats}
        activeId={activeCat}
        onChange={setActiveCat}
      />
          )}

      <FilterBar sort={sort} onSort={setSort} />
        </div>

      {error && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-red-600">
            {error}
          </div>
      )}

      {loading ? (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-48 rounded-[22px] border border-white/60 bg-white/70 shadow-inner shimmer"
              />
          ))}
        </div>
      ) : (
        <MenuGrid items={items} onQuickAdd={quickAdd} onOpen={openModal} />
      )}

      {!loading && paging.total > paging.pageSize && (
          <div className="flex items-center justify-center gap-3 my-10">
          <button
            className="btn-pill-outline"
            disabled={paging.page <= 1}
            onClick={() => loadItems(paging.page - 1)}
          >
              {t("buttons.prev")}
          </button>
            <span className="text-sm text-gray-600">
            Page {paging.page} / {totalPages}
          </span>
          <button
            className="btn-pill-outline"
            disabled={paging.page >= totalPages}
            onClick={() => loadItems(paging.page + 1)}
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
        onAdd={(mods) => add(modalItem, mods)}
      />

      <CartDrawer open={drawer} onClose={() => setDrawer(false)} />

      <FloatingCartButton
        isOpen={drawer || modalOpen}
        onClick={() => setDrawer(true)}
      />

      <ScrollTopButton />
    </div>
  );
}
