// SPDX-License-Identifier: MIT

/**
 * What the shipped widgets read out of a host's data, and the checks they share.
 *
 * A definition is built once and then asked to render whatever the host's loader happened to
 * return, and a query that answers with nothing usable is an ordinary outcome rather than a bug in
 * the host's code. So the row selectors here answer with an empty list instead of throwing: a tile
 * that shows its empty state says something a reader can act on, and a tile that throws takes the
 * whole dashboard down over one query.
 *
 * Misconfiguration is the other half, and it is refused at construction instead. A widget declared
 * with no title or no value function cannot render anything a reader could use, and that is the
 * host's own mistake rather than a fact about the data, so the message names the widget and the
 * option and the definition is never built.
 */

import type { AdminShippedWidgetLabels } from "./labels.js";

export type AdminWidgetEmptyCopy = { title: string; body: string };

export type AdminWidgetCap = {
  /** The most rows a tile will draw. Anything past it is counted in the note rather than dropped. */
  max: number;
  /** The line that says how many of the total are on screen. */
  note?: (shown: number, total: number) => string;
};

/** How the loaded rows are read, after any cap, and what to say about the rows left out. */
export type AdminWidgetCappedRows<TRow> = {
  rows: TRow[];
  total: number;
  note: string | null;
};

export function adminWidgetCapNote(shown: number, total: number): string {
  return `Showing ${shown} of ${total}`;
}

/**
 * The rows a selector found, or none at all.
 *
 * The copy is deliberate rather than a bare `as`: a selector the host wrote against a shape the
 * query no longer returns is a real case, and the list is what keeps a missing field from becoming
 * a missing method call.
 */
export function adminWidgetRows<TData, TRow>(
  select: (data: TData) => readonly TRow[] | null | undefined,
  data: TData,
): TRow[] {
  const rows = select(data);
  return Array.isArray(rows) ? rows.slice() : [];
}

export function adminWidgetCappedRows<TRow>(
  rows: readonly TRow[],
  cap?: AdminWidgetCap,
  labels?: AdminShippedWidgetLabels,
): AdminWidgetCappedRows<TRow> {
  const total = rows.length;
  if (!cap || cap.max >= total) {
    return { rows: rows.slice(), total, note: null };
  }
  const shown = rows.slice(0, Math.max(0, cap.max));
  // The type-only import above the value one: this module is what the label defaults are built from,
  // so importing them here as values would close a loop between the two.
  return {
    rows: shown,
    total,
    note: (cap.note ?? labels?.capNote ?? adminWidgetCapNote)(shown.length, total),
  };
}

/** Refuses a value the tile cannot be built from, naming the widget and the option. */
export function adminWidgetRequired<T>(
  id: string,
  option: string,
  value: T | null | undefined,
  requirement: string,
): T {
  const missing = value === null || value === undefined || value === "";
  if (missing) {
    throw new Error(`Widget "${id}" needs ${option}: ${requirement}`);
  }
  return value;
}

/** Refuses a list the tile cannot be built from, such as a table with no columns to draw. */
export function adminWidgetRequiredList<T>(
  id: string,
  option: string,
  value: readonly T[] | null | undefined,
  requirement: string,
): readonly T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Widget "${id}" needs ${option}: ${requirement}`);
  }
  return value;
}

/** A key for a row that the host did not key, which a read-only tile can fall back from. */
export function adminWidgetRowKey<TRow>(
  getKey: ((row: TRow, index: number) => string | number) | undefined,
  row: TRow,
  index: number,
): string | number {
  const key = getKey?.(row, index);
  return key === undefined || key === null ? index : key;
}
