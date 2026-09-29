// SPDX-License-Identifier: MIT

/**
 * An activity tile: what happened, how long ago, and in what tone.
 *
 * This is the tile a host writes first and rewrites most often, because the hard part of it is not
 * the list, it is the timestamps. An age is a sentence with thresholds, and the thresholds are the
 * judgement: under a minute is "just now" rather than "0 minutes ago", under an hour counts
 * minutes, and past a week a count is noise, so the date is printed instead. A host that writes this
 * gets a tile that says "0 minutes ago" or "43 days ago" and has no obvious way to tell whether
 * that is a bug or a threshold. Here the thresholds are stated once, and a host can replace any of
 * them.
 *
 * The second judgement is the tone, and it is what makes an activity feed scannable. An event's
 * kind maps to a tone through one function, so a failure is red and a publish is green without
 * every row carrying a colour, and a host with no opinion gets the neutral default rather than a
 * decision it never made.
 *
 * Ages are read at the moment the tile renders, from a clock the host can hand in. That is what
 * keeps the sentence honest after the data has been sitting: a feed whose ages were computed when
 * the query ran says "just now" about something an hour old, and the reader is the one who finds out.
 *
 * Server-safe, and built from elements so a dashboard of these stays renderable on the server.
 */

import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminSkeleton } from "../primitives/skeleton.js";
import { adminToneClasses, type AdminTone } from "../primitives/tone.js";
import { defaultAdminShippedWidgetLabels, type AdminShippedWidgetLabels } from "./labels.js";
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

export type AdminActivityWidgetOptions<TRow, TData = readonly TRow[]> = {
  id: string;
  title: string;
  description?: string;
  /** Reads the events. Answering with nothing is how the data declares the tile empty. */
  rows: (data: TData) => readonly TRow[] | null | undefined;
  /** What happened, in a phrase a person reads: "published Home". */
  message: (row: TRow) => ReactNode;
  /** Who did it, printed in the quieter line under the message. */
  actor?: (row: TRow) => ReactNode;
  /** When it happened. Anything a `Date` accepts; a number is read as epoch milliseconds. */
  at: (row: TRow) => Date | string | number;
  /** The event's kind, mapped to a tone so a feed can be scanned rather than read. */
  tone?: (row: TRow) => AdminTone;
  /** A stable key per row. The row's position is used when this is not given. */
  getKey?: (row: TRow, index: number) => string | number;
  /** The clock the ages are read against. Handed in rather than read here, so a tile is testable. */
  now?: () => Date;
  /**
   * Replaces the age vocabulary outright, for a host that wants one function for the whole feed
   * rather than the thresholds one at a time. `labels` is the narrower way in.
   */
  formatAge?: (elapsedMs: number, now: Date) => string;
  labels?: Partial<AdminShippedWidgetLabels>;
  cap?: AdminWidgetCap;
  empty?: AdminWidgetEmptyCopy;
  isEmpty?: (data: TData) => boolean;
  sizes?: readonly AdminWidgetSize[];
};

const DEFAULT_ROWS = 8;

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const week = 7 * day;

const toneMarkerClasses = adminToneClasses(
  {
    neutral: "bg-zinc-300",
    info: "bg-sky-500",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
  },
  "bg-red-500",
);

/**
 * How old an event is, in words.
 *
 * The thresholds are the judgement, and they are deliberately not evenly spaced. A minute is too
 * coarse to say anything about an event that just happened, an hour is too coarse to say anything
 * about one that happened at lunchtime, and a day is too coarse to order yesterday's events. Past a
 * week the count stops being useful, so the day itself is printed and the reader places it.
 *
 * That last date is taken from `now` rather than from the current clock, so a caller reading an
 * injected clock gets the same day as the rest of its own ages.
 */
