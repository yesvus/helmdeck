// SPDX-License-Identifier: MIT
"use client";

import { AdminResourceForm } from "../../../../../lib/engine/resources/views";
import { productsResource } from "../../../../../lib/admin-resources";
import { clientPersistence } from "../../../../../lib/client-persistence";

/** A new product, on the form the definition generates. `id` absent means create rather than save. */
export default function NewProductPage() {
  return (
    <AdminResourceForm
      definition={productsResource}
      persistence={clientPersistence}
      backHref="/shell/products"
    />
  );
}
