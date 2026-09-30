// SPDX-License-Identifier: MIT
"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link.js";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { Button } from "../primitives/button.js";
import { AdminDestructiveAction } from "../primitives/destructive-action.js";
import { AdminPagination } from "../primitives/pagination.js";
import { AdminSelect } from "../primitives/select.js";
import { AdminTable, type AdminTableColumn } from "../primitives/table.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminField, AdminFieldGrid, AdminFormActions } from "../primitives/field.js";
import { AdminInput, AdminTextarea } from "../primitives/input.js";
import { AdminPageHeader } from "../shell/admin-page-header.js";
import { adminFormatCents, adminFormatCount } from "../charts/money.js";
import { AdminCan, useAdminPermission } from "../shell/permissions.js";
import { useAdminHref, useAdminMessages } from "../i18n.js";
import { cn } from "../cn.js";
import {
  ADMIN_RESOURCE_MAX_LIMIT,
  adminResourceQuery,
  type AdminResourceSort,
} from "../adapters/query.js";
import type { AdminPersistenceAdapter } from "../adapters/index.js";
import {
  absentRequired,
  adminResourcePath,
  adminResourceRecordId,
  adminResourceValues,
  type AdminResourceColumnFormat,
  type AdminResourceDefinition,
  type AdminResourceFilterDefinition,
  type AdminResourceFormatter,
  type AdminResourceRecord,
} from "./registry.js";
import { defaultAdminResourceListQueryLabels } from "./list-labels.js";

/** Rows a list asks for per page. Enough to read, few enough that a wide table still fits. */
const PAGE_SIZE = 40;

/**
 * The format names this package answers, and the code behind each.
 *
 * A column names one rather than carrying it, because this list is a client component: a definition
 * reaches it as data, and a function in that data is refused at prerender. A number the store holds
 * in whole cents is the case worth shipping, since the division belongs at the moment of display and
 * nowhere earlier, and a plain count is the other half of the same pair. A missing value prints an
 * em dash rather than nothing, because a blank cell and a cell holding a value no cell can show are
 * different claims and a column of prices has to make one of them.
 */
const SHIPPED_FORMATTERS: Record<"money" | "count", AdminResourceFormatter> = {
  money: (value) => (typeof value === "number" ? adminFormatCents(value) : "—"),
  count: (value) => (typeof value === "number" ? adminFormatCount(value) : "—"),
};

/** The name a column's `format` asks for, with the package's own two written as bare words. */
function formatName(format: AdminResourceColumnFormat): string {
  return typeof format === "string" ? format : format.name;
}

/**
 * The function that prints a column, or nothing for a column that names no format.
 *
 * The host's map is asked before the shipped names, so a host that registers `money` for another
 * currency gets its own rather than being quietly given the package's.
 *
 * A name nothing answers is refused rather than ignored. A column silently showing `4900` where its
 * definition promised `$49.00` is a wrong number on a page that looks right, and a host whose
 * formatter is missing learns about it from their own test rather than from a reader.
 */
function columnFormatter(
  column: { key: string; format?: AdminResourceColumnFormat },
  formatters: Readonly<Record<string, AdminResourceFormatter>> | undefined,
): AdminResourceFormatter | undefined {
  if (column.format === undefined) return undefined;
  const name = formatName(column.format);
  const formatter = formatters?.[name] ?? SHIPPED_FORMATTERS[name as "money" | "count"];
  if (!formatter) {
    throw new Error(
      `Column ${column.key} formats as ${JSON.stringify(name)}, which nothing answers. ` +
        `The list ships ${Object.keys(SHIPPED_FORMATTERS).join(" and ")}; ` +
        `pass anything else in formatters. Known names: ` +
        `${[...Object.keys(formatters ?? {}), ...Object.keys(SHIPPED_FORMATTERS)].join(", ")}.`,
    );
  }
  return formatter;
}

/** Long enough that a term is not a query per keystroke, short enough to feel immediate. */
const SEARCH_SETTLE_MS = 250;

type ListControls = {
  /** The term in the search box, which reaches the adapter as it is typed. */
  search: string;
  /** Each filter control's value, by field. */
  filters: Record<string, string>;
  sort: AdminResourceSort[];
  page: number;
};

const NO_CONTROLS: ListControls = { search: "", filters: {}, sort: [], page: 1 };
const NO_FILTERS: AdminResourceFilterDefinition[] = [];

