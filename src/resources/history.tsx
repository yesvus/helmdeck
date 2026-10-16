// SPDX-License-Identifier: MIT
/** Reads and renders revision history for a generated resource form. */
"use client";

import { useEffect, useState } from "react";
import { AdminCan, useAdminPermission } from "../shell/permissions.js";
import { useAdminMessages } from "../i18n.js";
import { englishAdminMessages, turkishAdminMessages } from "../i18n/messages.js";
import type { AdminRevisionRestore } from "../lifecycle/lifecycle.js";
import type { AdminRevision } from "../lifecycle/revisions.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminSurfaceCard } from "../primitives/layout.js";
import { Button } from "../primitives/button.js";
import type { AdminResourceDefinition, AdminResourceRecord } from "./registry.js";

export type AdminResourceHistoryActions = {
  revisions?: (resource: string, id: string) => Promise<AdminRevision[]>;
  recordRevision?: (resource: string, id: string) => Promise<AdminRevision>;
  restoreRevision?: (resource: string, id: string, revision: string) => Promise<AdminRevisionRestore>;
};

function valueKey(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${value.map(valueKey).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${valueKey((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function valueLabel(value: unknown, empty: string): string {
  if (value === undefined) return empty;
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object") return String(value);
  return JSON.stringify(value) ?? String(value);
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((field) =>
      Object.hasOwn(before, field) !== Object.hasOwn(after, field) || valueKey(before[field]) !== valueKey(after[field]),
    )
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

function occurredLabel(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString(locale);
}

export function AdminResourceHistoryPanel({
  definition,
  id,
  record,
  version,
  actions,
  busy,
  onBusyChange,
  onRestored,
  onError,
}: {
  definition: AdminResourceDefinition;
  id: string;
  record: AdminResourceRecord;
  version: number;
  actions: AdminResourceHistoryActions;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onRestored: (record: AdminResourceRecord) => void;
  onError?: (cause: unknown) => void;
}) {
  const readPermission = definition.permissions?.readRevisions ?? `${definition.resource}.readRevisions`;
  return (
    <AdminCan permission={readPermission} resourceId={id} fallback={null}>
      <AdminResourceHistoryContent
        definition={definition}
        id={id}
        record={record}
        version={version}
        actions={actions}
        busy={busy}
        onBusyChange={onBusyChange}
        onRestored={onRestored}
        onError={onError}
      />
    </AdminCan>
  );
}

function AdminResourceHistoryContent({
  definition,
  id,
  record,
  version,
  actions,
  busy,
  onBusyChange,
  onRestored,
  onError,
}: {
  definition: AdminResourceDefinition;
  id: string;
  record: AdminResourceRecord;
  version: number;
  actions: AdminResourceHistoryActions;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onRestored: (record: AdminResourceRecord) => void;
  onError?: (cause: unknown) => void;
}) {
  const messages = useAdminMessages();
  const copy = messages.resourceHistory ??
    (messages.locale === "tr" ? turkishAdminMessages.resourceHistory! : englishAdminMessages.resourceHistory!);
  const restorePermission = definition.permissions?.restoreRevision ?? `${definition.resource}.restoreRevision`;
  const restoreAllowed = useAdminPermission(restorePermission, { resourceId: id }) === "allowed";
  const [result, setResult] = useState<{
    resource: string;
    id: string;
    version: number;
    rows: AdminRevision[];
    failed: boolean;
  } | null>(null);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState(false);

  useEffect(() => {
    const readRevisions = actions.revisions;
    if (!readRevisions) return;
    let active = true;
    void readRevisions(definition.resource, id).then(
      (rows) => {
        if (active) setResult({ resource: definition.resource, id, version, rows, failed: false });
      },
      (cause: unknown) => {
        if (!active) return;
        setResult({ resource: definition.resource, id, version, rows: [], failed: true });
        onError?.(cause);
      },
    );
    return () => {
      active = false;
    };
  }, [actions.revisions, definition.resource, id, onError, version]);

  async function restore(revision: string) {
    if (!actions.restoreRevision) return;
    setPending(revision);
    onBusyChange(true);
    setError(false);
    try {
      const answer = await actions.restoreRevision(definition.resource, id, revision);
      onRestored(answer.record);
    } catch (cause) {
      setError(true);
      onError?.(cause);
    } finally {
      setPending(undefined);
      onBusyChange(false);
    }
  }

  const currentResult =
    result?.resource === definition.resource && result.id === id && result.version === version ? result : null;

  return (
    <AdminSurfaceCard>
      <section aria-labelledby={`${definition.resource}-${id}-history-heading`}>
        <div className="border-b border-admin-border bg-admin-surface-subtle px-5 py-3">
          <h2 id={`${definition.resource}-${id}-history-heading`} className="text-sm font-semibold text-admin-foreground">
            {copy.title}
          </h2>
          <p className="mt-1 text-sm text-admin-muted">{copy.description}</p>
        </div>
        {!actions.revisions ? (
          <p role="status" className="p-5 text-sm text-admin-muted">{copy.unavailable}</p>
        ) : currentResult === null ? (
          <p role="status" className="p-5 text-sm text-admin-muted">{messages.shell.resourceLoading}</p>
        ) : currentResult.failed ? (
          <p role="alert" className="p-5 text-sm text-admin-muted">{copy.loadFailed}</p>
        ) : currentResult.rows.length === 0 ? (
          <div className="p-5">
            <AdminEmptyState title={copy.empty} body={copy.emptyBody} />
          </div>
        ) : (
          <ol className="divide-y divide-admin-border">
            {currentResult.rows.map((revision, index) => {
              const next = index === 0 ? record : currentResult.rows[index - 1].snapshot;
              const changes = changedFields(revision.snapshot, next);
              const actor = revision.actor;
              return (
                <li key={revision.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold text-admin-foreground">{revision.cause}</p>
                    <p className="text-xs text-admin-muted">
                      {revision.occurredAt ? (
                        <time dateTime={revision.occurredAt}>{occurredLabel(revision.occurredAt, messages.locale)}</time>
                      ) : null}
                      {actor ? ` · ${actor.name ?? actor.email}${actor.role ? ` (${actor.role})` : ""}` : ` · ${copy.unknownActor}`}
                    </p>
                  </div>
                  {changes.length === 0 ? (
                    <p className="text-sm text-admin-muted">{copy.noChanges}</p>
                  ) : (
                    <dl className="space-y-2">
                      {changes.map((change) => (
                        <div key={change.field} className="grid gap-1 text-sm sm:grid-cols-[minmax(8rem,0.35fr)_minmax(0,1fr)] sm:gap-3">
                          <dt className="font-medium text-admin-foreground">{change.field}</dt>
                          <dd className="min-w-0 break-words text-admin-muted">
                            <span>{copy.from} {valueLabel(change.before, copy.emptyValue)}</span>
                            <span aria-hidden="true"> → </span>
                            <span>{copy.to} {valueLabel(change.after, copy.emptyValue)}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {actions.restoreRevision && restoreAllowed ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || pending !== undefined}
                      onClick={() => void restore(revision.id)}
                    >
                      {pending === revision.id ? copy.restoring : copy.restore}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {error ? <p role="alert" className="px-5 pb-4 text-sm text-red-700 dark:text-red-300">{copy.restoreFailed}</p> : null}
      </section>
    </AdminSurfaceCard>
  );
}
