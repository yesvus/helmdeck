// SPDX-License-Identifier: MIT
"use client";

import { AdminResourceForm } from "@yesvus/helmdeck";
import { customersResource } from "../../../../../lib/admin-resources";
import { clientPersistence } from "../../../../../lib/client-persistence";

/** A new customer, on the form the definition generates. `id` absent means create rather than save. */
export default function NewCustomerPage() {
  return (
    <AdminResourceForm
      definition={customersResource}
      persistence={clientPersistence}
      backHref="/shell/customers"
    />
  );
}