/**
 * A value that stops changing before it is used, so a typed term is one query rather than one per
 * keystroke. One direction only, so a value that has been superseded is never applied late.
 *
 * `key` is what the value belongs to. A different list is not a keystroke in this one, so its
 * value is taken at once rather than a quarter of a second later, which is the window in which a
 * term chosen for one resource would have been asked of the next.
 */
function useSettled<T>(value: T, key: string): T {
  const [settled, setSettled] = useState({ key, value });
  if (settled.key !== key) setSettled({ key, value });
  useEffect(() => {
    if (settled.key === key && Object.is(settled.value, value)) return;
    const timer = setTimeout(() => setSettled({ key, value }), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key, settled, value]);
  return settled.value;
}

/**
 * A list view generated from a resource definition, so a CMS host does not hand-write a table
 * per resource. Reads go through the persistence adapter; the create, edit and delete controls
 * are wrapped in the resource's own permissions, so a definition that declares them gets them
 * enforced without the host wiring a guard per button.
 *
 * An adapter that answers `queryPage` has said it understands search, sorting, filtering and
 * paging, and the list asks it for each of those. An adapter that does not is asked for the rows
 * and nothing else, and gets the same list it always did, because a control that cannot work is
 * not drawn.
 */
export function AdminResourceList({
  definition,
  persistence,
  detailBaseHref,
  pageSize = PAGE_SIZE,
  formatters,
  labels,
  onError,
}: {
  definition: AdminResourceDefinition;
  persistence: AdminPersistenceAdapter;
  /** Where the detail route for a record lives. Defaults to the resource's own path. */
  detailBaseHref?: string;
  /** Rows per page, asked of an adapter that answers a window. */
  pageSize?: number;
  /**
   * The formatters a column's `format` can name, by that name. What a host registers here is the
   * code the definition cannot carry, which is why it is a prop of the client component rather than
   * part of the description: a server component can hand down the names and not these.
   */
  formatters?: Readonly<Record<string, AdminResourceFormatter>>;
  labels?: {
    empty?: string;
    new?: string;
    edit?: string;
    remove?: string;
    loadError?: string;
    deleteFailed?: string;
    search?: string;
    searchPlaceholder?: string;
    all?: string;
    ascending?: string;
    descending?: string;
    resultCount?: (from: number, to: number, total: number) => string;
    noMatches?: string;
  };
  onError?: (cause: unknown) => void;
}) {
  const i18n = useAdminMessages();
  const toHref = useAdminHref();
  const copy = { ...defaultAdminResourceListQueryLabels, ...labels };
  // The adapter's own shape is the only evidence there is that it can answer a query. A host
  // that did not implement the paged form is not asked about search, rather than being asked
  // and having its rows returned unsearched under a search box that looks like it worked.
  const paged = typeof persistence.queryPage === "function";
  // Clamped rather than refused: this is a host's own prop, and a bad one belongs in the host's
  // build rather than in the list a visitor is looking at.
  const size = Math.max(1, Math.min(Math.trunc(pageSize) || PAGE_SIZE, ADMIN_RESOURCE_MAX_LIMIT));
  // Keyed by the resource they came from, so a different resource cannot show these.
  const [loaded, setLoaded] = useState<{
    resource: string;
    rows: AdminResourceRecord[];
    /** Null when the adapter answered rows without saying how many there are. */
    total: number | null;
  } | null>(null);
  const rows = loaded?.resource === definition.resource ? loaded.rows : null;
  const total = loaded?.resource === definition.resource ? loaded.total : null;
  // The same keying as the rows, so a new resource's list starts from nothing chosen rather than
  // from the previous one's search box.
  const [controls, setControls] = useState<ListControls & { resource: string }>({
    resource: definition.resource,
    ...NO_CONTROLS,
  });
  const active = controls.resource === definition.resource ? controls : NO_CONTROLS;
  const search = useSettled(active.search, definition.resource);
  const chosen = useSettled(active.filters, definition.resource);
  // Bumped to ask again, which a delete is: the count it reported is one row out of date, and a
  // page that just lost its last row has to come back from the store to know there is no next.
  const [reload, setReload] = useState(0);
  const [message, setMessage] = useState("");
  const base = detailBaseHref ?? adminResourcePath(definition);
  const permissions = definition.permissions ?? {};
  // Checked before anything is read. Gating the rendered rows would still have queried, and
  // a denied visitor would have had the records in the response. No record is named, because a
  // list is a collection: this is the question the server's `query` asks, and the form asks the
  // per-record one.
  const mayRead = useAdminPermission(permissions.read);
  const filterDefinitions = definition.filters ?? NO_FILTERS;

  /**
   * What the list is asking for, as the caller expressed it. The rows that come back are the
   * answer: nothing here orders, narrows or slices them, because a view that filtered its own
   * rows would report a count the store never gave it.
   */
  const query = useMemo(() => {
    if (!paged) return undefined;
    const builder = adminResourceQuery();
    if (search.length > 0) builder.search(search);
    for (const filter of filterDefinitions) {
      const value = chosen[filter.field];
      if (value === undefined || value === "") continue;
      const compared = filter.parse ? filter.parse(value) : value;
      if (compared === undefined) continue;
      builder.where(filter.field, filter.operator ?? (filter.options ? "eq" : "contains"), compared);
    }
    for (const ordering of active.sort) builder.sort(ordering.field, ordering.direction);
    builder.window((active.page - 1) * size, size);
    return builder.build();
  }, [active.page, active.sort, chosen, filterDefinitions, paged, search, size]);

  // Resolved in a callback rather than by awaiting inside the effect body, because a setState
  // in that body is a cascading render.
  useEffect(() => {
    if (mayRead !== "allowed") return;
    let live = true;
    const answer = paged && query !== undefined
      ? persistence
          .queryPage?.<AdminResourceRecord>(definition.resource, query)
          .then((page) => ({ rows: page.rows, total: page.total }))
      : persistence.query<AdminResourceRecord>(definition.resource).then((found) => ({
          rows: found,
          total: null,
        }));
    void answer?.then(
      (page) => {
        if (!live) return;
        const usable = page.rows
          .map((row) => {
            try {
              return { ...row, id: adminResourceRecordId(row) };
            } catch {
              // A record with no usable id cannot be addressed, so it cannot be listed either.
              return null;
            }
          })
          .filter((row): row is AdminResourceRecord => row !== null);
        // A window that no longer reaches a record, which is what deleting the last row of the
        // last page leaves behind. Asked for from the page there is, because an empty table is a
        // claim about the whole resource and this is only a claim about this window of it.
        if (page.total !== null && usable.length === 0 && page.total > 0) {
          const last = Math.max(1, Math.ceil(page.total / size));
          if (active.page > last) {
            setControls((current) =>
              current.resource === definition.resource ? { ...current, page: last } : current,
            );
            return;
          }
        }
        setMessage("");
        setLoaded({ resource: definition.resource, rows: usable, total: page.total });
      },
      (cause: unknown) => {
        if (!live) return;
        setMessage(labels?.loadError ?? i18n.shell.resourceLoadError);
        // Dropped as well as reported. Leaving the previous rows under an error message shows
        // records the list can no longer vouch for, next to a claim that loading failed.
        setLoaded((current) =>
          current && current.resource === definition.resource ? { ...current, rows: [] } : current,
        );
        onError?.(cause);
      },
    );
    return () => {
      live = false;
    };
  }, [
    active.page,
    definition.resource,
    i18n.shell.resourceLoadError,
    labels?.loadError,
    mayRead,
    onError,
    paged,
    persistence,
    query,
    reload,
    size,
  ]);

  function updateControls(update: (current: ListControls) => ListControls) {
    setControls({ resource: definition.resource, ...update(active) });
  }

  async function remove(id: string) {
    try {
      await persistence.delete(definition.resource, id);
      setMessage("");
      setLoaded((current) =>
        current && current.resource === definition.resource
          ? { ...current, rows: current.rows.filter((row) => row.id !== id) }
          : current,
      );
      setReload((count) => count + 1);
    } catch (cause) {
      setMessage(labels?.deleteFailed ?? i18n.shell.resourceDeleteFailed);
      onError?.(cause);
    }
  }

  // One column at a time, cycling ascending, descending and back to the store's own order. A
  // longer ordering is something the contract carries and a host can send, not something this
  // control invents on the visitor's behalf.
  function toggleSort(field: string) {
    updateControls((current) => {
      const ordering = current.sort[0];
      const next =
        ordering?.field !== field
          ? [{ field, direction: "asc" as const }]
          : ordering.direction === "asc"
            ? [{ field, direction: "desc" as const }]
            : [];
      return { ...current, sort: next, page: 1 };
    });
  }

  // A non-empty name, not merely a present one: an empty string is a permission nothing can
  // be granted, so it would render a column of controls that never appear. Written inline
  // rather than through a helper so the narrowing reaches the type.
  const nonEmpty = (permission: string | undefined) => permission !== undefined && permission.length > 0;
  const hasRowActions = nonEmpty(permissions.update) || nonEmpty(permissions.delete);
  const columns: AdminTableColumn<AdminResourceRecord>[] = [
    // Resolved once per column rather than once per cell, so a name nothing answers is refused
    // while the table is being built rather than on whichever row happens to be drawn.
    ...definition.columns.map((column) => {
      const format = columnFormatter(column, formatters);
      return {
        key: column.key,
        // A header is a ReactNode, so the sort control is a button inside one and the table
        // primitive needs nothing added to it for this. Not drawn for an adapter that cannot order,
        // for the same reason the search box is not: a control that cannot work is not drawn.
        header:
          column.sortable === true && paged ? (
            <button
              type="button"
              onClick={() => toggleSort(column.key)}
              aria-pressed={active.sort[0]?.field === column.key}
              className="inline-flex items-center gap-1 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:text-zinc-100"
            >
              {column.header}
              {active.sort[0]?.field === column.key ? (
                <>
                  {active.sort[0].direction === "asc" ? (
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {active.sort[0].direction === "asc" ? copy.ascending : copy.descending}
                  </span>
                </>
              ) : null}
            </button>
          ) : (
            column.header
          ),
        align: column.align,
        width: column.width,
        cell: (row: AdminResourceRecord) =>
          format ? format(row[column.key], row) : renderValue(row[column.key]),
      };
    }),
    ...(hasRowActions
      ? [{
      key: "__actions",
      header: i18n.shell.resourceActions,
      align: "right" as const,
      cell: (row: AdminResourceRecord) => (
        <span className="flex items-center justify-end gap-2">
          {permissions.update !== undefined && permissions.update.length > 0 ? (
            <AdminCan permission={permissions.update} resourceId={row.id} fallback={null}>
              <Button asChild variant="outline" size="icon" className="h-8 w-8">
                <Link
                  href={toHref(`${base}/${encodeURIComponent(row.id)}`)}
                  aria-label={`${labels?.edit ?? i18n.shell.resourceEdit}: ${row.id}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </AdminCan>
          ) : null}
          {permissions.delete !== undefined && permissions.delete.length > 0 ? (
            <AdminCan permission={permissions.delete} resourceId={row.id} fallback={null}>
              {/* Confirmed, because a delete is not undoable from here and one stray click
                  would destroy a record with no way back. */}
              <AdminDestructiveAction
                buttonText={labels?.remove ?? i18n.shell.resourceDelete}
                title={i18n.shell.resourceDeleteTitle}
                confirmLabel={labels?.remove ?? i18n.shell.resourceDelete}
                onConfirm={() => remove(row.id)}
                triggerVariant="outline"
                triggerClassName="h-8 px-2 text-xs"
                triggerAriaLabel={`${labels?.remove ?? i18n.shell.resourceDelete}: ${row.id}`}
              />
            </AdminCan>
          ) : null}
        </span>
      ),
    }]
      : []),
  ];

  const pageCount = total === null ? 1 : Math.max(1, Math.ceil(total / size));
  // Whether anything narrowed the list, which is the difference between "there is nothing here"
  // and "there is nothing here that matches", and the two are different claims.
  const narrowed = search.length > 0 || Object.values(active.filters).some((value) => value !== "");

  function filterControl(filter: AdminResourceFilterDefinition, controlId: string) {
    const value = active.filters[filter.field] ?? "";
    const shared = {
      id: controlId,
      name: filter.field,
      value,
      onChange: (event: { target: { value: string } }) =>
        updateControls((current) => ({
          ...current,
          filters: { ...current.filters, [filter.field]: event.target.value },
          page: 1,
        })),
    };
    return filter.options ? (
      <>
        <label htmlFor={controlId} className="sr-only">
          {filter.label}
        </label>
        <AdminSelect {...shared} className="h-9 w-full min-w-40">
          <option value="">{copy.all}</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </AdminSelect>
      </>
    ) : (
      <>
        <label htmlFor={controlId} className="sr-only">
          {filter.label}
        </label>
        <AdminInput
          {...shared}
          type="search"
          placeholder={filter.label}
          className="h-9 w-full min-w-40"
        />
      </>
    );
  }

  if (mayRead === "denied" || mayRead === "error") {
    return (
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        {i18n.shell.permissionDenied}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={definition.label}
        action={
          permissions.create !== undefined ? (
            <AdminCan permission={permissions.create}>
              <Button asChild variant="default">
                <Link href={toHref(`${base}/new`)} className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {labels?.new ?? i18n.shell.resourceNew}
                </Link>
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

      {paged ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full min-w-48 sm:w-64">
            <label htmlFor={`${definition.resource}-search`} className="sr-only">
              {copy.search}
            </label>
            <AdminInput
              id={`${definition.resource}-search`}
              name="search"
              type="search"
              value={active.search}
              placeholder={copy.searchPlaceholder}
              onChange={(event) =>
                updateControls((current) => ({ ...current, search: event.target.value, page: 1 }))
              }
              className="h-9"
            />
          </div>
          {filterDefinitions.map((filter) => (
            <div key={filter.field} className="w-full min-w-40 sm:w-auto">
              {filterControl(filter, `${definition.resource}-filter-${filter.field}`)}
            </div>
          ))}
          {total !== null && rows !== null && rows.length > 0 ? (
            <p className="ml-auto text-sm text-zinc-600 dark:text-zinc-400" role="status">
              {copy.resultCount((active.page - 1) * size + 1, (active.page - 1) * size + rows.length, total)}
            </p>
          ) : null}
        </div>
      ) : null}

      {rows === null ? null : rows.length === 0 ? (
        narrowed ? (
          <AdminEmptyState title={copy.noMatches} body={copy.noMatchesBody} />
        ) : (
          <AdminEmptyState
            title={labels?.empty ?? i18n.shell.resourceEmpty}
            body={i18n.shell.resourceEmptyBody}
          />
        )
      ) : (
        <AdminTable
          columns={columns}
          rows={rows}
          getKey={(row) => row.id}
          caption={definition.label}
        />
      )}

      {paged ? (
        <div className="flex justify-center">
          <AdminPagination
            page={Math.min(active.page, pageCount)}
            pageCount={pageCount}
            onPageChange={(page) => updateControls((current) => ({ ...current, page }))}
          />
        </div>
      ) : null}
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
    loadError?: string;
    saveFailed?: string;
  };
  onSaved?: (record: AdminResourceRecord) => void;
  onError?: (cause: unknown) => void;
}) {
  const i18n = useAdminMessages();
  // A locale-enabled host encodes the content locale in its URLs, so a bare href would drop
  // it on these links while every other link in the shell kept it.
  const toHref = useAdminHref();
  const permissions = definition.permissions ?? {};
  const isNew = id === undefined;
  // Keyed by the id it was read for, so a different record is loading again rather than
  // showing the previous one, and so a resolved miss is distinguishable from no answer yet.
  const [read, setRead] = useState<{
    resource: string;
    id: string;
    value: AdminResourceRecord | null;
    failed?: boolean;
  } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  // An undeclared permission means the action is not offered, which is what the list already
  // did. The two used to mean opposite things, so a resource with no declared create
  // permission showed no New control and still had a working form at the new route.
  const requiredPermission = isNew ? permissions.create : permissions.update;
  const declared = requiredPermission !== undefined;
  // The id goes in, so a host whose rules are per record decides this record rather than the
  // resource as a whole. A new record has no id yet and is decided on the resource alone.
  const held = useAdminPermission(
    requiredPermission,
    isNew || id === undefined ? undefined : { resourceId: id },
  );
  const granted = declared && held === "allowed";
  // Checked before the read, so a denied visitor never has the record in the response. The id
  // goes in for the same reason the write check above carries it: the server's read asks about
  // this record, so asking about the collection here would put two different questions against
  // one rule, and a rule that withholds a single record would be answered for the collection
  // instead of for it.
  const mayRead = useAdminPermission(
    permissions.read,
    id === undefined ? undefined : { resourceId: id },
  );

  // A new record starts empty without a state write, so switching between new and existing
  // cannot leave the previous record's values in the form. Loading is the third state the
  // first version collapsed into "not found": until the read answers, the record is unknown
  // rather than absent, and saying it does not exist is a claim nothing supports yet.
  // Loading covers both things still in flight: the read permission and the record itself.
  // Falling through to "not found" while the permission is merely unresolved reported a
  // missing record for a visitor who may well be allowed to see it.
  const readRefused = mayRead === "denied" || mayRead === "error";
  // Keyed by resource and id together: the same id on a different resource is a different
  // record, and showing the previous one's values would save them to this one.
  const loading =
    !isNew && !readRefused && (read?.resource !== definition.resource || read?.id !== id);
  const values = isNew ? EMPTY_VALUES : (read?.value ?? null);

  useEffect(() => {
    if (isNew || mayRead !== "allowed") return;
    let active = true;
    // A catch rather than a second argument to then: a record whose id cannot be read throws
    // inside the fulfilled handler, and a rejection argument would not see it, leaving the
    // form loading for ever.
    void persistence
      .read<AdminResourceRecord>(definition.resource, id as string)
      .then((found) => {
        if (!active) return;
        // A successful read clears whatever a previous save or read left behind, so a freshly
        // loaded record does not carry an error that belonged to the last one.
        setMessage("");
        setRead({
          resource: definition.resource,
          id: id as string,
          value: found ? { ...found, id: adminResourceRecordId(found) } : null,
        });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setRead({ resource: definition.resource, id: id as string, value: null, failed: true });
        setMessage(labels?.loadError ?? i18n.shell.resourceLoadError);
        onError?.(cause);
      });
    return () => {
      active = false;
    };
  }, [
    definition.resource,
    i18n.shell.resourceLoadError,
    id,
    isNew,
    labels?.loadError,
    mayRead,
    onError,
    persistence,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    // Checked here as well as on the button, because a form can be submitted without it.
    if (!declared) {
      setMessage(i18n.shell.permissionDenied);
      return;
    }
    if (held === "denied" || held === "error") {
      setMessage(i18n.shell.permissionDenied);
      return;
    }
    if (held === "checking") return;
    const form = event.currentTarget;
    const parsed = adminResourceValues(definition, new FormData(form));

    // Enforced here rather than left to the server, so a definition is the whole contract.
    const absent = absentRequired(definition, parsed);
    setMissing(absent);
    if (absent.length > 0) {
      return;
    }

    setPending(true);
    setMessage("");
    try {
      const saved = isNew
        ? await persistence.create<AdminResourceRecord>(definition.resource, parsed)
        : await persistence.update<AdminResourceRecord>(definition.resource, id, parsed);
      // Outside the catch below, and separately reported. The record is already written at
      // this point, so calling it a failed save would invite exactly the duplicate submit a
      // host would then make.
      try {
        onSaved?.({ ...saved, id: adminResourceRecordId(saved) });
      } catch (cause) {
        onError?.(cause);
      }
    } catch (cause) {
      setMessage(labels?.saveFailed ?? i18n.shell.resourceSaveFailed);
      onError?.(cause);
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">{i18n.shell.resourceLoading}</p>;
  }

  // Only an existing record is read, so only an existing record is gated on read. A new one
  // needs create permission and fetches nothing, and denying read must not lock a visitor
  // out of the form they are allowed to fill in.
  if (!isNew && readRefused) {
    return <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">{i18n.shell.permissionDenied}</p>;
  }

  if (!isNew && read?.failed) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-300">
        {message || labels?.loadError || i18n.shell.resourceLoadError}
      </p>
    );
  }

  if (values === null && !isNew) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-300">
        {message || labels?.notFound || i18n.shell.resourceNotFound}
      </p>
    );
  }

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      onChange={(event: FormEvent<HTMLFormElement>) => {
        if (!attempted) return;
        // Re-checked against the form as it now stands, so fixing a field clears its error
        // instead of leaving it marked until the next submit.
        const form = event.currentTarget;
        setMissing(absentRequired(definition, adminResourceValues(definition, new FormData(form))));
      }}
    >
      <AdminPageHeader
        title={isNew ? (labels?.new ?? i18n.shell.resourceNew) : definition.singularLabel ?? definition.label}
        action={
          backHref ? (
            <Link href={toHref(backHref)} className="text-sm font-medium text-admin-brand-text underline underline-offset-4">
              {labels?.cancel ?? i18n.shell.resourceCancel}
            </Link>
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
                  className="h-4 w-4 rounded border-zinc-300 accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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

      {granted ? (
        <AdminFormActions>
          <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
            {pending ? (labels?.saving ?? i18n.shell.resourceSaving) : (labels?.save ?? i18n.shell.resourceSave)}
          </Button>
        </AdminFormActions>
      ) : null}
    </form>
  );
}
