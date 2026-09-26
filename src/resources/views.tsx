// SPDX-License-Identifier: MIT
"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "../primitives/button.js";
import { AdminTable, type AdminTableColumn } from "../primitives/table.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminField, AdminFieldGrid, AdminFormActions } from "../primitives/field.js";
import { AdminInput, AdminTextarea } from "../primitives/input.js";
import { AdminPageHeader } from "../shell/admin-page-header.js";
import { AdminCan, useAdminPermission } from "../shell/permissions.js";
import { useAdminMessages } from "../i18n.js";
import { cn } from "../cn.js";
import type { AdminPersistenceAdapter } from "../adapters/index.js";
import {
  adminResourcePath,
  adminResourceRecordId,
  adminResourceValues,
  type AdminResourceDefinition,
  type AdminResourceRecord,
} from "./registry.js";

/**
 * A list view generated from a resource definition, so a CMS host does not hand-write a table
 * per resource. Reads go through the persistence adapter; the create, edit and delete controls
 * are wrapped in the resource's own permissions, so a definition that declares them gets them
 * enforced without the host wiring a guard per button.
 */
export function AdminResourceList({
  definition,
  persistence,
  detailBaseHref,
  labels,
  onError,
}: {
  definition: AdminResourceDefinition;
  persistence: AdminPersistenceAdapter;
  /** Where the detail route for a record lives. Defaults to the resource's own path. */
  detailBaseHref?: string;
  labels?: {
    empty?: string;
    new?: string;
    edit?: string;
    remove?: string;
    loadError?: string;
    deleteFailed?: string;
  };
  onError?: (cause: unknown) => void;
}) {
  const i18n = useAdminMessages();
  const [rows, setRows] = useState<AdminResourceRecord[] | null>(null);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const base = detailBaseHref ?? adminResourcePath(definition);
  const permissions = definition.permissions ?? {};

  // Resolved in a callback rather than by awaiting inside the effect body, because a setState
  // in that body is a cascading render.
  useEffect(() => {
    let active = true;
    const scope = active;
    void persistence.query<AdminResourceRecord>(definition.resource).then(
      (found) => {
        if (!scope) return;
        setRows(
          found
            .map((row) => {
              try {
                return { ...row, id: adminResourceRecordId(row) };
              } catch {
                // A record with no usable id cannot be addressed, so it cannot be listed either.
                return null;
              }
            })
            .filter((row): row is AdminResourceRecord => row !== null),
        );
      },
      (cause: unknown) => {
        if (!scope) return;
        setMessage(labels?.loadError ?? i18n.shell.resourceLoadError);
        onError?.(cause);
      },
    );
    return () => {
      active = false;
    };
  }, [definition.resource, i18n.shell.resourceLoadError, labels?.loadError, onError, persistence]);

  async function remove(id: string) {
    setBusyId(id);
    try {
      await persistence.delete(definition.resource, id);
      setRows((current) => (current ?? []).filter((row) => row.id !== id));
    } catch (cause) {
      setMessage(labels?.deleteFailed ?? i18n.shell.resourceDeleteFailed);
      onError?.(cause);
    } finally {
      setBusyId(null);
    }
  }

  const columns: AdminTableColumn<AdminResourceRecord>[] = [
    ...definition.columns.map((column) => ({
      key: column.key,
      header: column.header,
      align: column.align,
      width: column.width,
      cell: (row: AdminResourceRecord) =>
        column.format ? column.format(row[column.key], row) : renderValue(row[column.key]),
    })),
    {
      key: "__actions",
      header: i18n.shell.resourceActions,
      align: "right",
      cell: (row: AdminResourceRecord) => (
        <span className="flex items-center justify-end gap-2">
          {permissions.update ? (
            <AdminCan permission={permissions.update}>
              <a
                href={`${base}/${row.id}`}
                aria-label={`${labels?.edit ?? i18n.shell.resourceEdit}: ${row.id}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-admin-surface text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </a>
            </AdminCan>
          ) : null}
          {permissions.delete ? (
            <AdminCan permission={permissions.delete} fallback={null}>
              <Button
                type="button"
                variant="outline"
                disabled={busyId === row.id}
                aria-busy={busyId === row.id || undefined}
                aria-label={`${labels?.remove ?? i18n.shell.resourceDelete}: ${row.id}`}
                onClick={() => void remove(row.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </AdminCan>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={definition.label}
        action={
          permissions.create ? (
            <AdminCan permission={permissions.create}>
              <Button asChild variant="default">
                <a href={`${base}/new`} className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {labels?.new ?? i18n.shell.resourceNew}
                </a>
              </Button>
            </AdminCan>
          ) : null
        }
      />

      {message ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {message}
        </p>
      ) : null}

      {rows === null ? null : rows.length === 0 ? (
        <AdminEmptyState
          title={labels?.empty ?? i18n.shell.resourceEmpty}
          body={i18n.shell.resourceEmptyBody}
        />
      ) : (
        <AdminTable
          columns={columns}
          rows={rows}
          getKey={(row) => row.id}
          caption={definition.label}
        />
      )}
    </div>
  );
}

const EMPTY_VALUES: Record<string, unknown> = {};

function renderValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "•" : null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * A detail form generated from a resource definition, handling both create and edit. The same
 * definition drives validation, so a field declared required is enforced here rather than by a
 * server action the host would have to remember to write.
 */
export function AdminResourceForm({
  definition,
  persistence,
  id,
  backHref,
  labels,
  onSaved,
  onError,
}: {
  definition: AdminResourceDefinition;
  persistence: AdminPersistenceAdapter;
  /** Absent for a new record. */
  id?: string;
  backHref?: string;
  labels?: {
    new?: string;
    save?: string;
    saving?: string;
    cancel?: string;
    notFound?: string;
    saveFailed?: string;
  };
  onSaved?: (record: AdminResourceRecord) => void;
  onError?: (cause: unknown) => void;
}) {
  const i18n = useAdminMessages();
  const [loaded, setLoaded] = useState<Record<string, unknown> | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const permissions = definition.permissions ?? {};
  const isNew = id === undefined;
  // A resource that declares no create or update permission is ungated, matching the list,
  // where an undeclared permission means no control rather than a hidden one.
  const requiredPermission = isNew ? permissions.create : permissions.update;
  const granted = useAdminPermission(requiredPermission);

  // A new record starts empty without a state write, so switching between new and existing
  // cannot leave the previous record's values in the form.
  const values = isNew ? EMPTY_VALUES : loaded;

  useEffect(() => {
    if (isNew) return;
    let active = true;
    void persistence.read<AdminResourceRecord>(definition.resource, id as string).then(
      (found) => {
        if (active) setLoaded(found ? { ...found, id: adminResourceRecordId(found) } : null);
      },
      (cause: unknown) => {
        if (active) {
          setMessage(labels?.notFound ?? i18n.shell.resourceNotFound);
          onError?.(cause);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [definition.resource, i18n.shell.resourceNotFound, id, isNew, labels?.notFound, onError, persistence]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Checked here as well as on the button, because a form can be submitted without it.
    if (granted !== "allowed") {
      setMessage(i18n.shell.permissionDenied);
      return;
    }
    const form = event.currentTarget;
    const parsed = adminResourceValues(definition, new FormData(form));

    // Enforced here rather than left to the server, so a definition is the whole contract.
    const absent = definition.fields
      .filter((field) => field.required)
      .filter((field) => {
        const value = parsed[field.name];
        return value === null || value === undefined || value === "" || value === false;
      })
      .map((field) => field.name);
    if (absent.length > 0) {
      setMissing(absent);
      return;
    }

    setPending(true);
    setMessage("");
    try {
      const saved = isNew
        ? await persistence.create<AdminResourceRecord>(definition.resource, parsed)
        : await persistence.update<AdminResourceRecord>(definition.resource, id, parsed);
      onSaved?.({ ...saved, id: adminResourceRecordId(saved) });
    } catch (cause) {
      setMessage(labels?.saveFailed ?? i18n.shell.resourceSaveFailed);
      onError?.(cause);
    } finally {
      setPending(false);
    }
  }

  if (values === null && !isNew) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-300">
        {message || labels?.notFound || i18n.shell.resourceNotFound}
      </p>
    );
  }

  return (
    <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <AdminPageHeader
        title={isNew ? (labels?.new ?? i18n.shell.resourceNew) : definition.singularLabel ?? definition.label}
        action={
          backHref ? (
            <a href={backHref} className="text-sm font-medium text-admin-brand-text underline underline-offset-4">
              {labels?.cancel ?? i18n.shell.resourceCancel}
            </a>
          ) : null
        }
      />

      {message ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {message}
        </p>
      ) : null}

      <AdminFieldGrid>
        {definition.fields.map((field) => {
          const controlId = `${definition.resource}-${field.name}`;
          const current = values?.[field.name];
          const invalid = missing.includes(field.name);
          return (
            <AdminField
              key={field.name}
              id={controlId}
              label={field.label}
              hint={field.hint}
              error={invalid ? i18n.shell.resourceFieldRequired : undefined}
            >
              {field.render ? (
                field.render(current, controlId)
              ) : field.type === "textarea" ? (
                <AdminTextarea
                  id={controlId}
                  name={field.name}
                  required={field.required}
                  defaultValue={current === null || current === undefined ? "" : String(current)}
                  aria-invalid={invalid || undefined}
                  className={cn(invalid && "border-red-500")}
                />
              ) : field.type === "checkbox" ? (
                <input
                  id={controlId}
                  name={field.name}
                  type="checkbox"
                  defaultChecked={current === true}
                  className="h-4 w-4 rounded border-zinc-300"
                />
              ) : (
                <AdminInput
                  id={controlId}
                  name={field.name}
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                  required={field.required}
                  defaultValue={current === null || current === undefined ? "" : String(current)}
                  aria-invalid={invalid || undefined}
                  className={cn(invalid && "border-red-500")}
                />
              )}
            </AdminField>
          );
        })}
      </AdminFieldGrid>

      <AdminFormActions>
        {granted === "allowed" ? (
          <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
            {pending ? (labels?.saving ?? i18n.shell.resourceSaving) : (labels?.save ?? i18n.shell.resourceSave)}
          </Button>
        ) : null}
      </AdminFormActions>
    </form>
  );
}
