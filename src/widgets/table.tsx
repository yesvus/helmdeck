// SPDX-License-Identifier: MIT

/**
 * A table tile: a handful of rows and the columns that matter, capped so the tile keeps its height.
 *
 * Two decisions are made here rather than pushed onto the host, because both are the same in every
 * dashboard and both are wrong in a different way when left open.
 *
 * Alignment follows the data. A column whose values are all numbers is right-aligned and formatted,
 * because a column of money read left to right is a column of money a reader has to count the
 * digits of. Declaring `value` is therefore enough: the widget works out whether it is a number
 * column and formats it, so the host writes the accessor once rather than a cell renderer per
 * column.
 *
 * Rows are capped, and the tile says what the cap left out. An uncapped table inside a tile either
 * grows without bound and takes the grid with it, or is truncated by a host that then shows a
 * partial list as though it were the whole one. The note is what makes the partial list honest.
 *
 * Its own markup rather than `AdminTable`, and deliberately so. That table is a client component
 * whose cells are functions, so rendering it from a server-rendered dashboard means passing a
 * function across the client boundary, which React refuses. A tile's table is read-only, holds no
 * selection and no row actions, and a widget definition is a server-safe object, so the table is
 * built from elements and the whole tile stays renderable on the server.
 */

import type { ReactNode } from "react";
import type { AdminChartUnit } from "../charts/table.js";
import { adminFormatCents, adminFormatCount } from "../charts/money.js";
import { cn } from "../cn.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminSkeleton } from "../primitives/skeleton.js";
import { defaultAdminShippedWidgetLabels, type AdminShippedWidgetLabels } from "./labels.js";
import { defineAdminWidget } from "./registry.js";
import {
  adminWidgetCappedRows,
  adminWidgetRequired,
  adminWidgetRequiredList,
  adminWidgetRowKey,
  adminWidgetRows,
  type AdminWidgetCap,
  type AdminWidgetEmptyCopy,
} from "./values.js";
import type { AdminWidgetDefinition, AdminWidgetSize } from "./types.js";

export type AdminTableWidgetColumn<TRow> = {
  key: string;
  header: ReactNode;
  /**
   * Reads the cell's own value. It is what decides the alignment and, when `cell` is omitted, what
   * is printed, so a column of numbers needs this and nothing else.
   */
  value?: (row: TRow) => unknown;
  /** Prints the cell. Omit it and the column prints its `value`, formatted when it is a number. */
  cell?: (row: TRow) => ReactNode;
  align?: "left" | "right";
  width?: string;
  className?: string;
  headerClassName?: string;
};

export type AdminTableWidgetOptions<TRow, TData = readonly TRow[]> = {
  id: string;
  title: string;
  description?: string;
  /** Reads the rows. Answering with nothing is how the data declares the tile empty. */
  rows: (data: TData) => readonly TRow[] | null | undefined;
  columns: readonly AdminTableWidgetColumn<TRow>[];
  /** A stable key per row. The row's position is used when this is not given. */
  getKey?: (row: TRow, index: number) => string | number;
  /**
   * What a numeric column's value is measured in. `money` reads it as whole cents, which is where
   * the division by a hundred happens.
   */
  unit?: AdminChartUnit;
  cap?: AdminWidgetCap;
  /** The sentence under a capped table, for a host whose interface language is not English. */
  labels?: Partial<AdminShippedWidgetLabels>;
  empty?: AdminWidgetEmptyCopy;
  isEmpty?: (data: TData) => boolean;
  sizes?: readonly AdminWidgetSize[];
};

const DEFAULT_ROWS = 8;

function numberFormatter(unit: AdminChartUnit): (value: number) => string {
  return unit === "money" ? adminFormatCents : adminFormatCount;
}

/**
 * A number column is one whose every value is a number, a null or a missing value.
 *
 * A column holding a name and a price is a text column, because a reader looking for the name
 * should not have to scan past a right-aligned number to find it. `Number.isFinite` rather than
 * `typeof` so a numeric string stays a string, which is a decision the host can override with
 * `align` either way.
 */
function isNumberColumn<TRow>(
  column: AdminTableWidgetColumn<TRow>,
  rows: readonly TRow[],
): boolean {
  if (!column.value) return false;
  let seen = false;
  for (const row of rows) {
    const value = column.value(row);
    if (value === null || value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    seen = true;
  }
  return seen;
}

/** An empty cell, so a missing value is distinguishable from a zero without printing either. */
function cellText(value: unknown, format: (value: number) => string): ReactNode {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? format(value) : null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return String(value);
}

export function adminTableWidget<TRow, TData = readonly TRow[]>(
  options: AdminTableWidgetOptions<TRow, TData>,
): AdminWidgetDefinition<TData> {
  const { id, title, description } = options;
  const readRows = adminWidgetRequired(id, "a rows() that reads the table's rows", options.rows, "a table cannot show rows it has no way to read");
  const columns = adminWidgetRequiredList(id, "at least one column", options.columns, "a table with no columns has nothing to draw");
  const emptyCopy = options.empty;
  const format = numberFormatter(options.unit ?? "count");
  const labels = { ...defaultAdminShippedWidgetLabels, ...options.labels };

  return defineAdminWidget<TData>({
    id,
    title,
    description,
    sizes: options.sizes ?? ["lg", "xl"],
    isEmpty: options.isEmpty ?? ((data) => adminWidgetRows(readRows, data).length === 0),
    // Skeleton rows rather than one bar, so the tile reserves the height the table is about to take
    // and the grid does not jump when the data lands.
    renderLoading: () => (
      <div className="space-y-2" data-widget-skeleton="rows">
        {Array.from({ length: Math.min(3, columns.length + 1) }, (_, row) => (
          <div key={row} className="flex gap-3">
            {columns.slice(0, 3).map((column) => (
              <AdminSkeleton key={column.key} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    ),
    ...(emptyCopy ? { renderEmpty: () => <AdminEmptyState title={emptyCopy.title} body={emptyCopy.body} /> } : {}),
    render: (data) => {
      const { rows, note } = adminWidgetCappedRows(
        adminWidgetRows(readRows, data),
        options.cap ?? { max: DEFAULT_ROWS },
        labels,
      );
      const alignments = columns.map((column) => column.align ?? (isNumberColumn(column, rows) ? "right" : "left"));

      return (
        <div className="overflow-hidden rounded-admin-control border border-admin-border">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="border-b border-admin-border bg-admin-surface-subtle">
                  {columns.map((column, index) => (
                    <th
                      key={column.key}
                      scope="col"
                      style={{ width: column.width }}
                      className={cn(
                        "px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500",
                        alignments[index] === "right" ? "text-right" : "text-left",
                        column.headerClassName,
                      )}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={adminWidgetRowKey(options.getKey, row, index)} className="border-b border-zinc-100 last:border-0">
                    {columns.map((column, at) => (
                      <td
                        key={column.key}
                        className={cn(
                          "px-3 py-2 align-middle text-zinc-700",
                          alignments[at] === "right" && "text-right tabular-nums",
                          column.className,
                        )}
                      >
                        {column.cell ? column.cell(row) : cellText(column.value?.(row), format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {note ? <p className="border-t border-admin-border px-3 py-1.5 text-xs text-zinc-500">{note}</p> : null}
        </div>
      );
    },
  });
}
