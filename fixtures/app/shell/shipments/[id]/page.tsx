// SPDX-License-Identifier: MIT
"use client";

import { use } from "react";
import { AdminResourceForm } from "@yesvus/helmdeck";
import { shipmentsResource } from "../../../../lib/admin-resources";
import { clientPersistence } from "../../../../lib/client-persistence";

/** One shipment, addressed by the id the list linked to. */
export default function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <AdminResourceForm
      definition={shipmentsResource}
      persistence={clientPersistence}
      id={id}
      backHref="/shell/shipments"
    />
  );
}
