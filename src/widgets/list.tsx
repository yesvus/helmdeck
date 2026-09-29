// SPDX-License-Identifier: MIT

/**
 * A list tile: a ranked or a recent handful of things, each with a figure beside it.
 *
 * The judgement here is the shape of a row. A label can be any length and a figure must not be
 * wrapped, so the label truncates and keeps its full text in a title, the figure holds its width,
 * and the note under the label is the quieter of the two. A host writing this markup gets a
 * truncated product name and an overlapping price on about every project, and the fix is never
 * obvious from the markup that caused it.
 *
 * The cap is the same one the table tile makes, for the same reason: a list inside a tile either
 * grows without bound or is cut with nothing said about what was cut. A list's default is shorter
 * than a table's, because a list's rows are read rather than compared.
 *
 * Server-safe, and built from elements so a dashboard of these tiles stays renderable on the server.
 */

import type { ReactNode } from "react";
import type { AdminChartUnit } from "../charts/table.js";
import { adminFormatCents, adminFormatCount } from "../charts/money.js";
import { cn } from "../cn.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminSkeleton } from "../primitives/skeleton.js";
import { adminToneClasses, type AdminTone } from "../primitives/tone.js";
import { defineAdminWidget } from "./registry.js";
import {
  adminWidgetCappedRows,
  adminWidgetRequired,
  adminWidgetRowKey,
  adminWidgetRows,
  type AdminWidgetCap,
  type AdminWidgetEmptyCopy,
} from "./values.js";
import type { AdminWidgetDefinition, AdminWidgetSize } from "./types.js";

/** One row as the tile resolved it: what the label, figure and note accessors answered. */
export type AdminListWidgetItem = {
  key: string;
  label: ReactNode;
  /** The figure beside the label, printed in the row's tone. */
  value?: number | string | null;
  note?: ReactNode;
  tone?: AdminTone;
};

export type AdminListWidgetOptions<TRow, TData = readonly TRow[]> = {
  id: string;
  title: string;
  description?: string;
  /** Reads the rows. Answering with nothing is how the data declares the tile empty. */
  rows: (data: TData) => readonly TRow[] | null | undefined;
  label: (row: TRow) => ReactNode;
  value?: (row: TRow) => number | string | null | undefined;
  note?: (row: TRow) => ReactNode;
  tone?: (row: TRow) => AdminTone;
  /**
   * What a numeric value is measured in. `money` reads it as whole cents, which is where the
   * division by a hundred happens.
   */
  unit?: AdminChartUnit;
  /** A stable key per row. The row's position is used when this is not given. */
  getKey?: (row: TRow, index: number) => string | number;
  cap?: AdminWidgetCap;
  empty?: AdminWidgetEmptyCopy;
  isEmpty?: (data: TData) => boolean;
  sizes?: readonly AdminWidgetSize[];
};

const DEFAULT_ROWS = 5;

const rowToneClasses = adminToneClasses(
  {
    neutral: "text-zinc-900",
    info: "text-sky-700",
    success: "text-emerald-700",
    warning: "text-amber-700",
  },
  "text-red-700",
);

export function adminListWidget<TRow, TData = readonly TRow[]>(
  options: AdminListWidgetOptions<TRow, TData>,
): AdminWidgetDefinition<TData> {
  const { id, title, description } = options;
  const readRows = adminWidgetRequired(id, "a rows() that reads the list's rows", options.rows, "a list cannot show rows it has no way to read");
  const readLabel = adminWidgetRequired(id, "a label() that reads each row's label", options.label, "a row with no label has nothing to identify it by");
  const emptyCopy = options.empty;
  const readValue = options.value;
  const readNote = options.note;
  const readTone = options.tone;
  const format = options.unit === "money" ? adminFormatCents : adminFormatCount;

  return defineAdminWidget<TData>({
    id,
    title,
    description,
    sizes: options.sizes ?? ["sm", "md"],
    isEmpty: options.isEmpty ?? ((data) => adminWidgetRows(readRows, data).length === 0),
    // Skeleton rows, so the tile reserves the height the list is about to take.
    renderLoading: () => (
      <ul className="space-y-2" data-widget-skeleton="rows">
        {Array.from({ length: 3 }, (_, row) => (
          <li key={row} className="flex items-center justify-between gap-3">
            <AdminSkeleton className="h-4 flex-1" />
            <AdminSkeleton className="h-4 w-12" />
          </li>
        ))}
      </ul>
    ),
    ...(emptyCopy ? { renderEmpty: () => <AdminEmptyState title={emptyCopy.title} body={emptyCopy.body} /> } : {}),
    render: (data) => {
      const { rows, note } = adminWidgetCappedRows(
        adminWidgetRows(readRows, data),
        options.cap ?? { max: DEFAULT_ROWS },
      );
      const items: AdminListWidgetItem[] = rows.map((row, index) => {
        const value = readValue?.(row);
        return {
          key: String(adminWidgetRowKey(options.getKey, row, index)),
          label: readLabel(row),
          value: value === null || value === undefined ? null : value,
          note: readNote?.(row),
          tone: readTone?.(row),
        };
      });

      return (
        <div>
          <ul className="divide-y divide-zinc-100">
            {items.map((item) => (
              <li key={item.key} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  {/* The full text in the title, because a truncated label is unreadable and
                      unhoverable on a touch screen where there is no hover. */}
                  <span className="block truncate text-sm text-zinc-800" title={typeof item.label === "string" ? item.label : undefined}>
                    {item.label}
                  </span>
                  {item.note ? <span className="mt-0.5 block text-xs text-zinc-500">{item.note}</span> : null}
                </span>
                {item.value !== null ? (
                  <span className={cn("shrink-0 text-sm font-semibold tabular-nums", item.tone ? rowToneClasses[item.tone] : "text-zinc-900")}>
                    {typeof item.value === "number" ? format(item.value) : item.value}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {note ? <p className="mt-2 text-xs text-zinc-500">{note}</p> : null}
        </div>
      );
    },
  });
}
