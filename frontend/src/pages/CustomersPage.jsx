// frontend/src/pages/CustomersPage.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { searchCustomers, updateCustomer } from "../services/reservation.service";
import BottomNav from "../component/reservation/BottomNav";
import { 
  Search, 
  Phone, 
  Mail, 
  User,
  History,
  ChevronRight,
  UserCircle2,
  Calendar,
  RefreshCw,
  ArrowUpDown,
  X,
  Save,
  Edit2,
  TrendingUp,
  UserPlus,
  CalendarPlus
} from "lucide-react";

export default function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("recent"); // recent, name, frequency, lastVisit
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  // Edit modal state
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "" });
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Quick action menu state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showActionMenu, setShowActionMenu] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    // Filter and sort customers
    let filtered = customers;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(customer => 
        customer.name?.toLowerCase().includes(query) ||
        customer.phone?.toLowerCase().includes(query) ||
        customer.email?.toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        case "frequency":
          return (b.visitCount || 0) - (a.visitCount || 0);
        case "lastVisit":
          const dateA = a.lastVisit ? new Date(a.lastVisit) : new Date(0);
          const dateB = b.lastVisit ? new Date(b.lastVisit) : new Date(0);
          return dateB - dateA;
        case "recent":
        default:
          const createdA = a.createdDate ? new Date(a.createdDate) : new Date(0);
          const createdB = b.createdDate ? new Date(b.createdDate) : new Date(0);
          return createdB - createdA;
      }
    });
    
    setFilteredCustomers(filtered);
  }, [searchQuery, customers, sortBy]);

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchCustomers('');
      if (result.ok && Array.isArray(result.customers)) {
        setCustomers(result.customers);
        setFilteredCustomers(result.customers);
      } else {
        setError("Failed to load customers");
        setCustomers([]);
        setFilteredCustomers([]);
      }
    } catch (err) {
      console.error("Error loading customers:", err);
      setError(err.message || "Failed to load customers");
      setCustomers([]);
      setFilteredCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadCustomers();
  };

  const handleEditClick = (customer, e) => {
    e.stopPropagation();
    setEditingCustomer(customer);
    setEditForm({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || ""
    });
    setEditError("");
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
    setEditError("");
  };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) {
      setEditError("Name is required");
      return;
    }
    if (!editForm.phone.trim()) {
      setEditError("Phone is required");
      return;
    }

    setSaving(true);
    setEditError("");
    
    try {
      const result = await updateCustomer(editingCustomer.id, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim()
      });

      if (result.ok) {
        // Update local state
        const updatedCustomers = customers.map(c => 
          c.id === editingCustomer.id 
            ? { ...c, name: editForm.name.trim(), phone: editForm.phone.trim(), email: editForm.email.trim() }
            : c
        );
        setCustomers(updatedCustomers);
        setEditingCustomer(null);
      } else {
        setEditError(result.error || "Failed to update customer");
      }
    } catch (err) {
      console.error("Error updating customer:", err);
      setEditError(err?.response?.data?.error || err.message || "Failed to update customer");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingCustomer(null);
    setEditForm({ name: "", phone: "", email: "" });
    setEditError("");
  };

  const handleCustomerClick = (customer) => {
    // Show action menu to choose between Walk-in or Reservation
    setSelectedCustomer(customer);
    setShowActionMenu(true);
  };

  const handleWalkIn = () => {
    if (selectedCustomer) {
      navigate('/walk-in', { 
        state: { 
          customerData: {
            name: selectedCustomer.name,
            phone: selectedCustomer.phone,
            email: selectedCustomer.email
          }
        }
      });
    }
    setShowActionMenu(false);
    setSelectedCustomer(null);
  };

  const handleReservation = () => {
    if (selectedCustomer) {
      navigate('/reservation-form', { 
        state: { 
          customerData: {
            name: selectedCustomer.name,
            phone: selectedCustomer.phone,
            email: selectedCustomer.email
          }
        }
      });
    }
    setShowActionMenu(false);
    setSelectedCustomer(null);
  };

  const handleCloseActionMenu = () => {
    setShowActionMenu(false);
    setSelectedCustomer(null);
  };

  const sortOptions = [
    { value: "recent", label: "Recently Added", icon: Calendar },
    { value: "name", label: "Name (A-Z)", icon: User },
    { value: "frequency", label: "Visit Frequency", icon: TrendingUp },
    { value: "lastVisit", label: "Last Visit", icon: History }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--grad-start-soft)' }}
              >
                <UserCircle2 className="w-6 h-6" style={{ color: 'var(--text-accent)' }} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
                <p className="text-sm text-gray-500">
                  {filteredCustomers.length} {filteredCustomers.length === 1 ? 'customer' : 'customers'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Sort Button */}
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="p-3 rounded-xl hover:bg-gray-50 transition-colors relative"
                  style={{ color: '#C91A4D' }}
                >
                  <ArrowUpDown className="w-5 h-5" />
                  {sortBy !== "recent" && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ backgroundColor: '#C91A4D' }}></span>
                  )}
                </button>
                
                {/* Sort Menu */}
                {showSortMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                    {sortOptions.map(option => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.value}
                          onClick={() => {
                            setSortBy(option.value);
                            setShowSortMenu(false);
                          }}
                          className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                            sortBy === option.value ? 'bg-rose-50' : ''
                          }`}
                        >
                          <Icon 
                            className="w-4 h-4" 
                            style={{ color: sortBy === option.value ? '#C91A4D' : '#6B7280' }} 
                          />
                          <span 
                            className={`text-sm ${
                              sortBy === option.value ? 'font-semibold' : 'font-medium'
                            }`}
                            style={{ color: sortBy === option.value ? '#C91A4D' : '#374151' }}
                          >
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="p-3 rounded-xl hover:bg-gray-50 transition-colors"
                style={{ color: '#C91A4D' }}
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, phone, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {loading && customers.length === 0 ? (
          <div className="text-center py-12">
            <RefreshCw className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: '#C91A4D' }} />
            <p className="text-gray-600">Loading customers...</p>
          </div>
        ) : error && customers.length === 0 ? (
          <div className="text-center py-12">
            <div 
              className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ backgroundColor: '#FBE6EC' }}
            >
              <User className="w-8 h-8" style={{ color: '#C91A4D' }} />
            </div>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={handleRefresh}
              className="px-6 py-2 rounded-xl text-white font-medium hover:shadow-lg transition-all"
              style={{ backgroundColor: '#C91A4D' }}
            >
              Try Again
            </button>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="text-center py-12">
            <div 
              className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ backgroundColor: '#FBE6EC' }}
            >
              <Search className="w-8 h-8" style={{ color: '#C91A4D' }} />
            </div>
            <p className="text-gray-600">
              {searchQuery ? 'No customers found matching your search' : 'No customers yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                onClick={() => handleCustomerClick(customer)}
                className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-100"
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: '#FBE6EC' }}
                  >
                    <User className="w-6 h-6" style={{ color: '#C91A4D' }} />
                  </div>

                  {/* Customer Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900 text-lg truncate">
                        {customer.name || 'Unknown'}
                      </h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => handleEditClick(customer, e)}
                          className="p-2 rounded-lg hover:bg-rose-50 transition-colors"
                          style={{ color: '#C91A4D' }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-1.5">
                      {customer.phone && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Phone className="w-4 h-4 shrink-0" style={{ color: '#C91A4D' }} />
                          <span className="truncate">{customer.phone}</span>
                        </div>
                      )}
                      {customer.email && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="w-4 h-4 shrink-0" style={{ color: '#C91A4D' }} />
                          <span className="truncate">{customer.email}</span>
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 mt-2 pt-2 border-t border-gray-100">
                      {customer.visitCount !== undefined && customer.visitCount !== null && (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>{customer.visitCount} {customer.visitCount === 1 ? 'visit' : 'visits'}</span>
                        </div>
                      )}
                      {customer.lastVisit && (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <History className="w-3.5 h-3.5" />
                          <span>Last: {new Date(customer.lastVisit).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Action Menu */}
      {showActionMenu && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create Booking</h2>
              <button
                onClick={handleCloseActionMenu}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Customer Info Preview */}
            <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: '#FBE6EC' }}
                >
                  <User className="w-5 h-5" style={{ color: '#C91A4D' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{selectedCustomer.name}</p>
                  <p className="text-sm text-gray-600 truncate">{selectedCustomer.phone}</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4">Choose booking type:</p>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleWalkIn}
                className="w-full px-6 py-4 rounded-xl border-2 font-medium text-left hover:shadow-md transition-all flex items-center gap-4 group"
                style={{ borderColor: '#C91A4D', color: '#C91A4D' }}
              >
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: '#FBE6EC' }}
                >
                  <UserPlus className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-base">Walk-in</p>
                  <p className="text-sm text-gray-600">Seat customer now</p>
                </div>
                <ChevronRight className="w-5 h-5" />
              </button>

              <button
                onClick={handleReservation}
                className="w-full px-6 py-4 rounded-xl border-2 font-medium text-left hover:shadow-md transition-all flex items-center gap-4 group"
                style={{ borderColor: '#C91A4D', color: '#C91A4D' }}
              >
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: '#FBE6EC' }}
                >
                  <CalendarPlus className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-base">Reservation</p>
                  <p className="text-sm text-gray-600">Book for later</p>
                </div>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Edit Customer</h2>
              <button
                onClick={handleCancelEdit}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-600">{editError}</p>
              </div>
            )}

            <div className="space-y-4 mb-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={editForm.name}
                  onChange={handleEditChange}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-transparent"
                  placeholder="Customer name"
                  disabled={saving}
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={editForm.phone}
                  onChange={handleEditChange}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-transparent"
                  placeholder="Phone number"
                  disabled={saving}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={editForm.email}
                  onChange={handleEditChange}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-transparent"
                  placeholder="Email address (optional)"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="flex-1 px-6 py-3 rounded-xl border border-gray-200 font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex-1 px-6 py-3 rounded-xl font-medium text-white hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#C91A4D' }}
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
