// SPDX-License-Identifier: MIT
"use client";

import { AdminResourceList } from "@yesvus/helmdeck";
import { ordersResource } from "../../../lib/admin-resources";
import { clientPersistence } from "../../../lib/client-persistence";

/**
 * Orders, generated from the resource definition.
 *
 * The previous page filtered a hardcoded array by a status select whose options were written by
 * hand next to the rows they filtered. The columns and their formatting live with the definition
 * now, so adding a field is one edit rather than a table, a filter and a detail view kept in step.
 */
export default function OrdersPage() {
  return (
    <AdminResourceList
      definition={ordersResource}
      persistence={clientPersistence}
      detailBaseHref="/shell/orders"
    />
  );
}
