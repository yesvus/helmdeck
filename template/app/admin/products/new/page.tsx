"use client";

import { AdminResourceForm } from "@yesvus/helmdeck";
import { clientPersistence } from "@/components/client-persistence";
import { productsResource } from "@/lib/resources";

/** A new product, on the form the definition generates. No `id` means create rather than save. */
export default function NewProductPage() {
  return (
    <AdminResourceForm
      definition={productsResource}
      persistence={clientPersistence}
      backHref="/admin/products"
    />
  );
}
