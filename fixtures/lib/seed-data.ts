// SPDX-License-Identifier: MIT

/**
 * A realistic workspace, so the demo is never an empty database.
 *
 * A visitor who arrives at a cold, empty demo concludes the thing is broken, which is the opposite
 * of what a demo is for. Everything is idempotent by id, so seeding twice leaves the same rows rather
 * than duplicating a workspace, and seeding over a populated database updates it in place.
 *
 * Written as data rather than as SQL so the shape of the workspace can be read as a workspace, and
 * so the same values can seed a memory-backed demo without a second definition drifting from it.
 */

export type SeedUser = { id: string; email: string; role: "admin" | "editor" };

export const seedUsers: SeedUser[] = [
  { id: "usr_owner", email: "owner@demo.helmdeck.dev", role: "admin" },
  { id: "usr_editor", email: "editor@demo.helmdeck.dev", role: "editor" },
];

export const seedProducts = [
  { id: "prd_1", name: "Amber desk lamp", sku: "LAMP-001", price_cents: 4900, stock: 34 },
  { id: "prd_2", name: "Ash standing desk", sku: "DESK-001", price_cents: 74900, stock: 6 },
  { id: "prd_3", name: "Walnut monitor riser", sku: "RISR-001", price_cents: 5900, stock: 0 },
  { id: "prd_4", name: "Brass task light", sku: "LAMP-002", price_cents: 12500, stock: 12 },
  { id: "prd_5", name: "Linen cable tray", sku: "TRAY-001", price_cents: 3200, stock: 58 },
];

/**
 * Days before the seed ran, per order.
 *
 * The orders carry a moment because anything that sums a window needs one, and the two stores do
 * not agree about supplying it: the schema gives `orders.created_at` a default, and the in-memory
 * adapter has no columns to give a default to, so a seeded order reached the windowed reads with no
 * date at all. A revenue figure over a window that excludes every order is not a small number, it is
 * a demo that looks broken while passing.
 *
 * Fixed dates would be worse than none: they fall out of every window as the demo ages, so the tiles
 * would be correct the day they were written and empty a month later. These are relative to the
 * moment of seeding, so a fresh clone always has a spread inside the window a reader is looking at.
 */
const ORDER_DAYS_AGO: readonly number[] = [0, 1, 3, 6, 9, 14];

const seedOrderRows = [
  { id: "ord_1", total_cents: 4900, status: "paid", customer: "Deniz Aydın" },
  { id: "ord_2", total_cents: 74900, status: "pending", customer: "Ece Toprak" },
  { id: "ord_3", total_cents: 3200, status: "shipped", customer: "Kaan Demir" },
  { id: "ord_4", total_cents: 12500, status: "paid", customer: "Selin Kaya" },
  { id: "ord_5", total_cents: 5900, status: "cancelled", customer: "Bora Yıldız" },
  { id: "ord_6", total_cents: 4900, status: "paid", customer: "Mert Şahin" },
] as const;

