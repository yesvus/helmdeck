import Link from "next/link";
import { listProducts, MedusaApiError, MedusaAccessRefused, medusaAdminUrl } from "@/lib/medusa/client";
import { currentAdminSession } from "@/lib/session";

export default async function CommercePage() {
  let products;
  try {
    products = (await listProducts(currentAdminSession)).products;
  } catch (error) {
    if (error instanceof MedusaAccessRefused) return <p>Administrator access is required.</p>;
    return <main><h1>Commerce</h1><p role="alert">{error instanceof MedusaApiError ? error.message : "The commerce data is unavailable."}</p></main>;
  }
  return <main className="space-y-6"><header><h1 className="text-2xl font-semibold">Commerce</h1><p className="text-sm text-zinc-600">Read-only view of Medusa products.</p></header><a className="underline" href={medusaAdminUrl()}>Create or edit products in Medusa Admin</a>{products.length === 0 ? <p>No published products found.</p> : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <li className="rounded-lg border border-zinc-200 p-4" key={product.id}><h2 className="font-medium"><Link href={`/commerce/${encodeURIComponent(product.handle)}`}>{product.title}</Link></h2><p className="text-sm text-zinc-600">{product.status}</p></li>)}</ul>}</main>;
}
