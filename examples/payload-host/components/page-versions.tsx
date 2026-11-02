"use client";

import { useState } from "react";
import { Diff, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { AdminDataTable, AdminDialogProvider, AdminEmptyState, AdminStatusPill, AdminTableActionButton, useAdminDialog, type AdminDataTableColumn } from "@yesvus/helmdeck";
import { adminPayloadVersionDiff } from "@yesvus/helmdeck";
import { restorePageVersion } from "@/lib/pages-actions";

type VersionDoc = {
  id: string | number;
  createdAt?: string | null;
  createdBy?: unknown;
  version?: { _status?: string | null; title?: string | null } | null;
  [key: string]: unknown;
};

function versionStatus(doc: VersionDoc): "published" | "draft" {
  const status = doc.version?._status ?? (doc as { _status?: unknown })._status;
  return status === "published" ? "published" : "draft";
}

function versionWhen(doc: VersionDoc): string {
  const v = doc.createdAt;
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function versionAuthor(doc: VersionDoc): string {
  const cb = doc.createdBy;
  if (typeof cb === "string") return cb;
  if (cb && typeof cb === "object") {
    const rec = cb as { email?: unknown; name?: unknown; id?: unknown };
    if (typeof rec.email === "string") return rec.email;
    if (typeof rec.name === "string") return rec.name;
    if (typeof rec.id === "string" || typeof rec.id === "number") return String(rec.id);
  }
  return "unknown";
}

function unwrap(doc: VersionDoc): Record<string, unknown> {
  if (doc.version && typeof doc.version === "object") return doc.version as Record<string, unknown>;
  return doc as Record<string, unknown>;
}

function PageVersionsInner({ versions, canRestore }: { versions: unknown[]; canRestore: boolean }) {
  const router = useRouter();
  const dialog = useAdminDialog();
  const docs = versions as VersionDoc[];
  const [selectedId, setSelectedId] = useState<string | number | null>(docs[0]?.id ?? null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selectedIndex = docs.findIndex((d) => d.id === selectedId);
  const selected = selectedIndex >= 0 ? docs[selectedIndex] : null;
  const previous = selectedIndex >= 0 && selectedIndex + 1 < docs.length ? docs[selectedIndex + 1] : null;
  const diff = selected ? adminPayloadVersionDiff(previous ? unwrap(previous) : {}, unwrap(selected)) : [];

  async function restore(versionId: string | number) {
    if (!canRestore) return;
    const confirmed = await dialog.confirm({ title: "Restore version?", description: "Put this version back as the current page?", confirmLabel: "Restore" });
    if (!confirmed) return;
    setPending(String(versionId));
    setError("");
    try {
      const result = await restorePageVersion(String(versionId));
      if (!result.ok) setError(result.error);
      else router.refresh();
    } catch {
      setError("Could not restore this version");
    } finally {
      setPending(null);
    }
  }

  const columns: AdminDataTableColumn<VersionDoc>[] = [
    { key: "when", header: "Version at", cell: (row) => versionWhen(row), value: (row) => versionWhen(row), sortable: true },
    { key: "author", header: "Author", cell: (row) => versionAuthor(row), value: (row) => versionAuthor(row) },
    { key: "status", header: "Status", cell: (row) => <AdminStatusPill tone={versionStatus(row) === "published" ? "success" : "neutral"} label={versionStatus(row) === "published" ? "Published" : "Draft"} />, value: (row) => versionStatus(row) },
    {
      key: "actions",
      header: "Actions",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <AdminTableActionButton label="Diff" icon={<Diff className="h-4 w-4" />} onClick={() => setSelectedId(row.id)} />
          {canRestore ? (
            <AdminTableActionButton label={pending === String(row.id) ? "Restoring…" : "Restore"} icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restore(row.id)} />
          ) : null}
        </div>
      ),
      value: () => "",
    },
  ];

  return (
    <div className="space-y-6">
        {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
        {docs.length === 0 ? (
          <AdminEmptyState title="Nothing recorded yet" body="Versions appear after the first change to this page." />
        ) : (
          <AdminDataTable columns={columns} rows={docs} getKey={(row) => row.id} search searchLabel="Search versions" searchPlaceholder="Version or author" empty={<AdminEmptyState title="Nothing to show" body="No versions matched." />} />
        )}
        {selected ? (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900">Field diff</h2>
            {diff.length === 0 ? (
              <p className="text-sm text-zinc-500">No field changes.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-admin-border">
                    <th className="px-2 py-1 text-left">Field</th>
                    <th className="px-2 py-1 text-left">Before</th>
                    <th className="px-2 py-1 text-left">After</th>
                    <th className="px-2 py-1 text-left">Kind</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map((entry: { field: string; before?: unknown; after?: unknown; kind: string }) => (
                    <tr key={entry.field} className="border-b border-admin-border">
                      <td className="px-2 py-1 font-medium">{entry.field}</td>
                      <td className="px-2 py-1 text-zinc-600">{String(entry.before ?? "")}</td>
                      <td className="px-2 py-1 text-zinc-600">{String(entry.after ?? "")}</td>
                      <td className="px-2 py-1">{entry.kind}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>
  );
}

export function PageVersions(props: { versions: unknown[]; canRestore: boolean }) {
  return (
    <AdminDialogProvider>
      <PageVersionsInner {...props} />
    </AdminDialogProvider>
  );
}