/** `created_at` is SQLite's `datetime('now')` shape, so both stores spell a moment the same way. */
function isoAt(daysAgo: number, from: Date): string {
  const at = new Date(from.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return at.toISOString().replace("T", " ").slice(0, 19);
}

export const seedOrders = seedOrderRows.map((order, index) => ({
  ...order,
  created_at: isoAt(ORDER_DAYS_AGO[index] ?? 0, new Date()),
}));

export const seedPosts = [
  {
    id: "pst_1",
    title: "Shipping to the EU from the new warehouse",
    body: "Transit times drop to two days for Germany, France and the Netherlands.",
    status: "published",
    author_id: "usr_owner",
    position: 0,
  },
  {
    id: "pst_2",
    title: "Winter hours",
    body: "Support is on reduced cover between the 24th and the 2nd.",
    status: "published",
    author_id: "usr_owner",
    position: 1,
  },
  {
    id: "pst_3",
    title: "Draft: returns policy",
    body: "Not yet reviewed.",
    status: "draft",
    author_id: "usr_editor",
    position: 2,
  },
];

/**
 * The demo dashboard's arrangement, as rows rather than as widget ids, because position is what the
 * table stores and because the same arrangement has to be expressible in a memory-backed demo.
 */
export const seedPlacements = [
  { id: "plc_signups", dashboard: "overview", widget: "signups", size: "sm", position: 0 },
  { id: "plc_orders", dashboard: "overview", widget: "orders", size: "md", position: 1 },
  { id: "plc_revenue", dashboard: "overview", widget: "revenue", size: "lg", position: 2 },
  { id: "plc_notes", dashboard: "overview", widget: "notes", size: "sm", position: 3 },
] as const;

/**
 * The landing page as a visitor first meets it, as rows rather than as widget ids.
 *
 * Headings are written here because a section's title is a column a person edits, and the demo's
 * claim is that an edit survives a reload: a page that arrives already named is a page whose naming
 * can be seen to work. The width is inside the document because that is where the table keeps the
 * fields it has no column for.
 */
export const seedLandingSections = [
  {
    id: "sec_hero",
    page: "landing",
    kind: "hero",
    title: "A sofa that arrives before you have chosen one",
    position: 0,
    content: JSON.stringify({ size: "xl" }),
  },
  {
    id: "sec_features",
    page: "landing",
    kind: "features",
    title: "Flat-pack, assembled in the room it will live in",
    position: 1,
    content: JSON.stringify({ size: "lg" }),
  },
  {
    id: "sec_pricing",
    page: "landing",
    kind: "pricing",
    title: "Everything under 900, with delivery included",
    position: 2,
    content: JSON.stringify({ size: "md" }),
  },
  {
    id: "sec_faq",
    page: "landing",
    kind: "faq",
    title: "Returns for 60 days, no questions asked",
    position: 3,
    content: JSON.stringify({ size: "sm" }),
  },
] as const;

/**
 * The customers the shipments go to, with two of them under a third.
 *
 * A parent on two of the rows is the point of the shape rather than decoration: `parent_id` names a
 * row of the same table, so every value in it resolves to another row that resolves in turn, and a
 * generated view that walked those references would never finish. The views ask one hop, which is
 * the whole of how this terminates.
 */
export const seedCustomers = [
  { id: "cus_hale", name: "Hale & Roe", tier: "key", parent_id: null },
  { id: "cus_north", name: "Northbank Studio", tier: "trade", parent_id: null },
  { id: "cus_hale_films", name: "Hale & Roe Films", tier: "standard", parent_id: "cus_hale" },
  { id: "cus_north_press", name: "Northbank Press", tier: "standard", parent_id: "cus_north" },
] as const;

/**
 * The shipments, each naming a customer and, where there is one, an order.
 *
 * One of the five has no order, because a shipment that has not been raised yet is the ordinary case
 * and a column of references where every value happens to be filled hides that. `shp_5` names an
 * order, and an editor is refused reads of orders: the choices for that column are the store's, so
 * an editor is offered none of them and cannot write one either.
 */
export const seedShipments = [
  { id: "shp_1", tracking: "HD-1001", status: "delivered", customer_id: "cus_hale", order_id: "ord_1" },
  { id: "shp_2", tracking: "HD-1002", status: "in_transit", customer_id: "cus_north", order_id: "ord_2" },
  { id: "shp_3", tracking: "HD-1003", status: "label_created", customer_id: "cus_hale_films", order_id: null },
  { id: "shp_4", tracking: "HD-1004", status: "delivered", customer_id: "cus_north_press", order_id: "ord_4" },
  { id: "shp_5", tracking: "HD-1005", status: "in_transit", customer_id: "cus_hale", order_id: "ord_6" },
] as const;

export const seedEverything = {
  users: seedUsers,
  posts: seedPosts,
  products: seedProducts,
  orders: seedOrders,
  customers: seedCustomers,
  shipments: seedShipments,
  dashboard_placements: seedPlacements,
  landing_sections: seedLandingSections,
};
