import Link from "next/link";
import { AdminPageHeader } from "@yesvus/helmdeck";
import { APP_NAME } from "@/lib/brand";

/**
 * Where the sidebar's first entry lands.
 *
 * It states the two things a person opening the admin for the first time needs: the store is
 * working, and there is nothing in it yet. The template seeds no records, so the first row is
 * created through the form, which is also how you find out the form works.
 */
export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Overview" />
      <p className="max-w-prose text-sm text-zinc-600">
        {APP_NAME} is running on a SQLite file. Create your first record to see the generated list
        search, sort, filter and page over it.
      </p>
      <Link
        href="/admin/products/new"
        className="inline-block rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        New product
      </Link>
    </div>
  );
}
