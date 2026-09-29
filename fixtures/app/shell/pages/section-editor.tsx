// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AdminCollectionEditor,
  AdminDashboardLayout,
  AdminField,
  AdminInput,
  AdminSelect,
  AdminSortableDndContext,
  AdminSortableToast,
  adminCollectionReorder,
  adminWidgetSizes,
  useAdminSortableList,
  type AdminWidgetSize,
} from "@yesvus/helmdeck";
import {
  landingSectionCopy,
  landingSectionName,
  landingSections,
  landingWidgets,
  type LandingSection,
} from "./landing-registry";
import { saveLandingSections } from "../../../lib/demo-collections";

const sectionId = (section: LandingSection) => section.id;

/**
 * The landing page, arranged with the engine's collection editor and stored as rows.
 *
 * The value lives here rather than inside the editor because the editor holds none of its own, and it
 * goes to the server on every change because a demo that forgets a reload is not showing persistence.
 * A drag reorders locally first and the write follows, so the list never waits on the network to feel
 * responsive, and a failed write says so rather than leaving a reorder that looks saved and is not.
 *
 * The drag context and the toast are supplied here. The editor renders the cards and the handles and
 * asks the sortable hook for everything a drag needs, but renders no context for them to attach to, so
 * without a provider below, `useSortable` registers nothing and both pointer and keyboard reordering
 * are inert. That context is a shipped primitive, so composing it here is the same wiring the editor
 * does internally, placed where the persistence already is.
 */
export function LandingPageEditor({ initial }: { initial: LandingSection[] }) {
  const [entries, setEntries] = useState(initial);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const persist = useCallback(async (next: LandingSection[]) => {
    setSaveState("saving");
    setSaveError(null);
    try {
      await saveLandingSections(next);
      setSaveState("saved");
    } catch (cause) {
      setSaveState("failed");
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const change = useCallback(
    (next: LandingSection[]) => {
      setEntries(next);
      void persist(next);
    },
    [persist],
  );

  // Rebuilt whenever the arrangement changes, so a drag that lands after a field edit reorders the
  // list as it is now rather than the copy the drag started from.
  const sortable = useAdminSortableList<LandingSection>({
    items: entries,
    getId: sectionId,
    onReorder: async (orderedIds) => {
      // Ordered by identity rather than by index, so a list that changed under the drag degrades to a
      // partial move instead of dropping a section.
      change(adminCollectionReorder(entries, orderedIds));
      return { success: true, message: "Section order saved" };
    },
  });

  const states = useMemo(
    () =>
      Object.fromEntries(
        entries.map((entry) => [
          entry.id,
          {
            status: "ready" as const,
            data: { heading: entry.title || landingSectionName(entry.widget), copy: landingSectionCopy(entry.widget) },
          },
        ]),
      ),
    [entries],
  );

  const patch = useCallback(
    (id: string, changes: Partial<Omit<LandingSection, "id">>) => {
      change(entries.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
    },
    [change, entries],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-zinc-900">Landing page</h1>
        <p className="text-sm text-zinc-500">
          Sections in the order they appear, stored as rows. Reorder by dragging the handle or by
          focusing it and using the arrow keys. Every change is written, so a reload shows what is here.
        </p>
      </header>

      <p aria-live="polite" className="text-xs text-zinc-500">
        {saveState === "saving"
          ? "Saving…"
          : saveState === "failed"
            ? `Not saved: ${saveError}`
            : saveState === "saved"
              ? "Saved"
              : `${entries.length} sections, loaded from the database`}
      </p>

      <AdminSortableDndContext
        ids={sortable.ids}
        sensors={sortable.sensors}
        announcements={sortable.announcements}
        onDragEnd={sortable.handleDragEnd}
      >
        <AdminCollectionEditor
          definition={landingSections}
          entries={entries}
          onChange={change}
          title="Sections"
          addLabel="Add section"
          emptyTitle="No sections yet"
          emptyBody="Add the first section to build the page."
          renderSummary={(entry) =>
            entry.widget
              ? `${entry.title || landingSectionName(entry.widget)} · ${entry.size}`
              : "Choose a section"
          }
          renderFields={(entry) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="Section">
                <AdminSelect
                  value={entry.widget}
                  onChange={(event) => {
                    const widget = event.target.value;
                    // A width the new section does not support would be an arrangement the registry
                    // rejects, so it moves to one the section agreed to rather than being left to
                    // fail validation on the entry.
                    const sizes = landingWidgets.resolve(widget)?.sizes;
                    patch(entry.id, {
                      widget,
                      size: sizes?.includes(entry.size) ? entry.size : (sizes?.[0] ?? entry.size),
                    });
                  }}
                >
                  <option value="">Choose a section…</option>
                  {landingWidgets.list().map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.title}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>

              <AdminField label="Width">
                <AdminSelect
                  value={entry.size}
                  onChange={(event) => patch(entry.id, { size: event.target.value as AdminWidgetSize })}
                >
                  {adminWidgetSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>

              <AdminField label="Heading" className="sm:col-span-2">
                <AdminInput
                  value={entry.title}
                  onChange={(event) => patch(entry.id, { title: event.target.value })}
                  placeholder={entry.widget ? landingSectionName(entry.widget) : "Name this section"}
                />
              </AdminField>
            </div>
          )}
        />
      </AdminSortableDndContext>

      <AdminSortableToast toast={sortable.toast} onDismiss={sortable.dismissToast} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">What the arrangement renders</h2>
        <AdminDashboardLayout
          registry={landingWidgets}
          placements={entries}
          states={states}
        />
      </section>
    </div>
  );
}