export function adminActivityAge(
  elapsedMs: number,
  now: Date = new Date(),
  labels: AdminShippedWidgetLabels = defaultAdminShippedWidgetLabels,
): string {
  const elapsed = Math.max(0, elapsedMs);
  if (elapsed < minute) return labels.justNow;
  if (elapsed < hour) return labels.minutesAgo(Math.floor(elapsed / minute));
  if (elapsed < day) return labels.hoursAgo(Math.floor(elapsed / hour));
  if (elapsed < week) return labels.daysAgo(Math.floor(elapsed / day));
  return labels.ageDate(new Date(now.getTime() - elapsed));
}

/** The event's time as epoch milliseconds, or null for a date the value is not. */
function adminActivityTime(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

export function adminActivityWidget<TRow, TData = readonly TRow[]>(
  options: AdminActivityWidgetOptions<TRow, TData>,
): AdminWidgetDefinition<TData> {
  const { id, title, description } = options;
  const readRows = adminWidgetRequired(
    id,
    "a rows() that reads the events",
    options.rows,
    "a feed cannot show events it has no way to read",
  );
  const readMessage = adminWidgetRequired(
    id,
    "a message() that reads what happened",
    options.message,
    "a feed of rows with nothing said about them is not a feed",
  );
  const readAt = adminWidgetRequired(
    id,
    "an at() that reads when each event happened",
    options.at,
    "an age is measured against a time, so an event with none cannot be dated",
  );
  const emptyCopy = options.empty;
  const readActor = options.actor;
  const readTone = options.tone;
  const clock = options.now ?? (() => new Date());
  const labels = { ...defaultAdminShippedWidgetLabels, ...options.labels };
  const formatAge = options.formatAge ?? ((elapsed: number, now: Date) => adminActivityAge(elapsed, now, labels));

  return defineAdminWidget<TData>({
    id,
    title,
    description,
    sizes: options.sizes ?? ["sm", "md", "lg"],
    isEmpty: options.isEmpty ?? ((data) => adminWidgetRows(readRows, data).length === 0),
    // One line per event, so the feed's height is known before the events are.
    renderLoading: () => (
      <ul className="space-y-3" data-widget-skeleton="rows">
        {Array.from({ length: 4 }, (_, row) => (
          <li key={row} className="flex gap-2.5">
            <AdminSkeleton className="mt-1.5 h-2 w-2 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <AdminSkeleton className="h-3.5 w-3/4" />
              <AdminSkeleton className="h-3 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    ),
    ...(emptyCopy
      ? { renderEmpty: () => <AdminEmptyState title={emptyCopy.title} body={emptyCopy.body} /> }
      : {}),
    render: (data) => {
      const { rows, note } = adminWidgetCappedRows(
        adminWidgetRows(readRows, data),
        options.cap ?? { max: DEFAULT_ROWS },
      );
      // Read once per render. A clock called per row would put two events either side of a
      // millisecond boundary into different sentences, which is exactly the sort of thing a reader
      // notices when the feed is not quite sorted.
      const nowAt = clock();
      const now = nowAt.getTime();

      return (
        <div>
          <ol className="space-y-3">
            {rows.map((row, index) => {
              const time = adminActivityTime(readAt(row));
              const tone = readTone?.(row) ?? "neutral";
              return (
                <li key={adminWidgetRowKey(options.getKey, row, index)} className="flex gap-2.5">
                  {/* The tone as a dot rather than as text colour, because the message is the thing
                      being read and colouring it fights whatever colour the message already has. */}
                  <span
                    data-activity-tone={tone}
                    aria-hidden="true"
                    className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", toneMarkerClasses[tone])}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-800">{readMessage(row)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
                      {readActor ? (
                        <>
                          <span className="truncate">{readActor(row)}</span>
                          <span aria-hidden="true">&middot;</span>
                        </>
                      ) : null}
                      {/* Both the age and the exact time, because the age is what a reader scans and
                          the timestamp is what they need once the age has gone stale. */}
                      <time dateTime={time === null ? undefined : new Date(time).toISOString()}>
                        {time === null ? labels.unknownTime : formatAge(now - time, nowAt)}
                      </time>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {note ? <p className="mt-3 text-xs text-zinc-500">{note}</p> : null}
        </div>
      );
    },
  });
}
