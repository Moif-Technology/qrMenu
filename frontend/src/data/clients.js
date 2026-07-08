/**
 * Restaurant clients using DeynoQR.
 * To add a new client, append an entry to this array.
 * entryPath must match the BrowserRouter basename used for that restaurant.
 * menuPath is the full URL path including the basename prefix.
 */
export const clients = [
  {
    id: "opaia",
    name: "Opaia",
    slug: "opaia",
    tagline: "Modern dining with international cuisine",
    description:
      "A contemporary dining experience featuring signature dishes, seasonal specials, and a curated drink selection.",
    category: "Restaurant & Cafe",
    status: "live", // "live" | "coming_soon"
    /** Full URL path — used as <a href> from the landing page (triggers full page navigation) */
    entryPath: "/opaia",
    menuPath: "/opaia/menu",
    accentColor: "#10b981",
    imageUrl: "/opaia.avif",
  },
  {
    id: "bonfood",
    name: "Bonfood",
    slug: "bonfood",
    tagline: "Fresh flavors, honest food",
    description:
      "A vibrant dining spot serving hearty meals made with fresh ingredients and bold flavors.",
    category: "Restaurant",
    status: "coming_soon",
    entryPath: "/bonfood",
    menuPath: "/bonfood/menu",
    accentColor: "#f59e0b",
    imageUrl: "/bonfood.png",
  },
];
