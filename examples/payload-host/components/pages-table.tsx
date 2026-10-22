"use client";

import { AdminDataTable, AdminEmptyState, type AdminDataTableColumn } from "@yesvus/helmdeck";
import type { PageDocument } from "@/lib/payload/content";

const columns: AdminDataTableColumn<PageDocument>[] = [
  {
    key: "title",
    header: "Title",
    cell: (row) => row.title,
    value: (row) => row.title,
    sortable: true,
  },
  {
    key: "slug",
    header: "Slug",
    cell: (row) => row.slug,
    value: (row) => row.slug,
    sortable: true,
  },
  {
    key: "summary",
    header: "Summary",
    cell: (row) => row.summary ?? "",
    value: (row) => row.summary ?? "",
  },
];

/**
 * The table, over the rows the server read.
 *
 * A client component because the column definitions carry functions, and a function cannot cross
 * from a server component into a client one. The rows themselves are plain data, and they were
 * read on the server through the one module this host has for reaching Payload.
 */
export function PagesTable({ pages }: { pages: PageDocument[] }) {
  return (
    <AdminDataTable
      columns={columns}
      rows={pages}
      getKey={(row) => row.id}
      search
      searchLabel="Search pages"
      searchPlaceholder="Title or slug"
      empty={
        <AdminEmptyState
          title="No pages yet"
          body="The list is empty because the collection is. Write one in Payload's editor."
        />
      }
    />
  );
}
