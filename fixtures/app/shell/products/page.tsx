// SPDX-License-Identifier: MIT
"use client";

import { AdminResourceList } from "@yesvus/helmdeck";
import { productsResource } from "../../../lib/admin-resources";
import { clientPersistence } from "../../../lib/client-persistence";

/**
 * Products, generated from the resource definition rather than hand-written.
 *
 * This page rendered its own `<table>` over a hardcoded array, with a stat band counting 128
 * products when the store held five. Columns, formatting, empty state and the detail links now come
 * from one description shared with the edit form, so the two cannot disagree about what a product
 * is.
 *
 * A client component because `AdminResourceList` reads through its adapter from an effect, and the
 * adapter is a set of server actions. A server component cannot pass that object down: functions
 * do not cross the boundary, so the page has to be on the same side as the adapter.
 */
export default function ProductsPage() {
  return (
    <AdminResourceList
      definition={productsResource}
      persistence={clientPersistence}
      detailBaseHref="/shell/products"
    />
  );
}
