import { useEffect, useState } from "react";
import { Package, FolderTree, Folder, Boxes } from "lucide-react";
import {
  createQrGroup, createQrMainGroup, createQrSubgroup,
  deleteQrGroup, deleteQrMainGroup, deleteQrSubgroup,
  getAllProductsFromMaster, getQrGroups, getQrMainGroups, getQrProducts, getQrSubgroups,
  updateQrGroup, updateQrMainGroup, updateQrProductAssignment, updateQrSubgroup,
} from "../../services/qrMenu.service";
import {
  ProductsTab, MainGroupsTab, GroupsTab, SubgroupsTab, PackageManagementTab,
  MainGroupModal, GroupModal, SubgroupModal,
} from "../QRMenuManagement";

const TABS = {
  PRODUCTS: "products",
  MAIN_GROUPS: "mainGroups",
  GROUPS: "groups",
  SUBGROUPS: "subgroups",
  PACKAGES: "packages",
};

const TAB_DEFS = [
  { id: TABS.PRODUCTS, label: "Products", icon: Package },
  { id: TABS.MAIN_GROUPS, label: "Main Groups", icon: FolderTree },
  { id: TABS.GROUPS, label: "Groups", icon: Folder },
  { id: TABS.SUBGROUPS, label: "Subgroups", icon: FolderTree },
  { id: TABS.PACKAGES, label: "Packages", icon: Boxes },
];

