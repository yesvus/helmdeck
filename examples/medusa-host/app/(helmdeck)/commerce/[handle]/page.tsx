import { notFound } from "next/navigation";
import { getProduct, MedusaApiError, MedusaAccessRefused, medusaAdminUrl } from "@/lib/medusa/client";
import { currentAdminSession } from "@/lib/session";

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  let product;
  try {
    product = await getProduct(handle, currentAdminSession);
  } catch (error) {
    if (error instanceof MedusaAccessRefused) return <p>Administrator access is required.</p>;
    return <main><h1>Product unavailable</h1><p role="alert">{error instanceof MedusaApiError ? error.message : "The commerce data is unavailable."}</p></main>;
  }
  if (!product) notFound();
  return <main className="space-y-4"><h1 className="text-2xl font-semibold">{product.title}</h1><p>{product.description || "No description."}</p><p>Handle: {product.handle}</p><h2 className="font-medium">Variants</h2>{product.variants.length ? <ul>{product.variants.map((variant) => <li key={variant.id}>{variant.title}</li>)}</ul> : <p>No variants.</p>}<a className="underline" href={medusaAdminUrl()}>Edit in Medusa Admin</a></main>;
}
