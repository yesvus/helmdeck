// SPDX-License-Identifier: MIT
import { adminFormatCount, defineAdminResource, type AdminResourceFormatter } from "@yesvus/helmdeck";

/**
 * The demo's real resources, described once for both the list and the detail form.
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

/**
 * Customers, and a column that points at customers.
 *
 * `parent_id` is the reference that makes this definition worth having: a trade account sits under
 * the group it belongs to, so the value names a row of the table it is in. That is a cycle, and the
 * generated views terminate it by asking one hop rather than by special-casing it, which is what a
 * list of parents would have cost before a reference was a thing a definition could say.
 *
 * The column prints the parent's name rather than its id, and the form offers the customers that
 * exist as a choice from the store rather than a box to type an id into.
 */
export const customersResource = defineAdminResource({
  resource: "customers",
  label: "Customers",
  singularLabel: "Customer",
  path: "customers",
  permissions: {
    read: "customers.read",
    create: "customers.create",
    update: "customers.update",
    delete: "customers.delete",
  },
  columns: [
    { key: "name", header: "Name", sortable: true },
    { key: "tier", header: "Tier", sortable: true },
    { key: "parent_id", header: "Group", reference: { resource: "customers", label: "name" } },
  ],
  fields: [
    { name: "name", label: "Name", required: true },
    { name: "tier", label: "Tier" },
    {
      name: "parent_id",
      label: "Group",
      hint: "The customer this one sits under. Leave empty for a top-level account.",
      reference: { resource: "customers", label: "name" },
    },
  ],
});

/**
 * Shipments, with a column pointing at customers and one pointing at orders.
 *
 * The two references are there for two different reasons. `customer_id` is the ordinary case: a
 * column a form draws as a choice from the store and a write is checked against, and the list prints
 * the customer's name and filters by it server-side. `order_id` is the one worth watching, because an
 * editor may work the catalogue and may not read orders: its choices are the store's, so an editor is
 * offered none of them, and a write carrying an order id is refused by the guard before the store is
 * asked whether that order is real. A reference is a way to name a row, and this is the case where
 * naming it must not become a way to read it.
 */
export const shipmentsResource = defineAdminResource({
  resource: "shipments",
  label: "Shipments",
  singularLabel: "Shipment",
  path: "shipments",
  permissions: {
    read: "shipments.read",
    create: "shipments.create",
    update: "shipments.update",
    delete: "shipments.delete",
  },
  columns: [
    { key: "tracking", header: "Tracking", sortable: true },
    { key: "status", header: "Status", sortable: true },
    { key: "customer_id", header: "Customer", reference: { resource: "customers", label: "name" } },
    { key: "order_id", header: "Order", reference: { resource: "orders" } },
  ],
  fields: [
    { name: "tracking", label: "Tracking", required: true },
    { name: "status", label: "Status" },
    {
      name: "customer_id",
      label: "Customer",
      required: true,
      reference: { resource: "customers", label: "name" },
    },
    {
      name: "order_id",
      label: "Order",
      hint: "The order this went out for. Administrators only, so an editor is offered none of them.",
      reference: { resource: "orders" },
    },
  ],
});

export const adminResources = [productsResource, ordersResource, customersResource, shipmentsResource];