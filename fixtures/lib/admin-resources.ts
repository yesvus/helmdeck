// SPDX-License-Identifier: MIT
import { adminFormatCount, defineAdminResource, type AdminResourceFormatter } from "@yesvus/helmdeck";

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

/**
 * The one cell format the demo declares for itself, by the name its stock column asks for.
 *
 * Held here and passed to the list rather than written into the column's `format`, because a
 * definition reaches a client component as data and a function in it cannot travel. Zero is not a
 * number worth putting in front of a reader, and this is where the demo says so in words. `money`
 * and `count` need no entry here: the list ships those, and a name it answers is not the demo's to
 * restate.
 */
export const demoFormatters: Readonly<Record<string, AdminResourceFormatter>> = {
  stock: (value) => {
    if (typeof value !== "number") return "—";
    return value === 0 ? "Out of stock" : adminFormatCount(value);
  },
};

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
    { key: "name", header: "Name", sortable: true },
    { key: "sku", header: "SKU", sortable: true },
    { key: "price_cents", header: "Price", align: "right", sortable: true, format: "money" },
    { key: "stock", header: "Stock", align: "right", sortable: true, format: { name: "stock" } },
  ],
  /**
   * One filter, on a field rather than across the record, which is what a search box cannot be.
   *
   * The demo's products carry no closed set of values worth choosing from, so this is a term typed
   * into a box and compared with `contains` against one field, which is the form the definition
   * takes when it declares no options. The list sends the comparison to the adapter and draws
   * whatever comes back, so a term no product carries is an answer from the store rather than a
   * locally emptied table.
   */
  filters: [{ field: "sku", label: "SKU contains", operator: "contains" }],
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
    { key: "total_cents", header: "Total", align: "right", format: "money" },
  ],
  fields: [
    { name: "customer", label: "Customer", required: true },
    { name: "status", label: "Status", required: true },
    { name: "total_cents", label: "Total", type: "number", required: true },
  ],
});

export const adminResources = [productsResource, ordersResource];
