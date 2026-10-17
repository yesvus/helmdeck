// SPDX-License-Identifier: MIT
/**
 * An activity trail over a host's audit events, with the filters a log is read by.
 *
 * The dashboard tile answers what just happened. A log answers what happened, who did it, and when,
 * and that is the question a host otherwise rebuilds by hand: the date range, the actor search, and
 * the detail view that shows what a write touched.
 *
 * Events arrive one of two ways. A host that has already resolved them passes `events` and the filters
 * narrow them here. A host whose trail sits behind a server action passes `load`, and the filter is
 * handed to it, because narrowing a page in the browser after fetching all of it is not a filter.
 * Which one is in use decides nothing else: the controls, the detail view and the wording are the
 * same either way.
 *
 * What an event carries is the host's decision. The package's own event carries the names of the
 * fields a write touched and none of their values, so the detail view prints metadata as it arrives
 * and a host that stores values shows them.
 */

"use client";

import { useEffect, useId, useState } from "react";
import type { AdminAuditEvent, AdminPermission } from "../adapters/index.js";
import { useAdminMessages } from "../i18n.js";
import { englishAdminMessages, turkishAdminMessages, type AdminMessages } from "../i18n/messages.js";
import { Button } from "../primitives/button.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminField } from "../primitives/field.js";
import { AdminInput } from "../primitives/input.js";
import { AdminSurfaceCard } from "../primitives/layout.js";
import { AdminSelect } from "../primitives/select.js";
import { AdminStatusPill, type AdminStatusTone } from "../primitives/status-pill.js";
import { AdminCan } from "../shell/permissions.js";
import { adminActivityAge } from "../widgets/activity.js";
import type { AdminShippedWidgetLabels } from "../widgets/labels.js";
import type { AdminActivityMessages } from "./messages.js";

/** What a reader has narrowed the trail to. Every part is optional, and an empty filter is everything. */
export type AdminActivityFilter = {
  action?: string;
  actor?: string;
  /** A calendar day, `yyyy-mm-dd`, inclusive. */
  from?: string;
  /** A calendar day, `yyyy-mm-dd`, inclusive. */
  to?: string;
};

export type AdminActivityTimelineProps = {
  /** The trail, when the host has already resolved it. */
  events?: readonly AdminAuditEvent[];
  /** Reads the trail for a filter, when the host resolves it per request. */
  load?: (filter: AdminActivityFilter) => Promise<readonly AdminAuditEvent[]>;
  /**
   * The action names the filter offers, for a host whose trail is loaded rather than passed. Without
   * them the control is not rendered, because a filter that can only ever hold one value is a control
   * that says nothing.
   */
  actions?: readonly string[];
  /** The rule that decides whether this trail is offered at all. It gates rendering only. */
  permission?: AdminPermission;
  /** The clock the ages are read against, so a test is not reading the machine's. */
  now?: () => Date;
  labels?: Partial<AdminActivityMessages>;
  empty?: { title: string; body: string };
  /** How many events one page of the trail shows. */
  cap?: number;
};

const DEFAULT_CAP = 25;

const TONES: Record<string, AdminStatusTone> = {
  create: "success",
  update: "info",
  restore: "warning",
  delete: "danger",
  trash: "danger",
};

/** The tone an action reads as, so a trail is scanned rather than read. An unfamiliar action is neutral. */
export function adminActivityTone(action: string): AdminStatusTone {
  return TONES[action.toLowerCase()] ?? "neutral";
}

function activityCopy(messages: AdminMessages): AdminActivityMessages {
  return (
    messages.activity ??
    (messages.locale === "tr" ? turkishAdminMessages.activity! : englishAdminMessages.activity!)
  );
}

/** The moment an event happened, or null for a time that is not one. */
function eventTime(event: AdminAuditEvent): number | null {
  if (event.occurredAt === undefined) return null;
  const time = new Date(event.occurredAt).getTime();
  return Number.isFinite(time) ? time : null;
}

function actorText(event: AdminAuditEvent): string {
  const actor = event.actor;
  if (!actor) return "";
  return [actor.name, actor.email, actor.role]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");
}

/**
 * A `yyyy-mm-dd` day as its first and last millisecond.
 *
 * Read as UTC on purpose: the value a date input sends carries no zone, so reading it in the
 * browser's offset would put the same filter an hour either side of its meaning depending on who
 * asked. A day named in a filter then means the same day everywhere, including in a test.
 */
function dayBounds(value: string): { start: number; end: number } | null {
  const start = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(start)) return null;
  return { start, end: start + 24 * 60 * 60 * 1000 - 1 };
}

function matches(event: AdminAuditEvent, filter: AdminActivityFilter): boolean {
  if (filter.action !== undefined && filter.action !== "" && event.action !== filter.action) return false;
  if (filter.actor !== undefined && filter.actor !== "") {
    if (!actorText(event).toLowerCase().includes(filter.actor.toLowerCase())) return false;
  }
  const time = eventTime(event);
  if (filter.from) {
    const from = dayBounds(filter.from);
    if (from === null || time === null || time < from.start) return false;
  }
  if (filter.to) {
    const to = dayBounds(filter.to);
    if (to === null || time === null || time > to.end) return false;
  }
  return true;
}

