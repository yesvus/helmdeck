"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, History, Pencil, Trash2 } from "lucide-react";
import { AdminDataTable, AdminEmptyState, AdminDialogProvider, AdminDestructiveAction, AdminStatusPill, AdminTableActionButton, AdminTableRowActions, useAdminDialog, type AdminDataTableColumn } from "@yesvus/helmdeck";
import type { PageDocument } from "@/lib/payload/content";
import { removePage, schedulePage } from "@/lib/pages-actions";

function RowActions({ page }: { page: PageDocument }) {
  const dialog = useAdminDialog();
  const [error, setError] = useState("");
  return <AdminTableRowActions label={`Actions for ${page.title}`}>
    <Link href={`/admin/pages/${encodeURIComponent(page.id)}/versions`}><AdminTableActionButton label="History" icon={<History className="h-4 w-4" />} /></Link>
    <Link href={`/payload/admin/collections/pages/${encodeURIComponent(page.id)}`}><AdminTableActionButton label="Edit" icon={<Pencil className="h-4 w-4" />} /></Link>
    <AdminTableActionButton label="Schedule" icon={<CalendarClock className="h-4 w-4" />} onClick={async () => {
      const at = await dialog.prompt({ title: "Schedule publish", description: `Choose a date and time for ${page.title}.`, inputLabel: "Publish at", inputProps: { type: "datetime-local" }, confirmLabel: "Schedule" });
      if (!at) return;
      const result = await schedulePage(page.id, at);
      setError(result.ok ? "" : result.error);
    }} />
    <AdminDestructiveAction buttonText="Delete" triggerVariant="ghost" triggerAriaLabel={`Delete ${page.title}`} icon={<Trash2 className="h-4 w-4" />} title="Delete page?" description={`Delete ${page.title}? This cannot be undone.`} onConfirm={async () => {
      const confirmed = await dialog.confirm({ title: "Delete page?", description: `Delete ${page.title}? This cannot be undone.`, destructive: true, confirmLabel: "Delete" });
      if (confirmed) { const result = await removePage(page.id); setError(result.ok ? "" : result.error); }
    }} />
    {error ? <span role="alert" className="text-xs text-red-700">{error}</span> : null}
  </AdminTableRowActions>;
}

const columns: AdminDataTableColumn<PageDocument>[] = [
  { key: "title", header: "Title", cell: (row) => row.title, value: (row) => row.title, sortable: true },
  { key: "slug", header: "Slug", cell: (row) => row.slug, value: (row) => row.slug, sortable: true },
  { key: "status", header: "Status", cell: (row) => <AdminStatusPill tone={row._status === "published" ? "success" : "neutral"} label={row._status === "published" ? "Published" : "Draft"} />, value: (row) => row._status ?? "draft" },
  { key: "summary", header: "Summary", cell: (row) => row.summary ?? "", value: (row) => row.summary ?? "" },
  { key: "actions", header: "Actions", cell: (row) => <RowActions page={row} />, value: () => "" },
];

export function PagesTable({ pages }: { pages: PageDocument[] }) {
  return <AdminDialogProvider><AdminDataTable columns={columns} rows={pages} getKey={(row) => row.id} search searchLabel="Search pages" searchPlaceholder="Title or slug" empty={<AdminEmptyState title="Nothing to show" body="The collection is empty, or the search matched nothing. Write a page in Payload's editor." />} /></AdminDialogProvider>;
}
