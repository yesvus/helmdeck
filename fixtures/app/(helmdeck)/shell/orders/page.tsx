// SPDX-License-Identifier: MIT

import { DemoResourceList } from "../../../../components/demo-resource-list";
import { ordersResource } from "../../../../lib/admin-resources";
import { demoPersistence } from "../../../../lib/demo-persistence";

/**
 * Orders, generated from the resource definition.
 *
 * The previous page filtered a hardcoded array by a status select whose options were written by
 * hand next to the rows they filtered. The columns and their formatting live with the definition
 * now, so adding a field is one edit rather than a table, a filter and a detail view kept in step.
 *
 * A server component for the reason the products page is one: whether the demo's store can page is
 * the demo's store's own answer, and it is the store the list asks.
 */
export default function OrdersPage() {
  return (
    <DemoResourceList
      definition={ordersResource}
      detailBaseHref="/shell/orders"
      paged={typeof demoPersistence().adapter.queryPage === "function"}
    />
  );
}