function keyOf(filter: AdminActivityFilter): string {
  return [filter.action ?? "", filter.actor ?? "", filter.from ?? "", filter.to ?? ""].join("\u0000");
}

/**
 * A value as the words a reader reads, rather than as `[object Object]`.
 *
 * Serialization is guarded because it can refuse: a circular metadata object or a value `JSON`
 * cannot print throws, and a trail is the one surface where one host's odd value should cost its own
 * row rather than take down every event beside it.
 */
function metadataValue(value: unknown, empty: string): string {
  if (value === undefined) return empty;
  if (value === null) return "null";
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? "Invalid Date" : value.toISOString();
  if (typeof value === "string") return value.length === 0 ? empty : value;
  if (typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value) ?? empty;
  } catch {
    return String(value);
  }
}

/** The metadata split so the names of the fields a write touched read as themselves. */
function metadataEntries(metadata: Record<string, unknown> | undefined): {
  fields: unknown[];
  rest: Array<[string, unknown]>;
} {
  const entries = Object.entries(metadata ?? {});
  const fields = entries.find(([key]) => key === "fields")?.[1];
  return {
    fields: Array.isArray(fields) ? fields : [],
    rest: entries.filter(([key]) => key !== "fields"),
  };
}

function filterOf(draft: AdminActivityFilter): AdminActivityFilter {
  return {
    ...(draft.action ? { action: draft.action } : {}),
    ...(draft.actor ? { actor: draft.actor } : {}),
    ...(draft.from ? { from: draft.from } : {}),
    ...(draft.to ? { to: draft.to } : {}),
  };
}

export function AdminActivityTimeline({
  events,
  load,
  actions,
  permission,
  now = () => new Date(),
  labels,
  empty,
  cap = DEFAULT_CAP,
}: AdminActivityTimelineProps) {
  const messages = useAdminMessages();
  const copy = { ...activityCopy(messages), ...labels };
  const trail = (
    <AdminActivityTrail
      events={events}
      load={load}
      actions={actions}
      now={now}
      copy={copy}
      empty={empty}
      cap={cap}
      ageLabels={messages.shippedWidget}
    />
  );
  if (permission === undefined) return trail;
  return (
    <AdminCan
      permission={permission}
      fallback={
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {messages.shell.permissionDenied}
        </p>
      }
    >
      {trail}
    </AdminCan>
  );
}

