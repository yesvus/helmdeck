// SPDX-License-Identifier: MIT
"use client";

/**
 * Arranging the dashboard: the saved rows, editable and written back through the arrangement action.
 *
 * The editor is the engine's collection editor over placements, because a placement is a collection
 * entry and reordering one is the same job as reordering any other ordered list. It is uncontrolled,
 * so this holds the value and every change is a save: there is no "apply" step, and what the editor
 * shows is what the store was last told.
 *
 * A change is only sent when the whole arrangement is one this build can render. The editor already
 * shows a message against every offending entry, so posting a save the server must refuse would turn
 * a field the person is still filling in into an error banner. What the server refuses is the
 * answer, and the same check runs there.
 */

import Link from "next/link";
import {
  AdminBanner,
  AdminCollectionEditor,
  AdminField,
  AdminSelect,
  adminCollectionValidate,
  adminDashboardCollection,
  adminWidgetSizes,
  type AdminCollectionEntry,
  type AdminDashboard,
  type AdminDashboardPlacement,
  type AdminWidgetSize,
} from "@yesvus/helmdeck";
import { useCallback, useRef, useState } from "react";
import { saveDashboardArrangementAction } from "../../../lib/demo-dashboard-arrangement";
import { dashboardRegistry } from "../registry";

/** The editor's own options, with whatever the row holds added, so a stale value stays visible. */
function withCurrent(options: readonly string[], current: string): string[] {
  return options.includes(current) ? [...options] : [...options, current];
}

function reasonFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The arrangement could not be saved.";
}

export default function DashboardArranger({ dashboard }: { dashboard: AdminDashboard }) {
  const [entries, setEntries] = useState<AdminCollectionEntry<{ widget: string; size: AdminWidgetSize }>[]>(
    dashboard.placements,
  );
  const [refusal, setRefusal] = useState<string | null>(null);
  // The last answer the store gave, so a save that is refused puts the arrangement back rather than
  // leaving the editor showing something the rows do not say.
  const committed = useRef(dashboard.placements);
  // Answers are applied only while they are the newest, because two saves can settle in either order
  // and an older answer would undo the change the person made after it.
  const newest = useRef(0);

  const definition = adminDashboardCollection(dashboardRegistry);

  const onChange = useCallback(
    (next: AdminDashboardPlacement[]) => {
      setEntries(next);
      setRefusal(null);
      if (adminCollectionValidate(definition, next).length > 0) return;

      const ticket = (newest.current += 1);
      void saveDashboardArrangementAction(
        dashboard.name,
        next.map(({ id, widget, size }) => ({ id, widget, size })),
      ).then(
        (saved) => {
          if (newest.current !== ticket) return;
          committed.current = saved.placements;
          setEntries(saved.placements);
        },
        (cause: unknown) => {
          if (newest.current !== ticket) return;
          setEntries(committed.current);
          setRefusal(reasonFor(cause));
        },
      );
    },
    [dashboard.name, definition],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-zinc-900">Arrange the dashboard</h1>
          <p className="text-sm text-zinc-500">
            Which widgets the dashboard shows, in what order, and how wide each one is. Every change is
            saved to the placements table as it is made.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm font-semibold text-admin-brand-text hover:underline">
          Back to the dashboard
        </Link>
      </header>

      {refusal ? <AdminBanner tone="danger" title="Not saved" body={refusal} /> : null}

      <AdminCollectionEditor
        definition={definition}
        entries={entries}
        onChange={onChange}
        title="Placements"
        addLabel="Add a widget"
        renderSummary={(entry) => (
          <span className="flex flex-wrap items-baseline gap-2">
            <span>{dashboardRegistry.resolve(entry.widget)?.title ?? entry.widget}</span>
            <span className="text-xs font-normal text-zinc-500">{entry.size}</span>
          </span>
        )}
        renderFields={(entry) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Widget" hint="A widget this build does not register cannot be saved.">
              <AdminSelect
                aria-label="Widget"
                value={entry.widget}
                onChange={(event) =>
                  onChange(
                    entries.map((current) =>
                      current.id === entry.id ? { ...current, widget: event.target.value } : current,
                    ),
                  )
                }
              >
                {withCurrent(
                  dashboardRegistry.list().map((widget) => widget.id),
                  entry.widget,
                ).map((widget) => (
                  <option key={widget} value={widget}>
                    {dashboardRegistry.resolve(widget)?.title ?? `${widget} (not registered)`}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Size" hint="Only the sizes this widget supports.">
              <AdminSelect
                aria-label="Size"
                value={entry.size}
                onChange={(event) =>
                  onChange(
                    entries.map((current) =>
                      current.id === entry.id
                        ? { ...current, size: event.target.value as AdminWidgetSize }
                        : current,
                    ),
                  )
                }
              >
                {withCurrent(
                  (dashboardRegistry.resolve(entry.widget)?.sizes ?? adminWidgetSizes).slice(),
                  entry.size,
                ).map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          </div>
        )}
      />
    </div>
  );
}
