import { defineAdminResource } from "@yesvus/helmdeck";

/**
 * The resources this admin exposes, described once for the list and the form.
 *
 * A definition is a description, not code: nothing here reads or writes. `AdminResourceList` and
 * `AdminResourceForm` generate their views from it, so a column, a filter and a field are written
 * once rather than once per view.
 *
 * Two properties of this file are load-bearing, and both are here rather than in the rule:
 *
 * - **The permission names live here**, once, and the guard derives the name it asks about from the
 *   resource and the operation. Adding a resource therefore cannot add a permission the rule is not
 *   consulted about, and renaming one cannot leave a name behind that nothing decides.
 * - **This list is the exposed set.** `lib/rules.ts` reads it rather than keeping a second list, so
 *   a resource added here is reachable and a resource not added here is refused by name before the
 *   session is even resolved. The accounts and the sessions are deliberately absent, which is what
 *   keeps a password hash out of a table browser that exists for everything else.
 */
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
    // `money` is a name the package prints itself, reading the stored integer as whole cents. A
    // column format this package does not ship is a name you register in the list's `formatters`
    // prop, because a function cannot cross from a server component into a client one.
    { key: "price_cents", header: "Price", align: "right", sortable: true, format: "money" },
  ],
  /**
   * A filter with no options is a term typed into a box and compared with `contains` against one
   * field. The list sends the comparison to the store and renders what comes back, so a term no
   * product carries is an answer from the database rather than a locally emptied table.
   */
  filters: [{ field: "sku", label: "SKU contains", operator: "contains" }],
  fields: [
    { name: "name", label: "Name", required: true },
    { name: "sku", label: "SKU", required: true },
    { name: "price_cents", label: "Price", type: "number", required: true },
  ],
});

export const adminResources = [productsResource];
