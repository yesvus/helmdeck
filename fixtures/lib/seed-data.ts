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

export const seedOrders = [
  { id: "ord_1", total_cents: 4900, status: "paid", customer: "Deniz Aydın" },
  { id: "ord_2", total_cents: 74900, status: "pending", customer: "Ece Toprak" },
  { id: "ord_3", total_cents: 3200, status: "shipped", customer: "Kaan Demir" },
  { id: "ord_4", total_cents: 12500, status: "paid", customer: "Selin Kaya" },
  { id: "ord_5", total_cents: 5900, status: "cancelled", customer: "Bora Yıldız" },
  { id: "ord_6", total_cents: 4900, status: "paid", customer: "Mert Şahin" },
];

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

export const seedEverything = {
  users: seedUsers,
  posts: seedPosts,
  products: seedProducts,
  orders: seedOrders,
  dashboard_placements: seedPlacements,
};
