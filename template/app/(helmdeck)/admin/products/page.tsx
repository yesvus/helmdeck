import Link from "next/link";
import { AdminPageHeader } from "@yesvus/helmdeck";
import { payloadPersistence } from "@/lib/persistence";

export default async function ProductsPage() {
  const persistence = await payloadPersistence();
  const page = await persistence.queryPage?.("products", { window: { offset: 0, limit: 1 } });
  return <section className="space-y-4"><AdminPageHeader title="Products" /><p>{page?.total ?? 0} products in Payload.</p><Link href="/payload/admin/collections/products">Open products</Link></section>;
}
