import { AdminPageHeader } from "@yesvus/helmdeck";
import { PagesTable } from "@/components/pages-table";
import { listPages } from "@/lib/payload/content";

/**
 * The record list, reading Payload.
 *
 * The rows are read on the server, through the one module this host has for reaching Payload, and
 * handed to the table. The table sorts and searches the rows it was given, which is the honest
 * thing for a host whose list is one collection: the query it runs is the one in that module.
 */
export default async function PagesPage() {
  const pages = await listPages(50);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Pages" />
      <p className="max-w-prose text-sm text-zinc-600">
        Every row here is a document in Payload&apos;s <code>pages</code> collection. The editor that
        writes them is Payload&apos;s own.
      </p>
      <PagesTable pages={pages} />
    </div>
  );
}
