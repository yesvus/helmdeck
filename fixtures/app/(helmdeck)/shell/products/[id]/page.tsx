// SPDX-License-Identifier: MIT
"use client";

import { use } from "react";
import { AdminResourceForm } from "@yesvus/helmdeck";
import { productsResource } from "../../../../../lib/admin-resources";
import { clientPersistence } from "../../../../../lib/client-persistence";

/** One product, addressed by the id the list linked to. */
export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <AdminResourceForm
      definition={productsResource}
      persistence={clientPersistence}
      id={id}
      backHref="/shell/products"
    />
  );
}