function AdminActivityTrail({
  events,
  load,
  actions,
  now,
  copy,
  empty,
  cap,
  ageLabels,
}: {
  events?: readonly AdminAuditEvent[];
  load?: (filter: AdminActivityFilter) => Promise<readonly AdminAuditEvent[]>;
  actions?: readonly string[];
  now: () => Date;
  copy: AdminActivityMessages;
  empty?: { title: string; body: string };
  cap: number;
  ageLabels: AdminShippedWidgetLabels;
}) {
  const [draft, setDraft] = useState<AdminActivityFilter>({});
  const [filter, setFilter] = useState<AdminActivityFilter>({});
  const [revealed, setRevealed] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; rows: AdminAuditEvent[]; failed: boolean } | null>(null);
  // Per instance, because two trails on one page would otherwise share every control's id and the
  // second set of labels would name the first set of inputs.
  const controlId = useId();

  const { action = "", actor = "", from = "", to = "" } = filter;

  useEffect(() => {
    const read = load;
    if (!read) return;
    let active = true;
    const next: AdminActivityFilter = {
      ...(action ? { action } : {}),
      ...(actor ? { actor } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    };
    void read(next).then(
      (rows) => {
        if (active) setLoaded({ key: keyOf(next), rows: [...rows], failed: false });
      },
      () => {
        if (active) setLoaded({ key: keyOf(next), rows: [], failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [action, actor, from, load, to]);

  const answer = load ? (loaded?.key === keyOf(filter) ? loaded : null) : null;
  const source = load ? (answer?.rows ?? []) : events ?? [];
  // Newest first, and an event with no usable time cannot be placed, so it keeps the position it
  // arrived in rather than being pushed to one end on a guess.
  const rows = source
    .map((event, index) => ({ event, index, time: eventTime(event) }))
    .filter((row) => (load ? true : matches(row.event, filter)))
    .sort((left, right) => {
      if (left.time === right.time) return left.index - right.index;
      if (left.time === null) return 1;
      if (right.time === null) return -1;
      return right.time - left.time;
    });

  const offered = [...new Set([...(actions ?? []), ...(load ? [] : source.map((event) => event.action))])].sort();
  // How far past the first page the reader has asked to go, rather than a page they cannot leave: a cap
  // that hides the rest of a trail with no way to reach it is the trail deciding what a reader may not
  // see, which is the one thing a read-only list has no business doing.
  const visible = rows.slice(0, cap + revealed);
  const nowAt = now();
  const filtering = Object.keys(filter).length > 0;

  return (
    <div className="space-y-4">
      <AdminSurfaceCard>
        <form
          className="space-y-4 p-5"
          onSubmit={(submitted) => {
            submitted.preventDefault();
            setFilter(filterOf(draft));
            setRevealed(0);
          }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">{copy.filters}</h2>
            {rows.length > 0 ? (
              <p className="text-xs text-zinc-500">{copy.showing(visible.length, rows.length)}</p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {offered.length > 0 ? (
              <AdminField label={copy.action} id={`${controlId}-action`}>
                <AdminSelect
                  id={`${controlId}-action`}
                  value={draft.action ?? ""}
                  onChange={(changed) => setDraft((current) => ({ ...current, action: changed.target.value }))}
                >
                  <option value="">{copy.allActions}</option>
                  {offered.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
            ) : null}
            <AdminField label={copy.actor} id={`${controlId}-actor`}>
              <AdminInput
                id={`${controlId}-actor`}
                type="text"
                placeholder={copy.actorPlaceholder}
                value={draft.actor ?? ""}
                onChange={(changed) => setDraft((current) => ({ ...current, actor: changed.target.value }))}
              />
            </AdminField>
            <AdminField label={copy.from} id={`${controlId}-from`}>
              <AdminInput
                id={`${controlId}-from`}
                type="date"
                value={draft.from ?? ""}
                onChange={(changed) => setDraft((current) => ({ ...current, from: changed.target.value }))}
              />
            </AdminField>
            <AdminField label={copy.to} id={`${controlId}-to`}>
              <AdminInput
                id={`${controlId}-to`}
                type="date"
                value={draft.to ?? ""}
                onChange={(changed) => setDraft((current) => ({ ...current, to: changed.target.value }))}
              />
            </AdminField>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm">
              {copy.apply}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!filtering}
              onClick={() => {
                setDraft({});
                setFilter({});
                setRevealed(0);
              }}
            >
              {copy.clear}
            </Button>
          </div>
        </form>
      </AdminSurfaceCard>

      <AdminSurfaceCard>
        {load && answer === null ? (
          <p role="status" className="p-5 text-sm text-zinc-500">
            {copy.loading}
          </p>
        ) : load && answer?.failed ? (
          <p role="alert" className="p-5 text-sm text-zinc-500">
            {copy.loadFailed}
          </p>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <AdminEmptyState
              title={filtering ? copy.noMatches : (empty?.title ?? copy.empty)}
              body={filtering ? copy.noMatchesBody : (empty?.body ?? copy.emptyBody)}
            />
          </div>
        ) : (
          <ol className="divide-y divide-zinc-200">
            {visible.map(({ event, index }) => {
              const rowKey = [event.action, event.resource, event.resourceId ?? "", event.occurredAt ?? "", index].join(":");
              const open = expanded === rowKey;
              const time = eventTime(event);
              const who = actorText(event);
              const { fields, rest } = metadataEntries(event.metadata);
              return (
                <li key={rowKey} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <AdminStatusPill tone={adminActivityTone(event.action)} label={event.action} />
                      <p className="truncate text-sm text-zinc-900">{event.resource}</p>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {who.length > 0 ? who : copy.unknownActor}
                      {" · "}
                      <time dateTime={event.occurredAt}>
                        {time === null ? ageLabels.unknownTime : adminActivityAge(nowAt.getTime() - time, nowAt, ageLabels)}
                      </time>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={open}
                    aria-controls={`${rowKey}-details`}
                    onClick={() => setExpanded(open ? null : rowKey)}
                  >
                    {open ? copy.hideDetails : copy.details}
                  </Button>
                  {open ? (
                    <div id={`${rowKey}-details`} className="space-y-3 rounded-admin-card border border-zinc-200 p-4">
                      <dl className="grid gap-1 text-sm sm:grid-cols-[minmax(6rem,0.25fr)_minmax(0,1fr)] sm:gap-3">
                        <dt className="font-medium text-zinc-900">{copy.resource}</dt>
                        <dd className="min-w-0 break-words text-zinc-600">{event.resource}</dd>
                        {event.resourceId ? (
                          <>
                            <dt className="font-medium text-zinc-900">{copy.record}</dt>
                            <dd className="min-w-0 break-words text-zinc-600">{event.resourceId}</dd>
                          </>
                        ) : null}
                        {fields.length > 0 ? (
                          <>
                            <dt className="font-medium text-zinc-900">{copy.fields}</dt>
                            <dd className="min-w-0 break-words text-zinc-600">{fields.map(String).join(", ")}</dd>
                          </>
                        ) : null}
                        {rest.map(([name, value]) => (
                          <div key={name} className="contents">
                            <dt className="font-medium text-zinc-900">{name}</dt>
                            <dd className="min-w-0 break-words text-zinc-600">{metadataValue(value, copy.emptyValue)}</dd>
                          </div>
                        ))}
                      </dl>
                      {fields.length === 0 && rest.length === 0 ? (
                        <p className="text-sm text-zinc-500">{copy.detailsEmpty}</p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {rows.length > visible.length ? (
          <div className="border-t border-zinc-200 px-5 py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setRevealed((more) => more + cap)}>
              {copy.showMore(rows.length - visible.length)}
            </Button>
          </div>
        ) : null}
      </AdminSurfaceCard>
    </div>
  );
}