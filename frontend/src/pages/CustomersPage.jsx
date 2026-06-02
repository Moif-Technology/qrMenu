// frontend/src/pages/CustomersPage.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpDown,
  Calendar,
  CalendarPlus,
  ChevronRight,
  Edit2,
  History,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  TrendingUp,
  User,
  UserCircle2,
  UserPlus,
  X
} from "lucide-react";
import BottomNav from "../component/reservation/BottomNav";
import { createCustomer, searchCustomers, updateCustomer } from "../services/reservation.service";

const PAGE_SIZE = 50;
const cn = (...classes) => classes.filter(Boolean).join(" ");

const sortOptions = [
  { value: "recent", label: "Recently Added", icon: Calendar },
  { value: "name", label: "Name A-Z", icon: User },
  { value: "frequency", label: "Visit Frequency", icon: TrendingUp },
  { value: "lastVisit", label: "Last Visit", icon: History }
];

const emptyForm = { name: "", phone: "", email: "" };

export default function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [page, setPage] = useState(1);
  const [paging, setPaging] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [modalMode, setModalMode] = useState(null); // add | edit | null
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const loadMoreRef = useRef(null);

  const totalPages = Math.max(1, paging.totalPages || Math.ceil((paging.total || 0) / PAGE_SIZE));
  const activeSort = sortOptions.find((option) => option.value === sortBy) || sortOptions[0];

  const loadCustomers = async (mode = "replace", nextPage = page) => {
    const isAppend = mode === "append";
    if (isAppend) setLoadingMore(true);
    else setLoading(true);
    setError("");

    try {
      const result = await searchCustomers(debouncedSearchQuery, {
        page: nextPage,
        pageSize: PAGE_SIZE,
        sort: sortBy
      });

      if (!result.ok || !Array.isArray(result.customers)) {
        throw new Error(result.error || "Failed to load customers");
      }

      setCustomers((prev) => {
        if (!isAppend) return result.customers;
        const seen = new Set(prev.map((customer) => String(customer.id)));
        return [
          ...prev,
          ...result.customers.filter((customer) => !seen.has(String(customer.id)))
        ];
      });
      setPaging(result.paging || {
        page: nextPage,
        pageSize: PAGE_SIZE,
        total: result.customers.length,
        totalPages: 1
      });
    } catch (err) {
      console.error("Error loading customers:", err);
      setError(err.message || "Failed to load customers");
      if (!isAppend) {
        setCustomers([]);
        setPaging({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
      }
    } finally {
      if (isAppend) setLoadingMore(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [sortBy]);

  useEffect(() => {
    loadCustomers(page === 1 ? "replace" : "append", page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, page, sortBy]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loading || loadingMore || page >= totalPages) return;
        setPage((p) => p + 1);
      },
      { rootMargin: "260px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, loadingMore, page, totalPages]);

  const resetAndReload = () => {
    if (page === 1) loadCustomers("replace", 1);
    else setPage(1);
  };

  const openAddModal = () => {
    setModalMode("add");
    setForm(emptyForm);
    setFormError("");
  };

  const openEditModal = (customer, event) => {
    event?.stopPropagation();
    setModalMode("edit");
    setSelectedCustomer(customer);
    setForm({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || ""
    });
    setFormError("");
  };

  const closeCustomerModal = () => {
    setModalMode(null);
    setForm(emptyForm);
    setFormError("");
    setSaving(false);
  };

  const saveCustomer = async () => {
    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();

    if (!name) {
      setFormError("Name is required");
      return;
    }
    if (!phone) {
      setFormError("Phone is required");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      if (modalMode === "add") {
        const result = await createCustomer({ name, phone, email });
        if (!result.ok) throw new Error(result.error || "Failed to create customer");

        const newCustomer = result.customer || {
          id: Date.now(),
          name,
          phone,
          email,
          visitCount: 0,
          lastVisit: null,
          createdDate: new Date().toISOString()
        };

        setCustomers((prev) => [newCustomer, ...prev]);
        setPaging((prev) => ({ ...prev, total: Number(prev.total || 0) + 1 }));
        closeCustomerModal();
        return;
      }

      const result = await updateCustomer(selectedCustomer.id, { name, phone, email });
      if (!result.ok) throw new Error(result.error || "Failed to update customer");

      setCustomers((prev) =>
        prev.map((customer) =>
          customer.id === selectedCustomer.id
            ? { ...customer, name, phone, email }
            : customer
        )
      );
      closeCustomerModal();
    } catch (err) {
      console.error("Error saving customer:", err);
      setFormError(err?.response?.data?.error || err.message || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  const openBookingActions = (customer) => {
    setSelectedCustomer(customer);
    setShowActionMenu(true);
  };

  const closeBookingActions = () => {
    setShowActionMenu(false);
    setSelectedCustomer(null);
  };

  const goToWalkIn = () => {
    if (!selectedCustomer) return;
    navigate("/walk-in", {
      state: {
        customerData: {
          name: selectedCustomer.name,
          phone: selectedCustomer.phone,
          email: selectedCustomer.email
        }
      }
    });
  };

  const goToReservation = () => {
    if (!selectedCustomer) return;
    navigate("/reservation-form", {
      state: {
        customerData: {
          name: selectedCustomer.name,
          phone: selectedCustomer.phone,
          email: selectedCustomer.email
        }
      }
    });
  };

  const customerInitial = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-[#f7f7f8] pb-24">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#FBE6EC] text-[#C91A4D]">
                <UserCircle2 className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-gray-950">Customers</h1>
                <p className="text-sm font-medium text-gray-500">All</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetAndReload}
                disabled={loading || loadingMore}
                className="grid h-11 w-11 place-items-center rounded-xl border border-gray-200 bg-white text-[#C91A4D] transition hover:bg-gray-50 disabled:opacity-50"
                aria-label="Refresh customers"
                title="Refresh"
              >
                <RefreshCw className={cn("h-5 w-5", (loading || loadingMore) && "animate-spin")} />
              </button>
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#C91A4D] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#ad143f]"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, phone, or email"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 pl-12 pr-4 text-sm font-medium text-gray-900 outline-none transition focus:border-[#C91A4D] focus:bg-white focus:ring-2 focus:ring-[#FBE6EC]"
              />
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSortMenu((value) => !value)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-700 transition hover:bg-gray-50 md:w-auto"
              >
                <ArrowUpDown className="h-4 w-4 text-[#C91A4D]" />
                {activeSort.label}
              </button>

              {showSortMenu && (
                <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
                  {sortOptions.map((option) => {
                    const Icon = option.icon;
                    const active = sortBy === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSortBy(option.value);
                          setShowSortMenu(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition",
                          active ? "bg-[#FBE6EC] font-bold text-[#C91A4D]" : "font-medium text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {loading && customers.length === 0 ? (
          <div className="grid min-h-[40vh] place-items-center rounded-2xl border border-gray-200 bg-white">
            <div className="text-center">
              <RefreshCw className="mx-auto mb-3 h-9 w-9 animate-spin text-[#C91A4D]" />
              <p className="text-sm font-semibold text-gray-600">Loading customers...</p>
            </div>
          </div>
        ) : error && customers.length === 0 ? (
          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center">
            <p className="mb-4 font-semibold text-red-700">{error}</p>
            <button
              type="button"
              onClick={resetAndReload}
              className="rounded-xl bg-[#C91A4D] px-5 py-2.5 text-sm font-bold text-white"
            >
              Try Again
            </button>
          </div>
        ) : customers.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-[#FBE6EC] text-[#C91A4D]">
              <UserPlus className="h-7 w-7" />
            </div>
            <h2 className="mb-1 text-lg font-bold text-gray-950">No customers found</h2>
            <p className="mb-5 text-sm font-medium text-gray-500">
              {debouncedSearchQuery ? "Try another search or add a new customer." : "Add your first customer to get started."}
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="rounded-xl bg-[#C91A4D] px-5 py-2.5 text-sm font-bold text-white"
            >
              Add Customer
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {customers.map((customer) => (
              <article
                key={customer.id}
                onClick={() => openBookingActions(customer)}
                className="group cursor-pointer rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:border-[#C91A4D]/30 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#FBE6EC] text-lg font-black text-[#C91A4D]">
                    {customerInitial(customer.name)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-gray-950">
                          {customer.name || "Unknown"}
                        </h3>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-gray-600">
                          {customer.phone && (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <Phone className="h-4 w-4 shrink-0 text-[#C91A4D]" />
                              <span className="truncate">{customer.phone}</span>
                            </span>
                          )}
                          {customer.email && (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <Mail className="h-4 w-4 shrink-0 text-[#C91A4D]" />
                              <span className="truncate">{customer.email}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => openEditModal(customer, event)}
                          className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 transition hover:bg-[#FBE6EC] hover:text-[#C91A4D]"
                          aria-label={`Edit ${customer.name || "customer"}`}
                          title="Edit customer"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <ChevronRight className="h-5 w-5 text-gray-300 transition group-hover:text-[#C91A4D]" />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-xs font-bold text-gray-500">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {customer.visitCount ?? 0} {(customer.visitCount ?? 0) === 1 ? "visit" : "visits"}
                      </span>
                      {customer.lastVisit && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
                          <History className="h-3.5 w-3.5" />
                          Last {new Date(customer.lastVisit).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}

            <div ref={loadMoreRef} className="py-5 text-center">
              {loadingMore ? (
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500">
                  <RefreshCw className="h-4 w-4 animate-spin text-[#C91A4D]" />
                  Loading more...
                </div>
              ) : page < totalPages ? (
                <span className="text-xs font-semibold text-gray-400">Scroll for more</span>
              ) : customers.length > PAGE_SIZE ? (
                <span className="text-xs font-semibold text-gray-400">All loaded</span>
              ) : null}
            </div>
          </div>
        )}
      </main>

      {showActionMenu && selectedCustomer && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-0 sm:place-items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-gray-950">{selectedCustomer.name}</h2>
                <p className="truncate text-sm font-medium text-gray-500">{selectedCustomer.phone}</p>
              </div>
              <button
                type="button"
                onClick={closeBookingActions}
                className="grid h-10 w-10 place-items-center rounded-xl hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="grid gap-3">
              <button
                type="button"
                onClick={goToWalkIn}
                className="flex items-center gap-4 rounded-2xl border border-gray-200 p-4 text-left transition hover:border-[#C91A4D]/30 hover:bg-[#FBE6EC]/40"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#FBE6EC] text-[#C91A4D]">
                  <UserPlus className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-gray-950">Walk-in</span>
                  <span className="block text-sm font-medium text-gray-500">Seat customer now</span>
                </span>
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </button>

              <button
                type="button"
                onClick={goToReservation}
                className="flex items-center gap-4 rounded-2xl border border-gray-200 p-4 text-left transition hover:border-[#C91A4D]/30 hover:bg-[#FBE6EC]/40"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#FBE6EC] text-[#C91A4D]">
                  <CalendarPlus className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-gray-950">Reservation</span>
                  <span className="block text-sm font-medium text-gray-500">Book for later</span>
                </span>
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMode && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/45 p-0 sm:place-items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-950">
                {modalMode === "add" ? "Add Customer" : "Edit Customer"}
              </h2>
              <button
                type="button"
                onClick={closeCustomerModal}
                className="grid h-10 w-10 place-items-center rounded-xl hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-gray-700">Name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  disabled={saving}
                  className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium outline-none focus:border-[#C91A4D] focus:ring-2 focus:ring-[#FBE6EC]"
                  placeholder="Customer name"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-gray-700">Phone</span>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  disabled={saving}
                  className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium outline-none focus:border-[#C91A4D] focus:ring-2 focus:ring-[#FBE6EC]"
                  placeholder="Phone number"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-gray-700">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  disabled={saving}
                  className="h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium outline-none focus:border-[#C91A4D] focus:ring-2 focus:ring-[#FBE6EC]"
                  placeholder="Optional"
                />
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeCustomerModal}
                disabled={saving}
                className="h-12 flex-1 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCustomer}
                disabled={saving}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#C91A4D] text-sm font-bold text-white transition hover:bg-[#ad143f] disabled:opacity-50"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
