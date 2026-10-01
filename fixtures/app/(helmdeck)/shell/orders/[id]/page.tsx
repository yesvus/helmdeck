// SPDX-License-Identifier: MIT
"use client";

import { use } from "react";
import { AdminResourceForm } from "@yesvus/helmdeck";
import { ordersResource } from "../../../../../lib/admin-resources";
import { clientPersistence } from "../../../../../lib/client-persistence";

/** One order, addressed by the id the list linked to. */
export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <AdminResourceForm
      definition={ordersResource}
      persistence={clientPersistence}
      id={id}
      backHref="/shell/orders"
    />
  );
}
