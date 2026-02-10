// src/store/cartStore.js
import { create } from "zustand";

const META_KEY = "qr.tableMeta";

const getInitialMeta = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("Failed to parse table meta", err);
    return {};
  }
};

const persistMeta = (meta) => {
  if (typeof window === "undefined") return;
  try {
    if (meta?.tableId) {
      window.localStorage.setItem(META_KEY, JSON.stringify(meta));
    } else {
      window.localStorage.removeItem(META_KEY);
    }
  } catch (err) {
    console.warn("Failed to persist table meta", err);
  }
};

const TOKEN_KEY = "qr.tableToken";

const getInitialToken = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch (err) {
    console.warn("Failed to parse table token", err);
    return null;
  }
};

const persistToken = (token) => {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch (err) {
    console.warn("Failed to persist table token", err);
  }
};

export const useCart = create((set, get) => {
  const initialMeta = getInitialMeta();
  const initialToken = getInitialToken();

  return {
  items: [], // { _k, id, name, basePrice, mods:[{id?,name,price}], price, qty, product }
  note: "",
    tableId: initialMeta.tableId ?? null, // Table ID from QR code token
    tableArea: initialMeta.tableArea ?? null, // Area name
    tableAreaId: initialMeta.tableAreaId ?? null, // Area ID
    tableNo: initialMeta.tableNo ?? null, // Table number (display)
    tableName: initialMeta.tableName ?? null, // Table name (display)
  token: initialToken ?? null, // QR code token for navigation to payment page

  // Normalize incoming mods: [{ id?, name?/label?, price?, raw? }]
  _normalizeMods(mods) {
    return (Array.isArray(mods) ? mods : []).map((m) => ({
      id: m.id ?? m.ModifierID ?? m.modId ?? null,
      name: m.name ?? m.label ?? m.Modifier ?? m.raw?.Modifier ?? String(m),
      price: Number(m.price || 0),
    }));
  },

  // Build key from product + mods (prefer stable ids, fallback to name)
  _buildKey(prod, normMods) {
    return JSON.stringify({
      id: prod.id,
      mods: normMods.map((m) => m.id ?? m.name).sort(),
    });
  },

  add: (prod, selectedMods = []) => {
    const normMods = get()._normalizeMods(selectedMods);
    const key = get()._buildKey(prod, normMods);

    const items = get().items.slice();
    const i = items.findIndex((x) => x._k === key);

    const linePrice =
      Number(prod.price || 0) +
      normMods.reduce((s, m) => s + Number(m.price || 0), 0);

    if (i >= 0) {
      items[i] = { ...items[i], qty: items[i].qty + 1 };
    } else {
      items.push({
        _k: key,
        id: prod.id,
        name: prod.name,
        basePrice: Number(prod.price || 0),
          mods: normMods, // normalized
        price: linePrice,
        qty: 1,
          product: prod, // snapshot
      });
    }
    set({ items });
  },

  // ✅ Update modifiers for an existing line (by oldKey). If a line with the
  // new combo already exists, merge quantities.
  updateMods: (oldKey, prod, selectedMods = []) =>
    set((state) => {
      const idx = state.items.findIndex((x) => x._k === oldKey);
      if (idx === -1) return {}; // nothing to update

      const oldLine = state.items[idx];
      const normMods = get()._normalizeMods(selectedMods);
      const newKey = get()._buildKey(prod, normMods);
      const newPrice =
        Number(prod.price || 0) +
        normMods.reduce((s, m) => s + Number(m.price || 0), 0);

      // no change in combo: just refresh mods/price
      if (newKey === oldKey) {
        const copy = state.items.slice();
        copy[idx] = { ...oldLine, mods: normMods, price: newPrice };
        return { items: copy };
      }

      // migrate or merge
      const copy = state.items.slice();
      const existingIdx = copy.findIndex((x) => x._k === newKey);

      if (existingIdx >= 0) {
        // merge qty into existing
        const tgt = copy[existingIdx];
        copy[existingIdx] = { ...tgt, qty: tgt.qty + oldLine.qty, price: newPrice };
        copy.splice(idx, 1); // remove old
      } else {
        // rewrite the line in place with new key/mods/price
        copy[idx] = { ...oldLine, _k: newKey, mods: normMods, price: newPrice };
      }

      return { items: copy };
    }),

  inc: (k) =>
    set((state) => ({
      items: state.items.map((x) =>
        x._k === k ? { ...x, qty: x.qty + 1 } : x
      ),
    })),

  // when qty is 1, remove the line
  dec: (k) =>
    set((state) => {
      const idx = state.items.findIndex((x) => x._k === k);
      if (idx === -1) return {};
      const it = state.items[idx];
      if (it.qty > 1) {
        return {
          items: state.items.map((x) =>
            x._k === k ? { ...x, qty: x.qty - 1 } : x
          ),
        };
      } else {
        return { items: state.items.filter((x) => x._k !== k) };
      }
    }),

  remove: (k) =>
    set((state) => ({ items: state.items.filter((x) => x._k !== k) })),

  clear: () => set({ items: [], note: "" }),
  setNote: (note) => set({ note }),
    setTableId: (tableId, tableArea = null, tableAreaId = null, tableNo = null, tableName = null) =>
      set((state) => {
        const next = {
          tableId: tableId ?? null,
          tableArea: tableId
            ? tableArea ?? state.tableArea ?? null
            : null,
          tableAreaId: tableId
            ? tableAreaId ?? state.tableAreaId ?? null
            : null,
          tableNo: tableId ? (tableNo ?? state.tableNo ?? null) : null,
          tableName: tableId ? (tableName ?? state.tableName ?? null) : null,
        };
        persistMeta(next);
        return next;
      }),
    clearTableMeta: () => {
      persistMeta({});
      persistToken(null);
      set({ tableId: null, tableArea: null, tableAreaId: null, tableNo: null, tableName: null, token: null });
    },
  setToken: (token) => {
    persistToken(token);
    set({ token });
  },
  subtotal: () =>
    get().items.reduce((s, x) => s + Number(x.price) * Number(x.qty), 0),
  };
});
