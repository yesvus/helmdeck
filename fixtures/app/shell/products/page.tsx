// SPDX-License-Identifier: MIT

import { DemoResourceList } from "../../../components/demo-resource-list";
import { productsResource } from "../../../lib/admin-resources";
import { demoPersistence } from "../../../lib/demo-persistence";

/**
 * Products, generated from the resource definition rather than hand-written.
 *
 * This page rendered its own `<table>` over a hardcoded array, with a stat band counting 128
 * products when the store held five. Columns, formatting, empty state and the detail links now come
 * from one description shared with the edit form, so the two cannot disagree about what a product
 * is.
 *
 * A server component because the list it renders reads through an adapter from a client effect, and
 * what that adapter can do is the demo's store's own answer. The store is selected at run time, so
 * the question is asked here, where the selection is readable, and the answer is a boolean. The
 * adapter itself still cannot cross the boundary, which is why the list is one component further
 * down.
 */
export default function ProductsPage() {
  return (
    <DemoResourceList
      definition={productsResource}
      detailBaseHref="/shell/products"
      paged={typeof demoPersistence().adapter.queryPage === "function"}
    />
  );
}
