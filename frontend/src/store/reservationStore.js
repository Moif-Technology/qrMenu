// frontend/src/store/reservationStore.js
import { create } from "zustand";
import { formatLocalDate } from "../utils/date";

export const useReservationStore = create((set, get) => ({
  // State
  selectedDate: formatLocalDate(), // Today by default, local timezone
  selectedAreaId: null,
  areas: [],
  tables: [],
  reservations: [],
  walkIns: [],
  waitlist: [],
  
  // UI State
  showWalkInModal: false,
  showReservationModal: false,
  showWaitlistView: false,
  showReservationList: false,
  showTableActionDrawer: false,
  selectedTable: null,
  
  // Counters
  availableTablesCount: 0,
  reservedCount: 0,
  walkInsCount: 0,
  waitlistCount: 0,
  
  // Actions
  setSelectedDate: (date) => set({ selectedDate: date }),
  setSelectedAreaId: (areaId) => set({ selectedAreaId: areaId }),
  setAreas: (areas) => set({ areas }),
  // Batch update for areas and selectedAreaId to prevent flickering
  initializeAreas: (areas, selectedAreaId) => set({ areas, selectedAreaId }),
  setTables: (tables) => {
    const available = tables.filter(t => t.status === 'Available').length;
    const reserved = tables.filter(t => t.status === 'Reserved').length;
    set({ 
      tables,
      availableTablesCount: available,
      reservedCount: reserved
    });
  },
  setReservations: (reservations) => set({ reservations }),
  setWalkIns: (walkIns) => {
    set({ 
      walkIns,
      walkInsCount: walkIns.length
    });
  },
  setWaitlist: (waitlist) => {
    set({ 
      waitlist,
      waitlistCount: waitlist.length
    });
  },
  
  // UI Actions
  openWalkInModal: () => set({ showWalkInModal: true }),
  closeWalkInModal: () => set({ showWalkInModal: false }),
  openReservationModal: () => set({ showReservationModal: true }),
  closeReservationModal: () => set({ showReservationModal: false }),
  openWaitlistView: () => set({ showWaitlistView: true }),
  closeWaitlistView: () => set({ showWaitlistView: false }),
  openReservationList: () => set({ showReservationList: true }),
  closeReservationList: () => set({ showReservationList: false }),
  openTableActionDrawer: (table) => set({ showTableActionDrawer: true, selectedTable: table }),
  closeTableActionDrawer: () => set({ showTableActionDrawer: false, selectedTable: null }),
  
  // Helper: Get table by ID
  getTableById: (tableId) => {
    return get().tables.find(t => t.id === tableId || t.number === tableId);
  },
  
  // Helper: Get reservations for a table
  getReservationsForTable: (tableId) => {
    return get().reservations.filter(r => r.tableId === tableId);
  },
  
  // Helper: Update table status
  updateTableStatus: (tableId, status, reservationInfo = null) => {
    const tables = get().tables.map(t => {
      if (t.id === tableId || t.number === tableId) {
        return { ...t, status, reservationInfo };
      }
      return t;
    });
    get().setTables(tables);
  }
}));
