"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { AdminResourceForm } from "@yesvus/helmdeck";
import { clientPersistence } from "@/components/client-persistence";
import { productsResource } from "@/lib/resources";

/**
 * A new product, on the form the definition generates. No `id` means create rather than save.
 *
 * `onSaved` is what makes a save legible. The form writes through the store and then stops, so
 * without a callback the person is left on the form they just submitted, holding the values, with
 * nothing saying the record exists and no way to see it. Back to the list, which is where the row
 * they just made now is.
 */
export default function NewProductPage() {
  const router = useRouter();
  const onSaved = useCallback(() => {
    router.push("/admin/products");
  }, [router]);

  return (
    <AdminResourceForm
      definition={productsResource}
      persistence={clientPersistence}
      backHref="/admin/products"
      onSaved={onSaved}
    />
  );
}
