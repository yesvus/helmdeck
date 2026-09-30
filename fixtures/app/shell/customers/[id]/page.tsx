// SPDX-License-Identifier: MIT
"use client";

import { use } from "react";
import { AdminResourceForm } from "@yesvus/helmdeck";
import { customersResource } from "../../../../lib/admin-resources";
import { clientPersistence } from "../../../../lib/client-persistence";

/** One customer, addressed by the id the list linked to. */
export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <AdminResourceForm
      definition={customersResource}
      persistence={clientPersistence}
      id={id}
      backHref="/shell/customers"
    />
  );
}
