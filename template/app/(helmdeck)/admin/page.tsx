import Link from "next/link";
import { AdminPageHeader } from "@yesvus/helmdeck";
import { APP_NAME } from "@/lib/brand";

/**
 * Where the sidebar's first entry lands.
 *
 * It points a first-time administrator to Payload's product collection.
 */
export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Overview" />
      <p className="max-w-prose text-sm text-zinc-600">
        {APP_NAME} uses Payload for content and Helmdeck for the admin shell.
      </p>
      <Link
        href="/payload/admin/collections/products"
        className="inline-block rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Manage products in Payload
      </Link>
    </div>
  );
}
