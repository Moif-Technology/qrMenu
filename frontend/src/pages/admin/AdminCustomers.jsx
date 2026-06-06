import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar, ChevronLeft, ChevronRight, Edit2, History, Mail, Phone, Plus,
  RefreshCw, Save, Search, TrendingUp, User, UserPlus, X, CalendarPlus, Loader2, MoreHorizontal, Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import { createCustomer, searchCustomers, updateCustomer } from "../../services/reservation.service";

const cn = (...c) => c.filter(Boolean).join(" ");

const SORT_OPTIONS = [
  { value: "recent", label: "Recently Added", icon: Calendar },
  { value: "name", label: "Name A–Z", icon: User },
  { value: "frequency", label: "Visit Frequency", icon: TrendingUp },
  { value: "lastVisit", label: "Last Visit", icon: History },
];
const PAGE_SIZES = [25, 50, 100];
const emptyForm = { name: "", phone: "", email: "" };

export default function AdminCustomers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [paging, setPaging] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [modalMode, setModalMode] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const total = paging.total || 0;
  const totalPages = Math.max(1, paging.totalPages || Math.ceil(total / pageSize));
  const activeSort = SORT_OPTIONS.find((o) => o.value === sortBy) || SORT_OPTIONS[0];
  const fromRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toRow = Math.min(page * pageSize, total);

  const loadCustomers = async (targetPage = page) => {
    setLoading(true);
    setError("");
    try {
      const result = await searchCustomers(debounced, { page: targetPage, pageSize, sort: sortBy });
      if (!result.ok || !Array.isArray(result.customers)) throw new Error(result.error || "Failed to load customers");
      setCustomers(result.customers);
      setPaging(result.paging || { page: targetPage, pageSize, total: result.customers.length, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Failed to load customers");
      setCustomers([]);
      setPaging({ page: 1, pageSize, total: 0, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  };

  // Export all customers matching the current search to an .xlsx file.
  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      // Pull every matching row (not just the current page).
      const all = [];
      let p = 1;
      const size = 500;
      for (;;) {
        const res = await searchCustomers(debounced, { page: p, pageSize: size, sort: sortBy });
        if (!res.ok || !Array.isArray(res.customers)) throw new Error(res.error || "Failed to export");
        all.push(...res.customers);
        const tp = res.paging?.totalPages || 1;
        if (p >= tp || res.customers.length === 0) break;
        p += 1;
      }

      if (all.length === 0) { setError("No customers to export."); return; }

      const rows = all.map((c) => ({
        Name: c.name || "",
        Phone: c.phone || "",
        Email: c.email || "",
        Visits: c.visitCount ?? 0,
        "Last Visit": c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : "",
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 30 }, { wch: 8 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customers");
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `customers-${stamp}.xlsx`);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to export customers");
    } finally {
      setExporting(false);
    }
  };

  // Debounce search; reset to page 1
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(searchQuery.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset to page 1 on sort/pageSize change
  useEffect(() => { setPage(1); }, [sortBy, pageSize]);

  // Load whenever query/page/sort/size changes
  useEffect(() => {
    loadCustomers(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, page, sortBy, pageSize]);

  const openAdd = () => { setModalMode("add"); setForm(emptyForm); setFormError(""); };
  const openEdit = (customer, e) => {
    e?.stopPropagation();
    setModalMode("edit"); setSelected(customer);
    setForm({ name: customer.name || "", phone: customer.phone || "", email: customer.email || "" });
    setFormError("");
  };
  const closeModal = () => { setModalMode(null); setForm(emptyForm); setFormError(""); setSaving(false); };

  const saveCustomer = async () => {
    const name = form.name.trim(), phone = form.phone.trim(), email = form.email.trim();
    if (!name) return setFormError("Name is required");
    if (!phone) return setFormError("Phone is required");
    setSaving(true); setFormError("");
    try {
      if (modalMode === "add") {
        const result = await createCustomer({ name, phone, email });
        if (!result.ok) throw new Error(result.error || "Failed to create customer");
        closeModal();
        if (page === 1) loadCustomers(1); else setPage(1);
      } else {
        const result = await updateCustomer(selected.id, { name, phone, email });
        if (!result.ok) throw new Error(result.error || "Failed to update customer");
        setCustomers((prev) => prev.map((c) => (c.id === selected.id ? { ...c, name, phone, email } : c)));
        closeModal();
      }
    } catch (err) {
      setFormError(err?.response?.data?.error || err.message || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  const goToWalkIn = () => selected && navigate("/walk-in", { state: { customerData: { name: selected.name, phone: selected.phone, email: selected.email } } });
  const goToReservation = () => selected && navigate("/reservation-form", { state: { customerData: { name: selected.name, phone: selected.phone, email: selected.email } } });

  const initial = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?";
  const inputCls = "h-12 w-full rounded-xl bg-[var(--paper)] border border-[var(--line)] px-4 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--brass)] focus:ring-2 focus:ring-[var(--brass-soft)] transition";

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="admin-eyebrow">The guestbook</p>
          <div className="flex items-baseline gap-3 mt-1">
            <h1 className="font-display text-[40px] sm:text-[48px] leading-[0.95] text-[var(--ink)]">Customers</h1>
            <span className="rounded-full bg-[var(--brass-soft)] text-[var(--brass-2)] text-[13px] font-bold px-3 py-1">
              {total.toLocaleString()} total
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadCustomers(page)} disabled={loading}
            className="grid h-11 w-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--paper)] text-[var(--ink-soft)] hover:border-[var(--brass)] disabled:opacity-50 transition">
            <RefreshCw className={cn("h-4.5 w-4.5", loading && "animate-spin")} />
          </button>
          <button onClick={handleExport} disabled={exporting || loading} title="Export to Excel"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 text-[14px] font-bold text-[var(--ink-soft)] hover:border-[var(--brass)] hover:text-[var(--brass-2)] disabled:opacity-50 transition">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Export</span>
          </button>
          <button onClick={openAdd} className="admin-btn-brass inline-flex h-11 items-center gap-2 px-5 text-[14px] font-bold">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      {/* Search + sort */}
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[var(--ink-faint)]" />
          <input type="text" placeholder="Search name, phone, or email" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className={`${inputCls} pl-11`} />
        </div>
        <div className="relative">
          <button onClick={() => setShowSortMenu((v) => !v)}
            className="inline-flex h-12 w-full md:w-auto items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 text-[14px] font-bold text-[var(--ink-soft)] hover:border-[var(--brass)] transition">
            <activeSort.icon className="h-4 w-4 text-[var(--brass)]" /> {activeSort.label}
          </button>
          {showSortMenu && (
            <div className="absolute right-0 z-50 mt-2 w-56 admin-card py-2 admin-rise">
              {SORT_OPTIONS.map((o) => {
                const Icon = o.icon; const active = sortBy === o.value;
                return (
                  <button key={o.value} onClick={() => { setSortBy(o.value); setShowSortMenu(false); }}
                    className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] transition",
                      active ? "bg-[var(--brass-soft)] font-bold text-[var(--brass-2)]" : "font-medium text-[var(--ink-soft)] hover:bg-[var(--cream)]")}>
                    <Icon className="h-4 w-4" /> {o.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && <div className="rounded-xl bg-[#F6E7E2] border border-[#E3C4BB] text-[var(--danger)] text-sm px-4 py-3">{error}</div>}

      {/* Table */}
      <div className="admin-card overflow-hidden admin-rise">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--cream-2)]/60 border-b border-[var(--line)]">
                <th className="admin-eyebrow font-bold px-5 py-3.5">Customer</th>
                <th className="admin-eyebrow font-bold px-5 py-3.5 hidden sm:table-cell">Phone</th>
                <th className="admin-eyebrow font-bold px-5 py-3.5 hidden lg:table-cell">Email</th>
                <th className="admin-eyebrow font-bold px-5 py-3.5 text-center">Visits</th>
                <th className="admin-eyebrow font-bold px-5 py-3.5 hidden md:table-cell">Last visit</th>
                <th className="admin-eyebrow font-bold px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--brass)] mx-auto" /></td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center">
                  <p className="font-display text-2xl text-[var(--ink-faint)]">No customers found</p>
                  <p className="text-sm text-[var(--ink-faint)] mt-1">{debounced ? "Try another search." : "Add your first customer to begin."}</p>
                </td></tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--cream)] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--brass-soft)] border border-[var(--line)] font-display text-[15px] text-[var(--brass-2)]">
                          {initial(c.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[15px] text-[var(--ink)] truncate">{c.name || "Unknown"}</p>
                          <p className="text-[12px] text-[var(--ink-faint)] sm:hidden">{c.phone || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-[14px] text-[var(--ink-soft)]"><Phone className="h-3.5 w-3.5 text-[var(--brass)]" />{c.phone || "—"}</span>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-[14px] text-[var(--ink-soft)] max-w-[240px]"><Mail className="h-3.5 w-3.5 text-[var(--brass)] shrink-0" /><span className="truncate">{c.email || "—"}</span></span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-block rounded-full bg-[var(--cream-2)] px-2.5 py-1 text-[12.5px] font-bold text-[var(--ink-soft)] tabular-nums">{c.visitCount ?? 0}</span>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-[13.5px] text-[var(--ink-faint)]">
                      {c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={(e) => openEdit(c, e)} title="Edit" className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink-faint)] hover:bg-[var(--brass-soft)] hover:text-[var(--brass-2)] transition">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => { setSelected(c); setShowActions(true); }} title="Booking actions" className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink-faint)] hover:bg-[var(--brass-soft)] hover:text-[var(--brass-2)] transition">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3.5">
          <div className="flex items-center gap-3 text-[13px] text-[var(--ink-faint)]">
            <span>{fromRow}–{toRow} of {total.toLocaleString()}</span>
            <span className="hidden sm:inline text-[var(--line)]">|</span>
            <label className="hidden sm:flex items-center gap-1.5">
              Rows
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-[13px] text-[var(--ink-soft)] outline-none focus:border-[var(--brass)]">
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--paper)] px-3.5 py-2 text-[13px] font-semibold text-[var(--ink-soft)] hover:border-[var(--brass)] disabled:opacity-40 disabled:hover:border-[var(--line)] transition">
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span className="text-[13px] font-semibold text-[var(--ink-soft)] tabular-nums px-1">Page {page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--paper)] px-3.5 py-2 text-[13px] font-semibold text-[var(--ink-soft)] hover:border-[var(--brass)] disabled:opacity-40 disabled:hover:border-[var(--line)] transition">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Action menu */}
      {showActions && selected && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-[var(--ink)]/55 backdrop-blur-sm p-0 sm:place-items-center sm:p-4" onClick={() => { setShowActions(false); setSelected(null); }}>
          <div className="w-full max-w-md admin-card rounded-t-3xl sm:rounded-3xl p-5 admin-rise" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-display text-xl text-[var(--ink)]">{selected.name}</h2>
                <p className="truncate text-sm text-[var(--ink-faint)]">{selected.phone}</p>
              </div>
              <button onClick={() => { setShowActions(false); setSelected(null); }} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-[var(--cream)]"><X className="h-5 w-5 text-[var(--ink-faint)]" /></button>
            </div>
            <div className="grid gap-3">
              {[{ fn: goToWalkIn, icon: UserPlus, t: "Walk-in", s: "Seat customer now" }, { fn: goToReservation, icon: CalendarPlus, t: "Reservation", s: "Book for later" }].map((a) => (
                <button key={a.t} onClick={a.fn} className="flex items-center gap-4 rounded-2xl border border-[var(--line)] p-4 text-left transition hover:border-[var(--brass)] hover:bg-[var(--brass-soft)]/40">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--brass-soft)] text-[var(--brass-2)]"><a.icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[var(--ink)]">{a.t}</span>
                    <span className="block text-sm text-[var(--ink-faint)]">{a.s}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-[var(--line)]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-[var(--ink)]/55 backdrop-blur-sm p-0 sm:place-items-center sm:p-4" onClick={closeModal}>
          <div className="w-full max-w-md admin-card rounded-t-3xl sm:rounded-3xl p-5 admin-rise" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl text-[var(--ink)]">{modalMode === "add" ? "Add Customer" : "Edit Customer"}</h2>
              <button onClick={closeModal} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-[var(--cream)]"><X className="h-5 w-5 text-[var(--ink-faint)]" /></button>
            </div>
            {formError && <div className="mb-4 rounded-xl border border-[#E3C4BB] bg-[#F6E7E2] px-4 py-3 text-sm font-semibold text-[var(--danger)]">{formError}</div>}
            <div className="space-y-4">
              {[{ k: "name", label: "Name", type: "text", ph: "Customer name" }, { k: "phone", label: "Phone", type: "tel", ph: "Phone number" }, { k: "email", label: "Email", type: "email", ph: "Optional" }].map((f) => (
                <label key={f.k} className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-[var(--ink-soft)]">{f.label}</span>
                  <input type={f.type} value={form[f.k]} disabled={saving} placeholder={f.ph}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.k]: e.target.value }))} className={inputCls} />
                </label>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={closeModal} disabled={saving} className="h-12 flex-1 rounded-full border border-[var(--line)] text-sm font-bold text-[var(--ink-soft)] hover:bg-[var(--cream)] disabled:opacity-50 transition">Cancel</button>
              <button onClick={saveCustomer} disabled={saving} className="admin-btn-brass inline-flex h-12 flex-1 items-center justify-center gap-2 text-sm font-bold disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
