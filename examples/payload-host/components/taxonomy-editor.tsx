"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Tags, Pencil } from "lucide-react";
import {
  AdminDialogProvider,
  AdminEmptyState,
  AdminSectionCard,
  AdminTableActionButton,
  useAdminDialog,
} from "@yesvus/helmdeck";
import { createTerm, deleteTerm, renameTerm, type NavigationTerm } from "@/lib/navigation-actions";

function TermList({ collection, title, initial }: { collection: string; title: string; initial: NavigationTerm[] }) {
  const router = useRouter();
  const dialog = useAdminDialog();
  const [terms] = useState(initial);
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    router.refresh();
  }

  async function handleCreate() {
    setBusy("create");
    setError("");
    const result = await createTerm(collection, label, slug);
    if (!result.ok) setError(result.error);
    else {
      setLabel("");
      setSlug("");
      await refresh();
    }
    setBusy("");
  }

  async function handleRename(term: NavigationTerm) {
    const next = window.prompt("Rename term", term.label);
    if (next === null || !next.trim() || next.trim() === term.label) return;
    setBusy(`rename:${term.id}`);
    setError("");
    const result = await renameTerm(collection, term.id, next.trim());
    if (!result.ok) setError(result.error);
    else await refresh();
    setBusy("");
  }

  async function handleDelete(term: NavigationTerm) {
    const confirmed = await dialog.confirm({
      title: `Delete ${title.toLowerCase()}?`,
      description: `Delete "${term.label}"? This cannot be undone.`,
      destructive: true,
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    setBusy(`delete:${term.id}`);
    setError("");
    const result = await deleteTerm(collection, term.id);
    if (!result.ok) setError(result.error);
    else await refresh();
    setBusy("");
  }

  return (
    <AdminSectionCard icon={Tags} title={title}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            Label
            <input className="ml-2 rounded border border-admin-border px-2 py-1 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="text-xs">
            Slug
            <input className="ml-2 rounded border border-admin-border px-2 py-1 text-sm" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </label>
          <button type="button" disabled={busy === "create"} onClick={() => void handleCreate()} className="inline-flex items-center gap-1 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" />
            {busy === "create" ? "Creating…" : "Create"}
          </button>
        </div>
        {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
        {terms.length === 0 ? (
          <AdminEmptyState title={`No ${title.toLowerCase()}`} body={`Create the first ${title.toLowerCase().replace(/s$/, "")} above.`} />
        ) : (
          <ul className="divide-y divide-admin-border rounded border border-admin-border">
            {terms.map((term) => (
              <li key={term.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{term.label}</span>
                  <span className="ml-2 text-xs text-zinc-500">{term.slug}</span>
                </span>
                <div className="flex items-center gap-2">
                  <AdminTableActionButton label="Rename" icon={<Pencil className="h-4 w-4" />} onClick={() => void handleRename(term)} />
                  <button type="button" aria-label={`Delete ${term.label}`} onClick={() => void handleDelete(term)} className="text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminSectionCard>
  );
}

export function TaxonomyEditor({ categories, tags }: { categories: NavigationTerm[]; tags: NavigationTerm[] }) {
  return (
    <AdminDialogProvider>
      <div className="space-y-6">
        <TermList collection="categories" title="Categories" initial={categories} />
        <TermList collection="tags" title="Tags" initial={tags} />
      </div>
    </AdminDialogProvider>
  );
}