export default function AdminMenu() {
  const [activeTab, setActiveTab] = useState(TABS.PRODUCTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [allProducts, setAllProducts] = useState([]);
  const [qrProductsMap, setQrProductsMap] = useState(new Map());
  const [totalProductsCount, setTotalProductsCount] = useState(0);
  const [qrProductsRefreshKey, setQrProductsRefreshKey] = useState(0);

  const [mainGroups, setMainGroups] = useState([]);
  const [groups, setGroups] = useState([]);
  const [subgroups, setSubgroups] = useState([]);
  const [showMainGroupModal, setShowMainGroupModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showSubgroupModal, setShowSubgroupModal] = useState(false);
  const [editingMainGroup, setEditingMainGroup] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingSubgroup, setEditingSubgroup] = useState(null);
  const [selectedGroupForSubgroup, setSelectedGroupForSubgroup] = useState(null);
  const [normalGroups, setNormalGroups] = useState([]);
  const [normalSubgroups, setNormalSubgroups] = useState([]);

  useEffect(() => {
    loadAllProductsData({});
    loadMainGroups();
    loadGroups();
    loadSubgroups();
    loadQrProducts();
  }, []);

  useEffect(() => {
    if (activeTab === TABS.SUBGROUPS) loadSubgroups();
  }, [activeTab]);

  const loadAllProductsData = async (filters = {}) => {
    try {
      setLoading(true);
      setError("");
      const data = await getAllProductsFromMaster(filters);
      const list = data || [];
      setAllProducts(list);
      setTotalProductsCount(list.length);
      const uniqueGroups = Array.from(new Map(
        list.filter((p) => p.GroupID).map((p) => [p.GroupID, {
          GroupID: p.GroupID,
          GroupDescription: p.NormalGroupDescription || p.NormalGroupCode || `Group ${p.GroupID}`,
          GroupCode: p.NormalGroupCode,
        }])
      ).values()).sort((a, b) => (a.GroupDescription || "").localeCompare(b.GroupDescription || ""));
      const uniqueSubgroups = Array.from(new Map(
        list.filter((p) => p.SubGroupID).map((p) => [p.SubGroupID, {
          SubGroupID: p.SubGroupID,
          SubgroupDescription: p.NormalSubgroupDescription || p.NormalSubgroupCode || `Subgroup ${p.SubGroupID}`,
          SubgroupCode: p.NormalSubgroupCode,
          GroupID: p.GroupID,
        }])
      ).values()).sort((a, b) => (a.SubgroupDescription || "").localeCompare(b.SubgroupDescription || ""));
      setNormalGroups(uniqueGroups);
      setNormalSubgroups(uniqueSubgroups);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const loadAllProducts = (filters = {}) => loadAllProductsData(filters);

  const loadMainGroups = async () => {
    try { setMainGroups((await getQrMainGroups()) || []); } catch (e) { console.error("Failed to load main groups:", e); }
  };
  const loadGroups = async () => {
    try { setGroups((await getQrGroups()) || []); } catch (e) { console.error("Failed to load groups:", e); }
  };
  const loadSubgroups = async (groupId = null) => {
    try { setSubgroups((await getQrSubgroups(groupId)) || []); } catch (e) { console.error("Failed to load subgroups:", e); }
  };
  const loadQrProducts = async () => {
    try {
      const data = await getQrProducts({});
      const map = new Map();
      (data || []).forEach((p) => map.set(p.ProductID, p));
      setQrProductsMap(map);
      setQrProductsRefreshKey((prev) => prev + 1);
    } catch (e) { console.error("Failed to load QR products:", e); }
  };

  const getQrProductInfo = (productId) => qrProductsMap.get(productId) || null;

  const handleUpdateProduct = async (productId, updateData) => {
    try {
      setLoading(true); setError("");
      await updateQrProductAssignment(productId, updateData);
      await loadQrProducts();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Failed to update product");
      throw err;
    } finally { setLoading(false); }
  };

  // Main group handlers
  const handleCreateMainGroup = () => { setEditingMainGroup(null); setShowMainGroupModal(true); };
  const handleEditMainGroup = (mg) => { setEditingMainGroup(mg); setShowMainGroupModal(true); };
  const handleSaveMainGroup = async (data) => {
    try {
      setLoading(true); setError("");
      if (editingMainGroup) await updateQrMainGroup(editingMainGroup.QrMainGroupID, data);
      else await createQrMainGroup(data);
      setShowMainGroupModal(false); setEditingMainGroup(null);
      await loadMainGroups();
    } catch (err) { setError(err?.response?.data?.error || err.message || "Failed to save main group"); }
    finally { setLoading(false); }
  };
  const handleDeleteMainGroup = async (id) => {
    if (!window.confirm("Delete this main group? QR groups must be reassigned first.")) return;
    try {
      setLoading(true); setError("");
      await deleteQrMainGroup(id);
      await loadMainGroups(); await loadGroups();
    } catch (err) { setError(err?.response?.data?.error || err.message || "Failed to delete main group"); }
    finally { setLoading(false); }
  };

  // Group handlers
  const handleCreateGroup = () => { setEditingGroup(null); setShowGroupModal(true); };
  const handleEditGroup = (g) => { setEditingGroup(g); setShowGroupModal(true); };
  const handleSaveGroup = async (data) => {
    try {
      setLoading(true); setError("");
      if (editingGroup) await updateQrGroup(editingGroup.QrGroupID, data);
      else await createQrGroup(data);
      setShowGroupModal(false); setEditingGroup(null);
      await loadGroups();
    } catch (err) { setError(err?.response?.data?.error || err.message || "Failed to save group"); }
    finally { setLoading(false); }
  };
  const handleDeleteGroup = async (id) => {
    if (!window.confirm("Delete this group? Subgroups will also be deleted.")) return;
    try {
      setLoading(true); setError("");
      await deleteQrGroup(id);
      await loadGroups(); await loadSubgroups(); await loadQrProducts();
    } catch (err) { setError(err?.response?.data?.error || err.message || "Failed to delete group"); }
    finally { setLoading(false); }
  };

  // Subgroup handlers
  const handleCreateSubgroup = () => {
    if (groups.length === 0) { alert("Please create a group first"); return; }
    setEditingSubgroup(null); setShowSubgroupModal(true);
  };
  const handleEditSubgroup = (sg) => { setEditingSubgroup(sg); setShowSubgroupModal(true); };
  const handleSaveSubgroup = async (data) => {
    try {
      setLoading(true); setError("");
      if (editingSubgroup) await updateQrSubgroup(editingSubgroup.QrSubgroupID, data);
      else await createQrSubgroup(data);
      setShowSubgroupModal(false); setEditingSubgroup(null);
      await loadSubgroups(selectedGroupForSubgroup); await loadQrProducts();
    } catch (err) { setError(err?.response?.data?.error || err.message || "Failed to save subgroup"); }
    finally { setLoading(false); }
  };
  const handleDeleteSubgroup = async (id) => {
    if (!window.confirm("Delete this subgroup?")) return;
    try {
      setLoading(true); setError("");
      await deleteQrSubgroup(id);
      await loadSubgroups(selectedGroupForSubgroup); await loadQrProducts();
    } catch (err) { setError(err?.response?.data?.error || err.message || "Failed to delete subgroup"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-7">
      <div>
        <p className="admin-eyebrow">The kitchen · catalogue</p>
        <h1 className="font-display text-[40px] sm:text-[48px] leading-[0.95] text-[var(--ink)] mt-1">Menu</h1>
        <p className="text-[15px] text-[var(--ink-faint)] mt-3 max-w-lg">
          Curate what appears on the QR menu — products, groups, subgroups and packages.
        </p>
      </div>

      {/* Editorial tab bar */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-px">
        {TAB_DEFS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative inline-flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-[14px] font-semibold transition-colors ${
                active ? "text-[var(--ink)]" : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span className={`absolute left-3 right-3 -bottom-px h-[2px] rounded-full transition-all ${active ? "bg-[var(--brass)]" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl bg-[#F6E7E2] border border-[#E3C4BB] text-[var(--danger)] text-sm px-4 py-3">{error}</div>
      )}

      <div className="admin-menu-legacy">
        {activeTab === TABS.MAIN_GROUPS && (
          <MainGroupsTab mainGroups={mainGroups} loading={loading} onCreate={handleCreateMainGroup} onEdit={handleEditMainGroup} onDelete={handleDeleteMainGroup} />
        )}
        {activeTab === TABS.PRODUCTS && (
          <ProductsTab
            key={`products-${qrProductsRefreshKey}`}
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
          <GroupsTab groups={groups} mainGroups={mainGroups} loading={loading} onCreate={handleCreateGroup} onEdit={handleEditGroup} onDelete={handleDeleteGroup} />
        )}
        {activeTab === TABS.SUBGROUPS && (
          <SubgroupsTab
            subgroups={subgroups}
            groups={groups}
            loading={loading}
            selectedGroupForSubgroup={selectedGroupForSubgroup}
            onGroupFilterChange={(groupId) => { setSelectedGroupForSubgroup(groupId); loadSubgroups(groupId); }}
            onCreate={handleCreateSubgroup}
            onEdit={handleEditSubgroup}
            onDelete={handleDeleteSubgroup}
          />
        )}
        {activeTab === TABS.PACKAGES && (
          <PackageManagementTab groups={groups} subgroups={subgroups} loading={loading} />
        )}
      </div>

      {showMainGroupModal && (
        <MainGroupModal onClose={() => { setShowMainGroupModal(false); setEditingMainGroup(null); }} onSave={handleSaveMainGroup} editingMainGroup={editingMainGroup} />
      )}
      {showGroupModal && (
        <GroupModal onClose={() => { setShowGroupModal(false); setEditingGroup(null); }} onSave={handleSaveGroup} editingGroup={editingGroup} normalGroups={normalGroups} mainGroups={mainGroups} />
      )}
      {showSubgroupModal && (
        <SubgroupModal onClose={() => { setShowSubgroupModal(false); setEditingSubgroup(null); }} onSave={handleSaveSubgroup} editingSubgroup={editingSubgroup} groups={groups} selectedGroupId={editingSubgroup?.QrGroupID || selectedGroupForSubgroup} normalSubgroups={normalSubgroups} />
      )}
    </div>
  );
}
