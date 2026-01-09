// frontend/src/services/reservation.mock.js
// Dummy reservation data for testing

const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const dayAfter = new Date(tomorrow);
dayAfter.setDate(dayAfter.getDate() + 1);

const formatDate = (date) => date.toISOString().split("T")[0];

export const mockReservations = [
  // Today's Lunch Reservations (11:00 - 14:00)
  {
    reservationId: 1,
    customerName: "John Smith",
    customerPhone: "+1 234-567-8901",
    customerEmail: "john.smith@email.com",
    reservationDate: formatDate(today),
    reservationTime: "11:00",
    numberOfGuests: 2,
    status: "CONFIRMED",
    tableId: 5,
    specialRequests: "Window seat preferred"
  },
  {
    reservationId: 2,
    customerName: "Sarah Johnson",
    customerPhone: "+1 234-567-8902",
    customerEmail: "sarah.j@email.com",
    reservationDate: formatDate(today),
    reservationTime: "11:30",
    numberOfGuests: 4,
    status: "CONFIRMED",
    tableId: 12,
    specialRequests: "Birthday celebration"
  },
  {
    reservationId: 3,
    customerName: "Michael Chen",
    customerPhone: "+1 234-567-8903",
    reservationDate: formatDate(today),
    reservationTime: "12:00",
    numberOfGuests: 3,
    status: "ARRIVED",
    tableId: 8,
    specialRequests: ""
  },
  {
    reservationId: 4,
    customerName: "Emily Davis",
    customerPhone: "+1 234-567-8904",
    customerEmail: "emily.d@email.com",
    reservationDate: formatDate(today),
    reservationTime: "12:30",
    numberOfGuests: 2,
    status: "SEATED",
    tableId: 3,
    specialRequests: "Vegetarian options"
  },
  {
    reservationId: 5,
    customerName: "Robert Wilson",
    customerPhone: "+1 234-567-8905",
    reservationDate: formatDate(today),
    reservationTime: "13:00",
    numberOfGuests: 6,
    status: "CONFIRMED",
    tableId: null,
    specialRequests: "Large group"
  },
  {
    reservationId: 6,
    customerName: "Lisa Anderson",
    customerPhone: "+1 234-567-8906",
    reservationDate: formatDate(today),
    reservationTime: "13:30",
    numberOfGuests: 2,
    status: "CANCELLED",
    tableId: null,
    specialRequests: ""
  },

  // Today's Sunset Reservations (16:00 - 18:00)
  {
    reservationId: 7,
    customerName: "David Brown",
    customerPhone: "+1 234-567-8907",
    customerEmail: "david.b@email.com",
    reservationDate: formatDate(today),
    reservationTime: "16:00",
    numberOfGuests: 2,
    status: "CONFIRMED",
    tableId: 7,
    specialRequests: "Outdoor seating"
  },
  {
    reservationId: 8,
    customerName: "Jennifer Martinez",
    customerPhone: "+1 234-567-8908",
    reservationDate: formatDate(today),
    reservationTime: "16:30",
    numberOfGuests: 4,
    status: "CONFIRMED",
    tableId: 15,
    specialRequests: ""
  },
  {
    reservationId: 9,
    customerName: "James Taylor",
    customerPhone: "+1 234-567-8909",
    customerEmail: "james.t@email.com",
    reservationDate: formatDate(today),
    reservationTime: "17:00",
    numberOfGuests: 3,
    status: "ARRIVED",
    tableId: 9,
    specialRequests: "Anniversary dinner"
  },
  {
    reservationId: 10,
    customerName: "Maria Garcia",
    customerPhone: "+1 234-567-8910",
    reservationDate: formatDate(today),
    reservationTime: "17:30",
    numberOfGuests: 2,
    status: "CONFIRMED",
    tableId: null,
    specialRequests: ""
  },

  // Today's Dinner Reservations (18:00 - 23:00)
  {
    reservationId: 11,
    customerName: "William Lee",
    customerPhone: "+1 234-567-8911",
    customerEmail: "william.l@email.com",
    reservationDate: formatDate(today),
    reservationTime: "18:00",
    numberOfGuests: 2,
    status: "CONFIRMED",
    tableId: 4,
    specialRequests: "Quiet table"
  },
  {
    reservationId: 12,
    customerName: "Patricia White",
    customerPhone: "+1 234-567-8912",
    reservationDate: formatDate(today),
    reservationTime: "18:30",
    numberOfGuests: 5,
    status: "CONFIRMED",
    tableId: 20,
    specialRequests: "High chair needed"
  },
  {
    reservationId: 13,
    customerName: "Richard Harris",
    customerPhone: "+1 234-567-8913",
    customerEmail: "richard.h@email.com",
    reservationDate: formatDate(today),
    reservationTime: "19:00",
    numberOfGuests: 4,
    status: "ARRIVED",
    tableId: 11,
    specialRequests: "VIP customer"
  },
  {
    reservationId: 14,
    customerName: "Linda Clark",
    customerPhone: "+1 234-567-8914",
    reservationDate: formatDate(today),
    reservationTime: "19:30",
    numberOfGuests: 2,
    status: "SEATED",
    tableId: 6,
    specialRequests: ""
  },
  {
    reservationId: 15,
    customerName: "Joseph Lewis",
    customerPhone: "+1 234-567-8915",
    reservationDate: formatDate(today),
    reservationTime: "20:00",
    numberOfGuests: 3,
    status: "CONFIRMED",
    tableId: 14,
    specialRequests: "Wine pairing"
  },
  {
    reservationId: 16,
    customerName: "Barbara Walker",
    customerPhone: "+1 234-567-8916",
    customerEmail: "barbara.w@email.com",
    reservationDate: formatDate(today),
    reservationTime: "20:30",
    numberOfGuests: 6,
    status: "CONFIRMED",
    tableId: null,
    specialRequests: "Corporate dinner"
  },
  {
    reservationId: 17,
    customerName: "Thomas Hall",
    customerPhone: "+1 234-567-8917",
    reservationDate: formatDate(today),
    reservationTime: "21:00",
    numberOfGuests: 2,
    status: "CONFIRMED",
    tableId: 2,
    specialRequests: ""
  },
  {
    reservationId: 18,
    customerName: "Susan Allen",
    customerPhone: "+1 234-567-8918",
    customerEmail: "susan.a@email.com",
    reservationDate: formatDate(today),
    reservationTime: "21:30",
    numberOfGuests: 4,
    status: "CANCELLED",
    tableId: null,
    specialRequests: ""
  },
  {
    reservationId: 19,
    customerName: "Charles Young",
    customerPhone: "+1 234-567-8919",
    reservationDate: formatDate(today),
    reservationTime: "22:00",
    numberOfGuests: 2,
    status: "CONFIRMED",
    tableId: 10,
    specialRequests: "Late dinner"
  },

  // Tomorrow's Reservations
  {
    reservationId: 20,
    customerName: "Jessica King",
    customerPhone: "+1 234-567-8920",
    customerEmail: "jessica.k@email.com",
    reservationDate: formatDate(tomorrow),
    reservationTime: "12:00",
    numberOfGuests: 3,
    status: "CONFIRMED",
    tableId: 8,
    specialRequests: ""
  },
  {
    reservationId: 21,
    customerName: "Daniel Wright",
    customerPhone: "+1 234-567-8921",
    reservationDate: formatDate(tomorrow),
    reservationTime: "19:00",
    numberOfGuests: 4,
    status: "CONFIRMED",
    tableId: 12,
    specialRequests: "Birthday party"
  },
  {
    reservationId: 22,
    customerName: "Karen Scott",
    customerPhone: "+1 234-567-8922",
    customerEmail: "karen.s@email.com",
    reservationDate: formatDate(tomorrow),
    reservationTime: "20:00",
    numberOfGuests: 2,
    status: "CONFIRMED",
    tableId: 5,
    specialRequests: ""
  },

  // Day After Tomorrow
  {
    reservationId: 23,
    customerName: "Mark Green",
    customerPhone: "+1 234-567-8923",
    reservationDate: formatDate(dayAfter),
    reservationTime: "18:00",
    numberOfGuests: 5,
    status: "CONFIRMED",
    tableId: 18,
    specialRequests: "Engagement celebration"
  },
  {
    reservationId: 24,
    customerName: "Nancy Adams",
    customerPhone: "+1 234-567-8924",
    reservationDate: formatDate(dayAfter),
    reservationTime: "19:30",
    numberOfGuests: 2,
    status: "CONFIRMED",
    tableId: 7,
    specialRequests: ""
  }
];

// Mock function to simulate API call
export const getMockReservations = (filters = {}) => {
  let filtered = [...mockReservations];

  // Filter by date
  if (filters.date) {
    filtered = filtered.filter(r => r.reservationDate === filters.date);
  }

  // Filter by status
  if (filters.status) {
    const statusUpper = filters.status.toUpperCase();
    filtered = filtered.filter(r => (r.status || "").toUpperCase() === statusUpper);
  }

  // Filter by tableId
  if (filters.tableId) {
    filtered = filtered.filter(r => r.tableId === parseInt(filters.tableId));
  }

  return {
    reservations: filtered,
    total: filtered.length
  };
};

// Mock function to simulate status update
export const updateMockReservationStatus = (reservationId, status) => {
  const reservation = mockReservations.find(r => r.reservationId === reservationId);
  if (reservation) {
    reservation.status = status.toUpperCase();
    return { ...reservation };
  }
  throw new Error("Reservation not found");
};

