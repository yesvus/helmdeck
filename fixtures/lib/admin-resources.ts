// SPDX-License-Identifier: MIT
import { defineAdminResource } from "@yesvus/helmdeck";

/**
 * The demo's two real resources, described once for both the list and the detail form.
 *
 * Nothing here reads or writes. `AdminResourceList` and `AdminResourceForm` take a definition and
 * generate their views from it, which is the alternative to hand-writing a table and a form for
 * every resource the way this demo did before: the products page rendered its own `<table>` over a
 * hardcoded array, and every column, filter and empty state was written twice for the two resources.
 *
 * Permissions are declared here because the generated views are permission-first: the edit button,
 * the delete button and the "new" record link only render when a permission is declared for them,
 * and a declared permission fails closed without an adapter. Declaring them without mounting an
 * adapter would produce a table with no way into it, which is how the roles milestone and this one
 * turned out to be coupled rather than sequential. What each permission means is decided once, in
 * `demo-rules`, by both the adapter and the persistence actions.
 */

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Stored in cents, shown as currency. A raw 4900 in a table reads as a price nobody charges. */
function formatCents(value: unknown): string {
  return typeof value === "number" ? money.format(value / 100) : "—";
}

function formatStock(value: unknown): string {
  if (typeof value !== "number") return "—";
  return value === 0 ? "Out of stock" : String(value);
}

export const productsResource = defineAdminResource({
  resource: "products",
  label: "Products",
  singularLabel: "Product",
  path: "products",
  permissions: {
    read: "products.read",
    create: "products.create",
    update: "products.update",
    delete: "products.delete",
  },
  columns: [
    { key: "name", header: "Name" },
    { key: "sku", header: "SKU" },
    { key: "price_cents", header: "Price", align: "right", format: (value) => formatCents(value) },
    { key: "stock", header: "Stock", align: "right", format: (value) => formatStock(value) },
  ],
  fields: [
    { name: "name", label: "Name", required: true },
    { name: "sku", label: "SKU", required: true },
    { name: "price_cents", label: "Price", type: "number", required: true },
    { name: "stock", label: "Stock", type: "number", required: true },
  ],
});

export const ordersResource = defineAdminResource({
  resource: "orders",
  label: "Orders",
  singularLabel: "Order",
  path: "orders",
  permissions: {
    read: "orders.read",
    create: "orders.create",
    update: "orders.update",
    delete: "orders.delete",
  },
  columns: [
    { key: "customer", header: "Customer" },
    { key: "status", header: "Status" },
    { key: "total_cents", header: "Total", align: "right", format: (value) => formatCents(value) },
  ],
  fields: [
    { name: "customer", label: "Customer", required: true },
    { name: "status", label: "Status", required: true },
    { name: "total_cents", label: "Total", type: "number", required: true },
  ],
});

export const adminResources = [productsResource, ordersResource];
