// SPDX-License-Identifier: MIT
"use client";

import { AdminResourceForm } from "@yesvus/helmdeck";
import { ordersResource } from "../../../../../lib/admin-resources";
import { clientPersistence } from "../../../../../lib/client-persistence";

/** A new order, on the form the definition generates. */
export default function NewOrderPage() {
  return (
    <AdminResourceForm
      definition={ordersResource}
      persistence={clientPersistence}
      backHref="/shell/orders"
    />
  );
}
