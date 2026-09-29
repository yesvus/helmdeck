// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";
import { Button } from "../primitives/button.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminDragHandle, AdminSortableCard, useAdminSortableList } from "../primitives/sortable-list.js";
import {
  adminCollectionAdd,
  adminCollectionDuplicateAt,
  adminCollectionRemoveAt,
  adminCollectionValidate,
  type AdminCollectionDefinition,
  type AdminCollectionEntry,
} from "./registry.js";

/**
 * The editing surface for a collection: pointer and keyboard reordering, add, duplicate, remove,
 * selection, and edit-time validation.
 *
 * Reordering is bound to the same dnd-kit machinery the sortable card already uses, rather than to a
 * second drag implementation. The engine owns the collection mechanics and identity; the host
 * renders each entry's own fields through `renderFields`, because those fields are Helmdeck
 * primitives and a schema-driven form engine would be a second form system rather than a saving.
 *
 * Uncontrolled by design: this owns no copy of the entries. A dashboard layout is persisted and
 * server-rendered, so the host has to hold the value, and a component that kept its own would
 * silently disagree with it.
 */
export function AdminCollectionEditor<T>({
  definition,
  entries,
  onChange,
  renderFields,
  renderSummary,
  title,
  addLabel,
  emptyTitle,
  emptyBody,
  emptyAction,
  className,
}: {
  definition: AdminCollectionDefinition<T>;
  entries: AdminCollectionEntry<T>[];
  onChange: (entries: AdminCollectionEntry<T>[]) => void;
  /** The host's own fields for the selected entry, using Helmdeck primitives. */
  renderFields?: (entry: AdminCollectionEntry<T>, index: number) => ReactNode;
  renderSummary?: (entry: AdminCollectionEntry<T>, index: number) => ReactNode;
  title?: string;
  addLabel?: string;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  className?: string;
}) {
  const i18n = useAdminMessages();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const baseId = useId();

  const labels = {
    add: addLabel ?? i18n.collection.add,
    remove: i18n.collection.remove,
    duplicate: i18n.collection.duplicate,
    edit: i18n.collection.edit,
  };

  // A reorder is acknowledged immediately. The hook persists optimistically and reverts on failure,
  // and the engine is the authority, so the local list is the truth until the host says otherwise.
  const sortable = useAdminSortableList<AdminCollectionEntry<T>>({
    items: entries,
    getId: (entry) => entry.id,
    onReorder: async (orderedIds) => {
      // The hook acknowledges optimistically and reverts on failure, so the engine is the authority
      // and the host is told the new order. The toast copy comes from the sortable dictionary
      // rather than a second collection string saying the same thing.
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      const ordered = orderedIds.flatMap((id) => {
        const entry = byId.get(id);
        return entry ? [entry] : [];
      });
      onChange(ordered);
      return { success: true, message: i18n.sortable.toastSuccessTitle };
    },
  });

  const problems = useMemo(() => adminCollectionValidate(definition, entries), [definition, entries]);
  const problemsById = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const problem of problems) {
      grouped.set(problem.id, [...(grouped.get(problem.id) ?? []), problem.message]);
    }
    return grouped;
  }, [problems]);

  const handleAdd = useCallback(() => {
    const next = adminCollectionAdd(entries, definition.create());
    onChange(next);
    // Selecting what was just added means a keyboard user is not dropped at the top of a list they
    // cannot see, which is the whole point of adding it.
    setSelectedId(next[next.length - 1]?.id ?? null);
  }, [definition, entries, onChange]);

  const handleRemove = useCallback(
    (id: string) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) return;
      onChange(adminCollectionRemoveAt(entries, index));
      setSelectedId((current) => (current === id ? null : current));
    },
    [entries, onChange],
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) return;
      onChange(adminCollectionDuplicateAt(entries, index));
    },
    [entries, onChange],
  );

  return (
    <section className={cn("rounded-admin-card border border-admin-border bg-admin-surface", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-4 border-b border-admin-border bg-admin-surface-subtle px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          {/* While empty the empty state below is the call to action. Rendering both left two
              identical controls on screen, which reads as a mistake and duplicates the tab stop. */}
          {entries.length > 0 ? (
            <Button type="button" size="sm" onClick={handleAdd}>
              <Plus className="h-4 w-4" />
              {labels.add}
            </Button>
          ) : null}
        </div>
      ) : null}

      {entries.length === 0 ? (
        // A new host lands on this first, so a blank panel would read as a broken editor rather than
        // an empty one.
        <div className="p-5">
          <AdminEmptyState title={emptyTitle ?? i18n.collection.emptyTitle} body={emptyBody ?? i18n.collection.emptyBody} action={emptyAction ?? (
            <Button type="button" size="sm" onClick={handleAdd}>
              <Plus className="h-4 w-4" />
              {labels.add}
            </Button>
          )} />
        </div>
      ) : (
        <ul className="flex flex-col">
          {sortable.orderedItems.map((entry, index) => {
            const entryProblems = problemsById.get(entry.id) ?? [];
            const isSelected = selectedId === entry.id;
            const selected = isSelected ? "border-admin-brand-500" : "border-admin-border";
            return (
              <li key={entry.id} className="border-b border-admin-border last:border-b-0">
                <AdminSortableCard id={entry.id} className={cn("flex flex-col gap-3 px-5 py-4", selected)}>
                  <div className="flex items-center gap-3">
                    <AdminDragHandle label={`${labels.edit} ${index + 1}`} />
                    <button
                      type="button"
                      aria-expanded={isSelected}
                      aria-controls={`${baseId}-fields-${entry.id}`}
                      onClick={() => setSelectedId(isSelected ? null : entry.id)}
                      className="min-w-0 flex-1 text-left text-sm font-semibold text-zinc-900"
                    >
                      {renderSummary?.(entry, index) ?? title ?? `${labels.edit} ${index + 1}`}
                    </button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => handleDuplicate(entry.id)} aria-label={`${labels.duplicate} ${index + 1}`}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => handleRemove(entry.id)} aria-label={`${labels.remove} ${index + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {entryProblems.length > 0 ? (
                    <ul role="alert" className="flex flex-col gap-1">
                      {entryProblems.map((message) => (
                        <li key={message} className="text-xs font-medium text-admin-danger-text">
                          {message}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {isSelected && renderFields ? (
                    <div id={`${baseId}-fields-${entry.id}`} className="flex flex-col gap-3 rounded-lg border border-admin-border bg-admin-surface-subtle p-4">
                      {renderFields(entry, index)}
                    </div>
                  ) : null}
                </AdminSortableCard>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
