"use client";

import { AdminResourceList } from "@yesvus/helmdeck";
import { clientPersistence } from "@/components/client-persistence";
import { productsResource } from "@/lib/resources";

/**
 * The list, generated from the definition rather than hand-written.
 *
 * A client component because it reads through the adapter from an effect, and because a definition
 * handed down from a server component cannot carry a function: the column format that is a name the
 * package prints, and a formatter of your own is passed to the `formatters` prop here instead.
 *
 * Nothing on this page filters, sorts or pages the rows it was given. Every control sends a query
 * to the store, which answers it under the one rule, so what is drawn here and what the store would
 * return cannot disagree.
 */
export default function ProductsPage() {
  return (
    <AdminResourceList
      definition={productsResource}
      persistence={clientPersistence}
      detailBaseHref="/admin/products"
    />
  );
}
