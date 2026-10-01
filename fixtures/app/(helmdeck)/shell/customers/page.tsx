// SPDX-License-Identifier: MIT

import { DemoResourceList } from "../../../../components/demo-resource-list";
import { customersResource } from "../../../../lib/admin-resources";
import { demoPersistence } from "../../../../lib/demo-persistence";

/**
 * Customers, generated from the resource definition.
 *
 * The list is the second half of what a reference does: the `Group` column prints the name of the
 * customer each row sits under rather than its id, and the filter over the same column is the store's
 * rows narrowed server-side. The two are asked of the store through the same call, so the column and
 * the filter cannot come to describe different sets of customers.
 *
 * A server component for the reason the products and orders pages are: whether the demo's store can
 * page is the store's own answer, and it is the store the list asks.
 */
export default function CustomersPage() {
  return (
    <DemoResourceList
      definition={customersResource}
      detailBaseHref="/shell/customers"
      paged={typeof demoPersistence().adapter.queryPage === "function"}
    />
  );
}
