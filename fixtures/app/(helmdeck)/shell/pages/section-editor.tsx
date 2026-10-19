// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AdminCollectionEditor,
  AdminDashboardLayout,
  AdminField,
  AdminMediaField,
  AdminInput,
  AdminSelect,
  adminWidgetSizes,
  useAdminContentLocale,
  useAdminInterfaceLocale,
  type AdminWidgetSize,
} from "@yesvus/helmdeck";
import {
  landingSectionCopy,
  landingSectionName,
  landingSections,
  landingWidgets,
  type LandingSection,
} from "./landing-registry";
import { saveLandingSections } from "../../../../lib/demo-collections";
import { getDemoMediaCatalogItems } from "../../../../media";

const landingMediaItems = getDemoMediaCatalogItems();

/**
 * The landing page, arranged with the engine's collection editor and stored as rows.
 *
 * The value lives here rather than inside the editor because the editor holds none of its own, and it
 * goes to the server on every change because a demo that forgets a reload is not showing persistence.
 * A reorder reaches the server the same way an add does: the editor reports the whole collection
 * through `onChange`, and the store reconciles against what is stored.
 *
 * **There is no drag context here, and that is the point.** An earlier version of this page wrapped
 * the editor in `AdminSortableDndContext` and kept a second `useAdminSortableList` to drive it, because
 * the editor rendered the handles without providing the context they attach to, so both pointer and
 * keyboard reordering were inert. That is a gap a host cannot see: the handle still looked like a
 * control and still took a tab stop. The editor provides its own context now, and this page renders
 * the component it was given, which is the only arrangement in which this demo is evidence that a
 * host who has never read the engine's internals gets a working reorder.
 */
export function LandingPageEditor({ initial }: { initial: LandingSection[] }) {
  const [entries, setEntries] = useState(initial);
  const { contentLocale } = useAdminContentLocale();
  const { interfaceLocale } = useAdminInterfaceLocale();
  const activeContentLocale = contentLocale || interfaceLocale;
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

  const states = useMemo(
    () =>
      Object.fromEntries(
        entries.map((entry) => [
          entry.id,
          {
            status: "ready" as const,
            data: {
              heading: entry.titleByLocale?.[activeContentLocale] || entry.title || landingSectionName(entry.widget),
              copy: landingSectionCopy(entry.widget),
              mediaUrl: entry.mediaUrl ?? "",
              mediaAlt: entry.mediaAlt ?? "",
            },
          },
        ]),
      ),
    [activeContentLocale, entries],
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
            ? `${entry.titleByLocale?.[activeContentLocale] || entry.title || landingSectionName(entry.widget)} · ${entry.size}`
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

            <AdminField label="English heading">
              <AdminInput
                value={entry.titleByLocale?.en ?? ""}
                onChange={(event) => patch(entry.id, { titleByLocale: { ...entry.titleByLocale, en: event.target.value } })}
              />
            </AdminField>

            <AdminField label="Turkish heading">
              <AdminInput
                value={entry.titleByLocale?.tr ?? ""}
                onChange={(event) => patch(entry.id, { titleByLocale: { ...entry.titleByLocale, tr: event.target.value } })}
              />
            </AdminField>

            <div className="sm:col-span-2">
              <AdminMediaField
                items={landingMediaItems}
                label="Section image"
                name={`section-image-${entry.id}`}
                defaultValue={entry.mediaUrl}
                onValueChange={(mediaUrl) => patch(entry.id, { mediaUrl })}
              />
            </div>

            <AdminField label="Image description" className="sm:col-span-2">
              <AdminInput
                value={entry.mediaAlt ?? ""}
                onChange={(event) => patch(entry.id, { mediaAlt: event.target.value })}
              />
            </AdminField>
          </div>
        )}
      />

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
