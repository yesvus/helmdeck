"use client";

import { use } from "react";
import { AdminResourceForm } from "@yesvus/helmdeck";
import { clientPersistence } from "@/components/client-persistence";
import { productsResource } from "@/lib/resources";

/** One product, addressed by the id the list linked to. */
export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <AdminResourceForm
      definition={productsResource}
      persistence={clientPersistence}
      id={id}
      backHref="/admin/products"
    />
  );
}
