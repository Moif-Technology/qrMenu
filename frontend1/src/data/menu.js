// src/data/menu.js
export const CATEGORIES = [
  { id: "starters", name: "Starters" },
  { id: "mains",    name: "Mains" },
  { id: "desserts", name: "Desserts" },
  { id: "drinks",   name: "Drinks" },
  { id: "fastFood", name: "Fast Foods" }
];

export const ITEMS = [
  {
    id: "p1",
    categoryId: "starters",
    name: "Hummus Bowl",
    price: 18.0,
    desc: "Creamy chickpeas, tahini, olive oil and paprika.",
    img: "https://picsum.photos/seed/hummus/640/400",
    modifiers: [
      {
        group: "Extras",
        options: [
          { name: "Pita Bread", price: 3 },
          { name: "Veg Sticks", price: 5 }
        ]
      }
    ]
  },
  {
    id: "p2",
    categoryId: "starters",
    name: "Fattoush",
    price: 22.0,
    desc: "Crisp salad, sumac dressing, toasted pita.",
    img: "https://picsum.photos/seed/fattoush/640/400",
    modifiers: []
  },
  {
    id: "p3",
    categoryId: "mains",
    name: "Mixed Grill Platter",
    price: 58.0,
    desc: "Kebab, tikka, kofta with grilled veg.",
    img: "https://picsum.photos/seed/grill/640/400",
    modifiers: [
      {
        group: "Side",
        options: [
          { name: "Fries", price: 0 },
          { name: "Rice",  price: 0 },
          { name: "Salad", price: 0 }
        ]
      },
      {
        group: "Sauce",
        options: [
          { name: "Garlic Sauce", price: 0 },
          { name: "Tahini",       price: 0 },
          { name: "Chilli",       price: 0 }
        ]
      }
    ]
  },
  {
    id: "p4",
    categoryId: "mains",
    name: "Shish Taouk",
    price: 44.0,
    desc: "Charcoal-grilled chicken cubes, pickles, garlic.",
    img: "https://picsum.photos/seed/taouk/640/400",
    modifiers: [
      {
        group: "Bread",
        options: [
          { name: "Khubz", price: 0 },
          { name: "Saj",   price: 2 }
        ]
      }
    ]
  },
  {
    id: "p5",
    categoryId: "desserts",
    name: "Kunafa",
    price: 24.0,
    desc: "Warm shredded pastry, sweet cheese, sugar syrup.",
    img: "https://picsum.photos/seed/kunafa/640/400",
    modifiers: [
      {
        group: "Toppings",
        options: [
          { name: "Pistachio",   price: 3 },
          { name: "Extra Syrup", price: 0 }
        ]
      }
    ]
  },
  {
    id: "p6",
    categoryId: "drinks",
    name: "Mint Lemonade",
    price: 16.0,
    desc: "Fresh mint, lemon, crushed ice.",
    img: "https://picsum.photos/seed/mint/640/400",
    modifiers: [
      {
        group: "Size",
        options: [
          { name: "Regular", price: 0 },
          { name: "Large",   price: 4 }
        ]
      }
    ]
  },
  // the duplicate Kunafa from your paste, just given a unique id to avoid React key warning
  {
    id: "p7",
    categoryId: "desserts",
    name: "Kunafa",
    price: 24.0,
    desc: "Warm shredded pastry, sweet cheese, sugar syrup.",
    img: "https://picsum.photos/seed/kunafa2/640/400",
    modifiers: [
      {
        group: "Toppings",
        options: [
          { name: "Pistachio",   price: 3 },
          { name: "Extra Syrup", price: 0 }
        ]
      }
    ]
  }
];
