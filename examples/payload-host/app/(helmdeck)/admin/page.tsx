import Link from "next/link";
import { AdminPageHeader, AdminStatCard } from "@yesvus/helmdeck";
import { FileText } from "lucide-react";
import { PAYLOAD_ADMIN_ROUTE } from "@/lib/payload/admin";
import { countPages, listPages } from "@/lib/payload/content";

/**
 * The dashboard, reading Payload.
 *
 * Every number and every row on this page came out of Payload through the one module this host has
 * for reaching it, which passes `overrideAccess: false` and the session's user on every call. A
 * host whose dashboard reads a table of its own is a host with two stores, and the one that is
 * behind the panel is the one people edit.
 */
export default async function AdminOverviewPage() {
  const [total, pages] = await Promise.all([countPages(), listPages(5)]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Overview" />

      <section aria-label="Content" className="grid gap-4 sm:grid-cols-2">
        <AdminStatCard
          icon={FileText}
          label="Pages"
          value={String(total)}
          detail="Documents in Payload, read through the one call site"
        />
      </section>

      <section className="rounded-admin-card border border-zinc-200 bg-admin-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recently changed</h2>
          <Link href="/admin/pages" className="text-sm font-semibold text-brand-600 hover:underline">
            All pages
          </Link>
        </div>

        {pages.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            No pages yet. Write one in Payload&apos;s editor and it appears here.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100">
            {pages.map((page) => (
              <li key={page.id} className="py-3">
                <p className="text-sm font-medium">{page.title}</p>
                <p className="mt-0.5 text-xs text-zinc-500">/{page.slug}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="max-w-prose text-sm text-zinc-600">
        Content is edited in Payload&apos;s own panel, which sits beside this shell and reads the same
        session. There is one sign-in, one rule and one database behind both.
      </p>

      <a
        href={PAYLOAD_ADMIN_ROUTE}
        className="inline-block rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Open the content editor
      </a>
    </div>
  );
}
