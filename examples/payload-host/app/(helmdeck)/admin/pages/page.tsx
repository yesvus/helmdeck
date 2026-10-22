import { AdminPageHeader } from "@yesvus/helmdeck";
import { PagesTable } from "@/components/pages-table";
import { countPages, listPages } from "@/lib/payload/content";

/** How many documents one page of the list carries. */
const PAGE_LIMIT = 50;

/**
 * The record list, reading Payload.
 *
 * The rows are read on the server, through the one module this host has for reaching Payload, and
 * handed to the table. The table sorts and searches the rows it was given, which is the honest
 * thing for a host whose list is one collection: the query it runs is the one in that module.
 */
export default async function PagesPage() {
  const [total, pages] = await Promise.all([countPages(), listPages(PAGE_LIMIT)]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Pages" />
      <p className="max-w-prose text-sm text-zinc-600">
        Every row here is a document in Payload&apos;s <code>pages</code> collection. The editor that
        writes them is Payload&apos;s own.
      </p>
      {total > pages.length ? (
        <p className="text-sm text-zinc-500">
          Showing the first {pages.length} of {total} documents. The list is a window onto the
          collection rather than the collection.
        </p>
      ) : null}
      <PagesTable pages={pages} />
    </div>
  );
}
