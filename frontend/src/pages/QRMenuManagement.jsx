import { useState, useEffect } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  Search,
  CheckCircle2,
  XCircle,
  Package,
  Folder,
  FolderTree,
} from "lucide-react";
import {
  getAllProductsFromMaster,
  getQrGroups,
  createQrGroup,
  updateQrGroup,
  deleteQrGroup,
  getQrSubgroups,
  createQrSubgroup,
  updateQrSubgroup,
  deleteQrSubgroup,
  getQrProducts,
  addProductToQrMenu,
  updateQrProductAssignment,
  removeProductFromQrMenu,
} from "../services/qrMenu.service";
import {
  getPackageHeaders,
  getPackageItems,
  markAsPackageHeader,
  addProductToPackage,
  removeProductFromPackage,
  createNewPackage,
} from "../services/package.service";

const TABS = {
  PRODUCTS: "products",
  GROUPS: "groups",
  SUBGROUPS: "subgroups",
  PACKAGES: "packages",
};

export default function QRMenuManagement() {
  const [activeTab, setActiveTab] = useState(TABS.PRODUCTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Products state
  const [allProducts, setAllProducts] = useState([]);
  const [qrProductsMap, setQrProductsMap] = useState(new Map()); // Map of ProductID -> QR Product data
  const [totalProductsCount, setTotalProductsCount] = useState(0); // Total count for display

  // Groups and Subgroups state
  const [groups, setGroups] = useState([]);
  const [subgroups, setSubgroups] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showSubgroupModal, setShowSubgroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingSubgroup, setEditingSubgroup] = useState(null);
  const [selectedGroupForSubgroup, setSelectedGroupForSubgroup] = useState(null);
  
  // Normal groups and subgroups for linking (optional references)
  const [normalGroups, setNormalGroups] = useState([]);
  const [normalSubgroups, setNormalSubgroups] = useState([]);

  // Load data on mount
  useEffect(() => {
    loadAllProducts({});
    loadGroups();
    loadSubgroups();
    loadQrProducts();
    // Load total count (without filters)
    loadTotalProductsCount();
    // Load normal groups and subgroups for linking
    loadNormalGroupsAndSubgroups();
  }, []);

  useEffect(() => {
    if (activeTab === TABS.SUBGROUPS) {
      loadSubgroups();
    }
  }, [activeTab]);

  const loadTotalProductsCount = async () => {
    try {
      const data = await getAllProductsFromMaster({});
      setTotalProductsCount(data?.length || 0);
    } catch (err) {
      console.error("Failed to load total products count:", err);
    }
  };

  const loadAllProducts = async (filters = {}) => {
    try {
      setLoading(true);
      setError("");
      const data = await getAllProductsFromMaster(filters);
      setAllProducts(data || []);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const data = await getQrGroups();
      setGroups(data || []);
    } catch (err) {
      console.error("Failed to load groups:", err);
    }
  };

  const loadSubgroups = async (groupId = null) => {
    try {
      const data = await getQrSubgroups(groupId);
      setSubgroups(data || []);
    } catch (err) {
      console.error("Failed to load subgroups:", err);
    }
  };

  const loadQrProducts = async () => {
    try {
      const data = await getQrProducts({});
      // Create a map for quick lookup
      const map = new Map();
      (data || []).forEach((p) => {
        map.set(p.ProductID, p);
      });
      setQrProductsMap(map);
    } catch (err) {
      console.error("Failed to load QR products:", err);
    }
  };

  // Load normal groups and subgroups for optional linking
  const loadNormalGroupsAndSubgroups = async () => {
    try {
      const allProductsData = await getAllProductsFromMaster({});
      // Extract unique groups
      const groups = Array.from(
        new Map(
          allProductsData
            .filter((p) => p.GroupID)
            .map((p) => [
              p.GroupID,
              {
                GroupID: p.GroupID,
                GroupDescription: p.NormalGroupDescription || p.NormalGroupCode || `Group ${p.GroupID}`,
                GroupCode: p.NormalGroupCode,
              },
            ])
        ).values()
      ).sort((a, b) => (a.GroupDescription || "").localeCompare(b.GroupDescription || ""));
      
      // Extract unique subgroups
      const subgroups = Array.from(
        new Map(
          allProductsData
            .filter((p) => p.SubGroupID)
            .map((p) => [
              p.SubGroupID,
              {
                SubGroupID: p.SubGroupID,
                SubgroupDescription: p.NormalSubgroupDescription || p.NormalSubgroupCode || `Subgroup ${p.SubGroupID}`,
                SubgroupCode: p.NormalSubgroupCode,
                GroupID: p.GroupID,
              },
            ])
        ).values()
      ).sort((a, b) => (a.SubgroupDescription || "").localeCompare(b.SubgroupDescription || ""));
      
      setNormalGroups(groups);
      setNormalSubgroups(subgroups);
    } catch (err) {
      console.error("Failed to load normal groups and subgroups:", err);
    }
  };

  // Get QR product info for a product
  const getQrProductInfo = (productId) => {
    return qrProductsMap.get(productId) || null;
  };

  // Handle update product QR assignment (called from ProductsTab)
  const handleUpdateProduct = async (productId, updateData) => {
    try {
      setLoading(true);
      setError("");
      await updateQrProductAssignment(productId, updateData);
      await loadQrProducts();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to update product");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Group handlers
  const handleCreateGroup = () => {
    setEditingGroup(null);
    setShowGroupModal(true);
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setShowGroupModal(true);
  };

  const handleSaveGroup = async (groupData) => {
    try {
      setLoading(true);
      setError("");
      if (editingGroup) {
        await updateQrGroup(editingGroup.QrGroupID, groupData);
      } else {
        await createQrGroup(groupData);
      }
      setShowGroupModal(false);
      setEditingGroup(null);
      await loadGroups();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to save group");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (qrGroupId) => {
    if (!window.confirm("Delete this group? Subgroups will also be deleted.")) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      await deleteQrGroup(qrGroupId);
      await loadGroups();
      await loadSubgroups();
      await loadQrProducts();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to delete group");
    } finally {
      setLoading(false);
    }
  };

  // Subgroup handlers
  const handleCreateSubgroup = () => {
    if (groups.length === 0) {
      alert("Please create a group first");
      return;
    }
    setEditingSubgroup(null);
    setShowSubgroupModal(true);
  };

  const handleEditSubgroup = (subgroup) => {
    setEditingSubgroup(subgroup);
    setShowSubgroupModal(true);
  };

  const handleSaveSubgroup = async (subgroupData) => {
    try {
      setLoading(true);
      setError("");
      if (editingSubgroup) {
        await updateQrSubgroup(editingSubgroup.QrSubgroupID, subgroupData);
      } else {
        await createQrSubgroup(subgroupData);
      }
      setShowSubgroupModal(false);
      setEditingSubgroup(null);
      await loadSubgroups(selectedGroupForSubgroup);
      await loadQrProducts();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to save subgroup");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubgroup = async (qrSubgroupId) => {
    if (!window.confirm("Delete this subgroup?")) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      await deleteQrSubgroup(qrSubgroupId);
      await loadSubgroups(selectedGroupForSubgroup);
      await loadQrProducts();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to delete subgroup");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">QR Menu Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage products, groups, and subgroups for QR menu
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: TABS.PRODUCTS, label: "Products", icon: Package },
              { id: TABS.GROUPS, label: "Groups", icon: Folder },
              { id: TABS.SUBGROUPS, label: "Subgroups", icon: FolderTree },
              { id: TABS.PACKAGES, label: "📦 Packages", icon: Package },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-1 py-4 border-b-2 font-medium text-sm transition ${
                    activeTab === tab.id
                      ? "border-pink-500 text-pink-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === TABS.PRODUCTS && (
          <ProductsTab
            products={allProducts}
            qrProductsMap={qrProductsMap}
            getQrProductInfo={getQrProductInfo}
            qrGroups={groups}
            qrSubgroups={subgroups}
            loading={loading}
            onUpdateProduct={handleUpdateProduct}
            onLoadProducts={loadAllProducts}
            totalProductsCount={totalProductsCount}
            onRefreshQrProducts={loadQrProducts}
          />
        )}

        {activeTab === TABS.GROUPS && (
          <GroupsTab
            groups={groups}
            loading={loading}
            onCreate={handleCreateGroup}
            onEdit={handleEditGroup}
            onDelete={handleDeleteGroup}
          />
        )}

        {activeTab === TABS.SUBGROUPS && (
          <SubgroupsTab
            subgroups={subgroups}
            groups={groups}
            loading={loading}
            selectedGroupForSubgroup={selectedGroupForSubgroup}
            onGroupFilterChange={(groupId) => {
              setSelectedGroupForSubgroup(groupId);
              loadSubgroups(groupId);
            }}
            onCreate={handleCreateSubgroup}
            onEdit={handleEditSubgroup}
            onDelete={handleDeleteSubgroup}
          />
        )}

        {activeTab === TABS.PACKAGES && (
          <PackageManagementTab
            groups={groups}
            subgroups={subgroups}
            loading={loading}
          />
        )}
      </div>

      {/* Group Modal */}
      {showGroupModal && (
        <GroupModal
          onClose={() => {
            setShowGroupModal(false);
            setEditingGroup(null);
          }}
          onSave={handleSaveGroup}
          editingGroup={editingGroup}
          normalGroups={normalGroups}
        />
      )}

      {/* Subgroup Modal */}
      {showSubgroupModal && (
        <SubgroupModal
          onClose={() => {
            setShowSubgroupModal(false);
            setEditingSubgroup(null);
          }}
          onSave={handleSaveSubgroup}
          editingSubgroup={editingSubgroup}
          groups={groups}
          selectedGroupId={editingSubgroup?.QrGroupID || selectedGroupForSubgroup}
          normalSubgroups={normalSubgroups}
        />
      )}

    </div>
  );
}

// Products Tab Component
function ProductsTab({
  products,
  qrProductsMap,
  getQrProductInfo,
  qrGroups,
  qrSubgroups,
  loading,
  onUpdateProduct,
  onLoadProducts,
  totalProductsCount,
  onRefreshQrProducts,
}) {
  const [localQrGroups, setLocalQrGroups] = useState(qrGroups);
  const [localQrSubgroups, setLocalQrSubgroups] = useState(qrSubgroups);
  const [updatingProducts, setUpdatingProducts] = useState(new Set());
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterNormalGroupId, setFilterNormalGroupId] = useState("");
  const [filterNormalSubgroupId, setFilterNormalSubgroupId] = useState("");
  
  // Store all groups/subgroups for dropdowns (loaded once)
  const [allNormalGroups, setAllNormalGroups] = useState([]);
  const [allNormalSubgroups, setAllNormalSubgroups] = useState([]);
  
  // Toast notification state
  const [toast, setToast] = useState({ show: false, message: "", type: "info" });
  
  // Pending changes tracking (Map of ProductID -> { QrGroupID, QrSubgroupID, IsActive })
  const [pendingChanges, setPendingChanges] = useState(new Map());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalQrGroups(qrGroups);
  }, [qrGroups]);

  useEffect(() => {
    setLocalQrSubgroups(qrSubgroups);
  }, [qrSubgroups]);

  // Load all groups and subgroups once (for dropdown options)
  useEffect(() => {
    const loadGroupsAndSubgroups = async () => {
      try {
        const allProductsData = await getAllProductsFromMaster({});
        // Extract unique groups
        const groups = Array.from(
          new Map(
            allProductsData
              .filter((p) => p.GroupID)
              .map((p) => [
                p.GroupID,
                {
                  GroupID: p.GroupID,
                  GroupDescription: p.NormalGroupDescription || p.NormalGroupCode || `Group ${p.GroupID}`,
                  GroupCode: p.NormalGroupCode,
                },
              ])
          ).values()
        ).sort((a, b) => (a.GroupDescription || "").localeCompare(b.GroupDescription || ""));
        
        // Extract unique subgroups
        const subgroups = Array.from(
          new Map(
            allProductsData
              .filter((p) => p.SubGroupID)
              .map((p) => [
                p.SubGroupID,
                {
                  SubGroupID: p.SubGroupID,
                  SubgroupDescription: p.NormalSubgroupDescription || p.NormalSubgroupCode || `Subgroup ${p.SubGroupID}`,
                  SubgroupCode: p.NormalSubgroupCode,
                  GroupID: p.GroupID,
                },
              ])
          ).values()
        ).sort((a, b) => (a.SubgroupDescription || "").localeCompare(b.SubgroupDescription || ""));
        
        setAllNormalGroups(groups);
        setAllNormalSubgroups(subgroups);
      } catch (err) {
        console.error("Failed to load groups/subgroups:", err);
      }
    };
    loadGroupsAndSubgroups();
  }, []);

  // Get available subgroups based on selected normal group
  const availableNormalSubgroups = filterNormalGroupId
    ? allNormalSubgroups.filter((sg) => sg.GroupID == filterNormalGroupId)
    : allNormalSubgroups;

  // Debounce search and reload products when filters change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const filters = {};
      if (searchTerm.trim()) filters.searchTerm = searchTerm.trim();
      if (filterNormalGroupId) filters.groupId = Number(filterNormalGroupId);
      if (filterNormalSubgroupId) filters.subgroupId = Number(filterNormalSubgroupId);
      
      onLoadProducts(filters);
    }, 300); // 300ms debounce for search

    return () => clearTimeout(timeoutId);
  }, [searchTerm, filterNormalGroupId, filterNormalSubgroupId, onLoadProducts]);

  const handleQrGroupChange = (productId, qrGroupId) => {
    const qrInfo = getQrProductInfo(productId);
    setPendingChanges((prev) => {
      const newMap = new Map(prev);
      newMap.set(productId, {
        QrGroupID: qrGroupId ? Number(qrGroupId) : null,
        QrSubgroupID: null, // Reset subgroup when group changes
        IsActive: qrInfo?.IsActive !== undefined ? qrInfo.IsActive : true,
      });
      return newMap;
    });
  };

  const handleQrSubgroupChange = (productId, qrSubgroupId) => {
    const qrInfo = getQrProductInfo(productId);
    const pending = pendingChanges.get(productId);
    setPendingChanges((prev) => {
      const newMap = new Map(prev);
      newMap.set(productId, {
        QrGroupID: pending?.QrGroupID ?? qrInfo?.QrGroupID ?? null,
        QrSubgroupID: qrSubgroupId ? Number(qrSubgroupId) : null,
        IsActive: pending?.IsActive ?? qrInfo?.IsActive ?? true,
      });
      return newMap;
    });
  };

  // Show toast notification
  const showToast = (message, type = "warning") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "info" });
    }, 4000); // Auto-dismiss after 4 seconds
  };

  const handleActiveChange = (productId, isActive, currentChecked) => {
    const qrInfo = getQrProductInfo(productId);
    const pending = pendingChanges.get(productId);
    
    // Validation: Check if QR Group is selected (either in pending or existing)
    const hasQrGroup = pending?.QrGroupID || qrInfo?.QrGroupID;
    
    if (!hasQrGroup && isActive) {
      // Show validation toast message
      showToast("Please choose the QR Group and Subgroup (if available) before activating the product.", "warning");
      // Prevent checkbox from being checked
      return;
    }
    
    setPendingChanges((prev) => {
      const newMap = new Map(prev);
      newMap.set(productId, {
        QrGroupID: pending?.QrGroupID ?? qrInfo?.QrGroupID ?? null,
        QrSubgroupID: pending?.QrSubgroupID ?? qrInfo?.QrSubgroupID ?? null,
        IsActive: isActive,
      });
      return newMap;
    });
  };

  // Save all pending changes
  const handleSaveAll = async () => {
    if (pendingChanges.size === 0) return;
    
    const changesToSave = new Map(pendingChanges); // Store copy before clearing
    const savedCount = changesToSave.size;
    
    setIsSaving(true);
    setUpdatingProducts(new Set(Array.from(changesToSave.keys())));
    
    try {
      const savePromises = Array.from(changesToSave.entries()).map(([productId, updateData]) => {
        // Validation: Must have QrGroupID if IsActive is true
        if (updateData.IsActive && !updateData.QrGroupID) {
          return Promise.resolve(); // Skip invalid entries
        }
        return onUpdateProduct(productId, updateData);
      });
      
      await Promise.all(savePromises);
      
      // Clear pending changes
      setPendingChanges(new Map());
      
      // Show success message
      showToast(`Successfully saved ${savedCount} product(s) to QR menu!`, "success");
      
      // Refresh QR products to update the UI
      if (onRefreshQrProducts) {
        await onRefreshQrProducts();
      }
    } catch (err) {
      showToast("Failed to save some products. Please try again.", "error");
    } finally {
      setIsSaving(false);
      setUpdatingProducts(new Set());
    }
  };

  const getAvailableSubgroups = (qrGroupId) => {
    if (!qrGroupId) return [];
    return localQrSubgroups.filter((sg) => sg.QrGroupID == qrGroupId);
  };

  return (
    <div>
      {/* Toast Notification */}
      {toast.show && (
        <div 
          className="fixed top-4 right-4 z-50 transition-all duration-300 ease-in-out"
          style={{
            animation: "slideInRight 0.3s ease-out",
          }}
        >
          <style>{`
            @keyframes slideInRight {
              from {
                transform: translateX(100%);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
          `}</style>
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border-l-4 ${
              toast.type === "warning" 
              ? "bg-yellow-50 border-yellow-400 text-yellow-800"
              : toast.type === "error"
              ? "bg-red-50 border-red-400 text-red-800"
              : toast.type === "success"
              ? "bg-green-50 border-green-400 text-green-800"
              : "bg-blue-50 border-blue-400 text-blue-800"
          } min-w-[400px] max-w-[500px]`}>
            <div className="flex-shrink-0">
              {toast.type === "warning" ? (
                <XCircle className="w-5 h-5 text-yellow-600" />
              ) : toast.type === "error" ? (
                <XCircle className="w-5 h-5 text-red-600" />
              ) : toast.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast({ show: false, message: "", type: "info" })}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Search Box */}
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2.5">
              Search Products
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                <Search className="w-5 h-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, ID, barcode..."
                className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Normal Group Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2.5">
              Filter by Normal Group
            </label>
            <select
              value={filterNormalGroupId}
              onChange={(e) => {
                setFilterNormalGroupId(e.target.value);
                setFilterNormalSubgroupId(""); // Reset subgroup when group changes
              }}
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
            >
              <option value="">All Groups</option>
              {allNormalGroups.map((g) => (
                <option key={g.GroupID} value={g.GroupID}>
                  {g.GroupDescription}
                </option>
              ))}
            </select>
          </div>

          {/* Normal Subgroup Filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2.5">
              Filter by Normal Subgroup
            </label>
            <select
              value={filterNormalSubgroupId}
              onChange={(e) => setFilterNormalSubgroupId(e.target.value)}
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              disabled={!filterNormalGroupId || availableNormalSubgroups.length === 0}
            >
              <option value="">All Subgroups</option>
              {availableNormalSubgroups.map((sg) => (
                <option key={sg.SubGroupID} value={sg.SubGroupID}>
                  {sg.SubgroupDescription}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              Showing <span className="font-medium text-gray-900">{products.length}</span> of{" "}
              <span className="font-medium text-gray-900">{totalProductsCount}</span> products
            </span>
            {(searchTerm || filterNormalGroupId || filterNormalSubgroupId) && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setFilterNormalGroupId("");
                  setFilterNormalSubgroupId("");
                }}
                className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1.5 transition-colors"
              >
                <X className="w-4 h-4" />
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Save Button - Minimal Design */}
      {pendingChanges.size > 0 && (
        <div className="mb-6 flex items-center justify-between bg-white rounded-lg border border-gray-200 px-5 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50">
              <Save className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Products Table */}
      {loading && products.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Loading products...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Normal Group
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Normal Subgroup
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    QR Group
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    QR Subgroup
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Active
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                      {loading
                        ? "Loading products..."
                        : "No products match your search/filter criteria"}
                    </td>
                  </tr>
                ) : (
                  products.map((product) => {
                    const qrInfo = getQrProductInfo(product.ProductID);
                    const pending = pendingChanges.get(product.ProductID);
                    const hasPendingChanges = pendingChanges.has(product.ProductID);
                    const currentQrGroupId = pending?.QrGroupID ?? qrInfo?.QrGroupID;
                    const availableSubgroups = getAvailableSubgroups(currentQrGroupId);
                    return (
                      <tr
                        key={product.ProductID}
                        className={`transition-colors ${qrInfo ? "bg-green-50/30" : "hover:bg-gray-50"} ${hasPendingChanges ? "bg-blue-50/50 border-l-2 border-blue-400" : ""} ${isSaving && hasPendingChanges ? "opacity-60" : ""}`}
                      >
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {product.NormalGroupDescription || product.NormalGroupCode || "-"}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {product.NormalSubgroupDescription || product.NormalSubgroupCode || "-"}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div className="font-medium text-gray-900">
                            {product.Description || "Untitled"}
                          </div>
                          {product.DescriptionArabic && (
                            <div className="text-xs text-gray-500 mt-1">
                              {product.DescriptionArabic}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={pendingChanges.get(product.ProductID)?.QrGroupID ?? qrInfo?.QrGroupID ?? ""}
                            onChange={(e) => handleQrGroupChange(product.ProductID, e.target.value)}
                            disabled={isSaving}
                            className={`block w-full px-3 py-2 text-sm border rounded-md text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed ${
                              pendingChanges.has(product.ProductID) ? "border-blue-400 bg-blue-50/30" : "border-gray-300"
                            }`}
                          >
                            <option value="">- Select -</option>
                            {localQrGroups.map((g) => (
                              <option key={g.QrGroupID} value={g.QrGroupID}>
                                {g.GroupDescription || g.GroupCode || `Group ${g.QrGroupID}`}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={pendingChanges.get(product.ProductID)?.QrSubgroupID ?? qrInfo?.QrSubgroupID ?? ""}
                            onChange={(e) => handleQrSubgroupChange(product.ProductID, e.target.value)}
                            disabled={isSaving || (!pendingChanges.get(product.ProductID)?.QrGroupID && !qrInfo?.QrGroupID) || availableSubgroups.length === 0}
                            className={`block w-full px-3 py-2 text-sm border rounded-md text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed ${
                              pendingChanges.has(product.ProductID) ? "border-blue-400 bg-blue-50/30" : "border-gray-300"
                            }`}
                          >
                            <option value="">- Select -</option>
                            {availableSubgroups.map((sg) => (
                              <option key={sg.QrSubgroupID} value={sg.QrSubgroupID}>
                                {sg.SubgroupDescription || sg.SubgroupCode || `Subgroup ${sg.QrSubgroupID}`}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <input
                            type="checkbox"
                            data-product-id={product.ProductID}
                            checked={pendingChanges.get(product.ProductID)?.IsActive ?? qrInfo?.IsActive ?? false}
                            onChange={(e) => {
                              const newValue = e.target.checked;
                              const currentChecked = pendingChanges.get(product.ProductID)?.IsActive ?? qrInfo?.IsActive ?? false;
                              // If trying to check, validate first
                              const pending = pendingChanges.get(product.ProductID);
                              const hasQrGroup = pending?.QrGroupID || qrInfo?.QrGroupID;
                              if (newValue && !hasQrGroup) {
                                e.preventDefault(); // Prevent checkbox from being checked
                                showToast("Please choose the QR Group and Subgroup (if available) before activating the product.", "warning");
                                return;
                              }
                              handleActiveChange(product.ProductID, newValue, currentChecked);
                            }}
                            disabled={isSaving}
                            className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                              pendingChanges.has(product.ProductID) ? "ring-1 ring-blue-400" : ""
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

// Groups Tab Component
function GroupsTab({ groups, loading, onCreate, onEdit, onDelete }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">QR Groups</h2>
        <button onClick={onCreate} className="btn">
          <Plus className="w-5 h-5 mr-2" />
          Add Group
        </button>
      </div>

      {loading && groups.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No groups found. Create your first group to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <div key={group.QrGroupID} className="card p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{group.GroupDescription || "Untitled"}</h3>
                  {group.GroupDescriptionArabic && (
                    <p className="text-sm text-gray-600 mt-1">{group.GroupDescriptionArabic}</p>
                  )}
                  {group.GroupCode && (
                    <span className="inline-block mt-2 text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                      {group.GroupCode}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(group)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(group.QrGroupID)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                {group.IsActive ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="w-3 h-3" />
                    Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <XCircle className="w-3 h-3" />
                    Inactive
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Subgroups Tab Component
function SubgroupsTab({
  subgroups,
  groups,
  loading,
  selectedGroupForSubgroup,
  onGroupFilterChange,
  onCreate,
  onEdit,
  onDelete,
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">QR Subgroups</h2>
        <button onClick={onCreate} className="btn" disabled={groups.length === 0}>
          <Plus className="w-5 h-5 mr-2" />
          Add Subgroup
        </button>
      </div>

      {/* Group Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filter by Group (optional)
        </label>
        <select
          value={selectedGroupForSubgroup || ""}
          onChange={(e) => onGroupFilterChange(e.target.value ? Number(e.target.value) : null)}
          className="input max-w-xs"
        >
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g.QrGroupID} value={g.QrGroupID}>
              {g.GroupDescription || g.GroupCode || `Group ${g.QrGroupID}`}
            </option>
          ))}
        </select>
      </div>

      {loading && subgroups.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : subgroups.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {groups.length === 0
            ? "Create a group first before adding subgroups."
            : "No subgroups found. Create your first subgroup."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subgroups.map((subgroup) => (
            <div key={subgroup.QrSubgroupID} className="card p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">
                    {subgroup.SubgroupDescription || "Untitled"}
                  </h3>
                  {subgroup.SubgroupDescriptionArabic && (
                    <p className="text-sm text-gray-600 mt-1">
                      {subgroup.SubgroupDescriptionArabic}
                    </p>
                  )}
                  {subgroup.GroupDescription && (
                    <p className="text-xs text-gray-500 mt-1">
                      Group: {subgroup.GroupDescription}
                    </p>
                  )}
                  {subgroup.SubgroupCode && (
                    <span className="inline-block mt-2 text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                      {subgroup.SubgroupCode}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(subgroup)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(subgroup.QrSubgroupID)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                {subgroup.IsActive ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="w-3 h-3" />
                    Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <XCircle className="w-3 h-3" />
                    Inactive
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Group Modal Component
function GroupModal({ onClose, onSave, editingGroup, normalGroups = [] }) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    GroupID: null, // Optional reference to normal GroupMaster
    GroupDescription: "",
    GroupDescriptionArabic: "",
    GroupCode: "",
    SortOrder: 0,
    IsActive: true,
    keyshift: true,
  });

  useEffect(() => {
    if (editingGroup) {
      setFormData({
        GroupID: editingGroup.GroupID || null,
        GroupDescription: editingGroup.GroupDescription || "",
        GroupDescriptionArabic: editingGroup.GroupDescriptionArabic || "",
        GroupCode: editingGroup.GroupCode || "",
        SortOrder: editingGroup.SortOrder || 0,
        IsActive: editingGroup.IsActive !== undefined ? editingGroup.IsActive : true,
        keyshift: editingGroup.keyshift !== undefined ? editingGroup.keyshift : true,
      });
    } else {
      // Reset form when creating new group
      setFormData({
        GroupID: null,
        GroupDescription: "",
        GroupDescriptionArabic: "",
        GroupCode: "",
        SortOrder: 0,
        IsActive: true,
        keyshift: true,
      });
    }
  }, [editingGroup]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.GroupDescription.trim()) {
      alert("Please enter a group description");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (err) {
      console.error("Error saving group:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="p-6 border-b-2 border-gray-200 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
            <h2 className="text-2xl font-bold text-gray-900">
              {editingGroup ? "✏️ Edit QR Group" : "➕ Create New QR Group"}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded">
              <X className="w-6 h-6" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Link to Normal Group (Optional)
              </label>
              <select
                value={formData.GroupID || ""}
                onChange={(e) =>
                  setFormData({ ...formData, GroupID: e.target.value ? Number(e.target.value) : null })
                }
                className="input"
              >
                <option value="">None (Create new QR Group)</option>
                {normalGroups.map((g) => (
                  <option key={g.GroupID} value={g.GroupID}>
                    {g.GroupDescription} {g.GroupCode ? `(${g.GroupCode})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Optionally link this QR Group to an existing normal group
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Group Description (English) *
              </label>
              <input
                type="text"
                value={formData.GroupDescription}
                onChange={(e) => setFormData({ ...formData, GroupDescription: e.target.value })}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Group Description (Arabic)
              </label>
              <input
                type="text"
                value={formData.GroupDescriptionArabic}
                onChange={(e) =>
                  setFormData({ ...formData, GroupDescriptionArabic: e.target.value })
                }
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Group Code</label>
              <input
                type="text"
                value={formData.GroupCode}
                onChange={(e) => setFormData({ ...formData, GroupCode: e.target.value })}
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sort Order</label>
                <input
                  type="number"
                  value={formData.SortOrder}
                  onChange={(e) =>
                    setFormData({ ...formData, SortOrder: parseInt(e.target.value) || 0 })
                  }
                  className="input"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.IsActive}
                    onChange={(e) => setFormData({ ...formData, IsActive: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 border-t-2 border-gray-200">
              <div className="flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={onClose} 
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-all"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-8 py-3 rounded-lg font-bold text-base shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSaving}
                  style={{ minWidth: '150px', justifyContent: 'center' }}
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span className="font-bold">{editingGroup ? "UPDATE GROUP" : "SAVE GROUP"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Subgroup Modal Component
function SubgroupModal({ onClose, onSave, editingSubgroup, groups, selectedGroupId, normalSubgroups = [] }) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    QrGroupID: selectedGroupId || null,
    SubGroupID: null, // Optional reference to normal SubGroupMaster
    SubgroupDescription: "",
    SubgroupDescriptionArabic: "",
    SubgroupCode: "",
    SortOrder: 0,
    IsActive: true,
  });

  useEffect(() => {
    if (editingSubgroup) {
      setFormData({
        QrGroupID: editingSubgroup.QrGroupID,
        SubGroupID: editingSubgroup.SubGroupID || null,
        SubgroupDescription: editingSubgroup.SubgroupDescription || "",
        SubgroupDescriptionArabic: editingSubgroup.SubgroupDescriptionArabic || "",
        SubgroupCode: editingSubgroup.SubgroupCode || "",
        SortOrder: editingSubgroup.SortOrder || 0,
        IsActive: editingSubgroup.IsActive !== undefined ? editingSubgroup.IsActive : true,
      });
    } else if (selectedGroupId) {
      setFormData((prev) => ({ ...prev, QrGroupID: selectedGroupId, SubGroupID: null }));
    } else if (groups.length > 0 && !formData.QrGroupID) {
      setFormData((prev) => ({ ...prev, QrGroupID: groups[0].QrGroupID, SubGroupID: null }));
    }
  }, [editingSubgroup, groups, selectedGroupId]);
  
  // Filter normal subgroups based on selected QR Group (if we can determine the normal GroupID)
  const getAvailableNormalSubgroups = () => {
    if (!formData.QrGroupID) return normalSubgroups;
    // Try to find the normal GroupID from the selected QR Group
    const selectedQrGroup = groups.find(g => g.QrGroupID === formData.QrGroupID);
    if (selectedQrGroup?.GroupID) {
      return normalSubgroups.filter(sg => sg.GroupID === selectedQrGroup.GroupID);
    }
    return normalSubgroups;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.QrGroupID) {
      alert("Please select a QR group");
      return;
    }
    if (!formData.SubgroupDescription.trim()) {
      alert("Please enter a subgroup description");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (err) {
      console.error("Error saving subgroup:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="p-6 border-b-2 border-gray-200 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
            <h2 className="text-2xl font-bold text-gray-900">
              {editingSubgroup ? "✏️ Edit QR Subgroup" : "➕ Create New QR Subgroup"}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded">
              <X className="w-6 h-6" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Parent QR Group *
              </label>
              <select
                value={formData.QrGroupID || ""}
                onChange={(e) =>
                  setFormData({ ...formData, QrGroupID: Number(e.target.value), SubGroupID: null })
                }
                className="input"
                required
                disabled={!!selectedGroupId}
              >
                <option value="">Select a QR group</option>
                {groups.map((g) => (
                  <option key={g.QrGroupID} value={g.QrGroupID}>
                    {g.GroupDescription || g.GroupCode || `Group ${g.QrGroupID}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Link to Normal Subgroup (Optional)
              </label>
              <select
                value={formData.SubGroupID || ""}
                onChange={(e) =>
                  setFormData({ ...formData, SubGroupID: e.target.value ? Number(e.target.value) : null })
                }
                className="input"
                disabled={!formData.QrGroupID}
              >
                <option value="">None (Create new QR Subgroup)</option>
                {getAvailableNormalSubgroups().map((sg) => (
                  <option key={sg.SubGroupID} value={sg.SubGroupID}>
                    {sg.SubgroupDescription} {sg.SubgroupCode ? `(${sg.SubgroupCode})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Optionally link this QR Subgroup to an existing normal subgroup
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subgroup Description (English) *
              </label>
              <input
                type="text"
                value={formData.SubgroupDescription}
                onChange={(e) =>
                  setFormData({ ...formData, SubgroupDescription: e.target.value })
                }
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subgroup Description (Arabic)
              </label>
              <input
                type="text"
                value={formData.SubgroupDescriptionArabic}
                onChange={(e) =>
                  setFormData({ ...formData, SubgroupDescriptionArabic: e.target.value })
                }
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subgroup Code</label>
              <input
                type="text"
                value={formData.SubgroupCode}
                onChange={(e) => setFormData({ ...formData, SubgroupCode: e.target.value })}
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sort Order</label>
                <input
                  type="number"
                  value={formData.SortOrder}
                  onChange={(e) =>
                    setFormData({ ...formData, SortOrder: parseInt(e.target.value) || 0 })
                  }
                  className="input"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.IsActive}
                    onChange={(e) => setFormData({ ...formData, IsActive: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 border-t-2 border-gray-200">
              <div className="flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={onClose} 
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-all"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-8 py-3 rounded-lg font-bold text-base shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSaving}
                  style={{ minWidth: '150px', justifyContent: 'center' }}
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span className="font-bold">{editingSubgroup ? "UPDATE SUBGROUP" : "SAVE SUBGROUP"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Package Management Tab Component
function PackageManagementTab({ groups, subgroups, loading }) {
  const [selectedSubgroup, setSelectedSubgroup] = useState("");
  const [packageHeaders, setPackageHeaders] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [packageContents, setPackageContents] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showCreatePackageModal, setShowCreatePackageModal] = useState(false);
  const [newPackageForm, setNewPackageForm] = useState({
    name: "",
    nameArabic: "",
    description: "",
    price: "",
    image: null,
  });

  // Filter subgroups to only show "PACKAGES" subgroups
  const packageSubgroups = subgroups.filter(sg => 
    sg.SubgroupDescription?.toLowerCase().includes('package')
  );

  useEffect(() => {
    if (selectedSubgroup) {
      loadPackageHeaders();
    }
  }, [selectedSubgroup]);

  useEffect(() => {
    if (selectedPackage) {
      loadPackageContents();
    }
  }, [selectedPackage]);

  const loadPackageHeaders = async () => {
    try {
      setLoadingPackages(true);
      const packages = await getPackageHeaders(parseInt(selectedSubgroup));
      setPackageHeaders(packages || []);
    } catch (err) {
      console.error("Error loading packages:", err);
    } finally {
      setLoadingPackages(false);
    }
  };

  const loadPackageContents = async () => {
    try {
      const contents = await getPackageItems(selectedPackage.ProductID);
      setPackageContents(contents || []);
    } catch (err) {
      console.error("Error loading package contents:", err);
    }
  };

  const loadAllProductsList = async () => {
    try {
      const products = await getAllProductsFromMaster({});
      setAllProducts(products || []);
    } catch (err) {
      console.error("Error loading products:", err);
    }
  };

  const handleCreateNewPackage = async (e) => {
    e.preventDefault();
    
    if (!newPackageForm.name.trim()) {
      alert("Please enter package name!");
      return;
    }
    
    if (!newPackageForm.price || parseFloat(newPackageForm.price) <= 0) {
      alert("Please enter a valid price!");
      return;
    }
    
    try {
      console.log("[CREATE-PACKAGE] Submitting:", {
        description: newPackageForm.name,
        price: newPackageForm.price,
        qrSubgroupId: selectedSubgroup,
      });
      
      // Create the package product
      const result = await createNewPackage({
        description: newPackageForm.name,
        descriptionArabic: newPackageForm.nameArabic || newPackageForm.name,
        shortDescription: newPackageForm.description || newPackageForm.name,
        price: parseFloat(newPackageForm.price),
        qrSubgroupId: parseInt(selectedSubgroup),
        cloudinaryUrl: null, // TODO: Add image upload later
      });
      
      console.log("[CREATE-PACKAGE] Result:", result);
      
      alert("✅ Package created successfully!");
      setShowCreatePackageModal(false);
      setNewPackageForm({ name: "", nameArabic: "", description: "", price: "", image: null });
      loadPackageHeaders();
    } catch (err) {
      console.error("[CREATE-PACKAGE] Error:", err);
      alert("❌ Error creating package: " + (err.response?.data?.message || err.message));
    }
  };

  const handleAddItemToPackage = async (productId, displayOrder) => {
    try {
      await addProductToPackage(productId, selectedPackage.ProductID, displayOrder);
      alert("Item added to package!");
      loadPackageContents();
      setShowAddItemModal(false);
    } catch (err) {
      alert("Error adding item: " + err.message);
    }
  };

  const handleRemoveItem = async (productId) => {
    if (!confirm("Remove this item from package?")) return;
    try {
      await removeProductFromPackage(productId);
      alert("Item removed!");
      loadPackageContents();
    } catch (err) {
      alert("Error removing item: " + err.message);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">📦 Package Management</h2>
        <p className="text-gray-600">
          Create packages (like "70 AED - Opaia Levantine Breakfast") and add items to them.
        </p>
      </div>

      {/* Step 1: Select Package Subgroup */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Step 1: Select Package Subgroup</h3>
        <select
          value={selectedSubgroup}
          onChange={(e) => {
            setSelectedSubgroup(e.target.value);
            setSelectedPackage(null);
          }}
          className="input max-w-md"
        >
          <option value="">-- Select PACKAGES Subgroup --</option>
          {packageSubgroups.map((sg) => (
            <option key={sg.QrSubgroupID} value={sg.QrSubgroupID}>
              {sg.SubgroupDescription} (ID: {sg.QrSubgroupID})
            </option>
          ))}
        </select>
        {packageSubgroups.length === 0 && (
          <p className="text-sm text-amber-600 mt-2">
            ⚠️ No PACKAGES subgroups found. Create a subgroup with "packages" in the name first!
          </p>
        )}
      </div>

      {/* Step 2: View/Create Packages */}
      {selectedSubgroup && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Step 2: Packages in this Subgroup</h3>
            <button
              onClick={() => setShowCreatePackageModal(true)}
              className="btn"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create New Package
            </button>
          </div>

          {loadingPackages ? (
            <div className="text-center py-8 text-gray-500">Loading packages...</div>
          ) : packageHeaders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No packages yet. Click "Create Package" to add one.</p>
              <p className="text-sm mt-2">Enter the ProductID of an existing product to mark it as a package.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {packageHeaders.map((pkg) => (
                <div
                  key={pkg.ProductID}
                  className={`card p-4 cursor-pointer transition ${
                    selectedPackage?.ProductID === pkg.ProductID
                      ? "ring-2 ring-blue-500"
                      : "hover:shadow-lg"
                  }`}
                  onClick={() => setSelectedPackage(pkg)}
                >
                  <h4 className="font-semibold text-gray-900 mb-2">{pkg.Description}</h4>
                  <p className="text-sm text-gray-600 mb-2">
                    Price: AED {(pkg.price || 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Product ID: {pkg.ProductID}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Manage Package Items */}
      {selectedPackage && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              Step 3: Items in "{selectedPackage.Description}"
            </h3>
            <button
              onClick={() => {
                loadAllProductsList();
                setShowAddItemModal(true);
              }}
              className="btn"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Item
            </button>
          </div>

          {packageContents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No items in this package yet.</p>
              <p className="text-sm mt-2">Click "Add Item" to add products to this package.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {packageContents.map((item, index) => (
                <div
                  key={item.ProductID}
                  className="flex items-center justify-between bg-gray-50 rounded-lg p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-rose-600 text-white font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{item.Description}</h4>
                      <p className="text-sm text-gray-600">
                        Product ID: {item.ProductID} | Order: {item.DisplayOrder}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveItem(item.ProductID)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Remove"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddItemModal(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-xl font-semibold">Add Item to Package</h3>
                <button onClick={() => setShowAddItemModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                {allProducts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">Loading products...</div>
                ) : (
                  <div className="space-y-2">
                    {allProducts.slice(0, 50).map((product) => (
                      <div
                        key={product.ProductID}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{product.Description}</p>
                          <p className="text-sm text-gray-600">ID: {product.ProductID}</p>
                        </div>
                        <button
                          onClick={() => {
                            const order = prompt("Display order (1, 2, 3...):", (packageContents.length + 1).toString());
                            if (order) handleAddItemToPackage(product.ProductID, parseInt(order));
                          }}
                          className="btn-ghost"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Package Modal */}
      {showCreatePackageModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreatePackageModal(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
              <form onSubmit={handleCreateNewPackage}>
                <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="text-xl font-semibold">📦 Create New Package</h3>
                  <button 
                    type="button"
                    onClick={() => setShowCreatePackageModal(false)} 
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="p-6 space-y-4">
                  {/* Package Name (English) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Package Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newPackageForm.name}
                      onChange={(e) => setNewPackageForm({ ...newPackageForm, name: e.target.value })}
                      placeholder="e.g., 70 AED - Opaia Levantine Breakfast"
                      className="input w-full"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">This will be shown to customers</p>
                  </div>

                  {/* Package Name (Arabic) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Package Name (Arabic)
                    </label>
                    <input
                      type="text"
                      value={newPackageForm.nameArabic}
                      onChange={(e) => setNewPackageForm({ ...newPackageForm, nameArabic: e.target.value })}
                      placeholder="اسم الحزمة بالعربية"
                      className="input w-full"
                      dir="rtl"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={newPackageForm.description}
                      onChange={(e) => setNewPackageForm({ ...newPackageForm, description: e.target.value })}
                      placeholder="Brief description of the package..."
                      className="input w-full"
                      rows="3"
                    />
                  </div>

                  {/* Price */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Price (AED) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newPackageForm.price}
                      onChange={(e) => setNewPackageForm({ ...newPackageForm, price: e.target.value })}
                      placeholder="70.00"
                      className="input w-full"
                      required
                    />
                  </div>

                  {/* Image Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Package Image
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setNewPackageForm({ ...newPackageForm, image: e.target.files[0] })}
                      className="input w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">Upload an attractive image for the package</p>
                  </div>

                  {/* Preview */}
                  {newPackageForm.name && (
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <h4 className="font-bold text-lg text-gray-900">{newPackageForm.name}</h4>
                        {newPackageForm.description && (
                          <p className="text-sm text-gray-600 mt-1">{newPackageForm.description}</p>
                        )}
                        {newPackageForm.price && (
                          <p className="text-lg font-bold text-rose-600 mt-2">AED {parseFloat(newPackageForm.price).toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                  <button 
                    type="button" 
                    onClick={() => setShowCreatePackageModal(false)} 
                    className="btn-ghost"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn">
                    <Plus className="w-5 h-5 mr-2" />
                    Create Package
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Assignment Confirmation Modal
function AssignmentModal({ onClose, onConfirm, selectedCount, groupName, subgroupName }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold">Confirm Assignment</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-gray-700">
              Assign <strong>{selectedCount}</strong> product(s) to:
            </p>
            <div className="bg-gray-50 p-4 rounded-xl">
              <div className="font-medium">Group: {groupName}</div>
              {subgroupName && <div className="text-sm text-gray-600 mt-1">Subgroup: {subgroupName}</div>}
            </div>
            <p className="text-sm text-gray-500">
              Products will be added to the QR menu. You can remove them later if needed.
            </p>
          </div>
          <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={onConfirm} className="btn">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
