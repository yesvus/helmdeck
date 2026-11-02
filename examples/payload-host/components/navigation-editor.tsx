"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Link2 } from "lucide-react";
import {
  AdminCollectionEditor,
  AdminDialogProvider,
  AdminSectionCard,
  type AdminCollectionDefinition,
  type AdminCollectionEntry,
} from "@yesvus/helmdeck";
import { saveNavigationMenu, type NavigationMenuItem } from "@/lib/navigation-actions";
import type { PageDocument } from "@/lib/payload/content";

function toEntries(items: NavigationMenuItem[]): AdminCollectionEntry<NavigationMenuItem>[] {
  return items.map((item, index) => ({
    id: item.id ?? `nav_${index}`,
    label: item.label,
    targetKind: item.targetKind,
    internalPage: item.internalPage ?? null,
    url: item.url ?? null,
    sortOrder: item.sortOrder ?? index,
  }));
}

export function NavigationEditor({ initialItems, pages }: { initialItems: NavigationMenuItem[]; pages: PageDocument[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState<AdminCollectionEntry<NavigationMenuItem>[]>(toEntries(initialItems));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pageSlugs = pages.map((page) => page.slug);

  const definition: AdminCollectionDefinition<NavigationMenuItem> = {
    name: "navigationItems",
    fields: [
      { name: "label" },
      { name: "targetKind" },
      { name: "internalPage" },
      { name: "url" },
      { name: "sortOrder" },
    ],
    create: () => ({
      label: "",
      targetKind: "url",
      internalPage: null,
      url: "",
      sortOrder: entries.length,
    }),
    validate: (entry) => {
      const problems: { field: string; message: string }[] = [];
      if (!entry.label?.trim()) problems.push({ field: "label", message: "Label is required." });
      if (entry.targetKind === "url") {
        if (!entry.url || !/^https?:\/\//.test(entry.url) && !entry.url.startsWith("/")) {
          problems.push({ field: "url", message: "A valid URL is required." });
        }
      } else {
        if (!entry.internalPage) problems.push({ field: "internalPage", message: "An internal page is required." });
        else if (pageSlugs.length && !pageSlugs.includes(entry.internalPage)) {
          problems.push({ field: "internalPage", message: "That page does not exist." });
        }
      }
      return problems;
    },
  };

  async function handleSave() {
    setBusy(true);
    setError("");
    const result = await saveNavigationMenu(entries.map((entry, index) => ({
      id: entry.id,
      label: entry.label,
      targetKind: entry.targetKind,
      internalPage: entry.internalPage ?? null,
      url: entry.url ?? null,
      sortOrder: index,
    })), pageSlugs);
    if (!result.ok) setError(result.error);
    else await router.refresh();
    setBusy(false);
  }

  return (
    <AdminDialogProvider>
      <div className="space-y-6">
        <AdminSectionCard icon={Link2} title="Navigation items">
          <AdminCollectionEditor
            definition={definition}
            entries={entries}
            onChange={setEntries}
            title="Menu"
            renderSummary={(entry) => entry.label?.trim() || "Untitled"}
            renderFields={(entry) => (
              <div className="flex flex-col gap-3">
                <label className="text-xs">
                  Label
                  <input className="ml-2 rounded border border-admin-border px-2 py-1 text-sm" value={entry.label ?? ""} onChange={(e) => setEntries((prev) => prev.map((x) => x.id === entry.id ? { ...x, label: e.target.value } : x))} />
                </label>
                <label className="text-xs">
                  Target
                  <select className="ml-2 rounded border border-admin-border px-2 py-1 text-sm" value={entry.targetKind} onChange={(e) => setEntries((prev) => prev.map((x) => x.id === entry.id ? { ...x, targetKind: e.target.value as "internal" | "url" } : x))}>
                    <option value="url">URL</option>
                    <option value="internal">Internal page</option>
                  </select>
                </label>
                {entry.targetKind === "internal" ? (
                  <label className="text-xs">
                    Page
                    <select className="ml-2 rounded border border-admin-border px-2 py-1 text-sm" value={entry.internalPage ?? ""} onChange={(e) => setEntries((prev) => prev.map((x) => x.id === entry.id ? { ...x, internalPage: e.target.value } : x))}>
                      <option value="">Select page</option>
                      {pages.map((page) => <option key={page.id} value={page.slug}>{page.title} ({page.slug})</option>)}
                    </select>
                  </label>
                ) : (
                  <label className="text-xs">
                    URL
                    <input className="ml-2 rounded border border-admin-border px-2 py-1 text-sm" value={entry.url ?? ""} onChange={(e) => setEntries((prev) => prev.map((x) => x.id === entry.id ? { ...x, url: e.target.value } : x))} />
                  </label>
                )}
              </div>
            )}
          />
        </AdminSectionCard>
        {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
        <button type="button" disabled={busy} onClick={() => void handleSave()} className="inline-flex items-center gap-1 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />
          {busy ? "Saving…" : "Save menu"}
        </button>
      </div>
    </AdminDialogProvider>
  );
}
