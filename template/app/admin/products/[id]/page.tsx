"use client";

import { use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AdminResourceForm } from "@yesvus/helmdeck";
import { clientPersistence } from "@/components/client-persistence";
import { productsResource } from "@/lib/resources";

/**
 * One product, addressed by the id the list linked to.
 *
 * Back to the list once it is saved, because the list is where a saved change is visible. The form
 * still holds what was typed, and only a fresh read proves the store took it.
 */
export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const onSaved = useCallback(() => {
    router.push("/admin/products");
  }, [router]);

  return (
    <AdminResourceForm
      definition={productsResource}
      persistence={clientPersistence}
      id={id}
      backHref="/admin/products"
      onSaved={onSaved}
    />
  );
}
