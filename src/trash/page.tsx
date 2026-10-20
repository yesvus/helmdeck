// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import { useAdminMessages } from "../i18n.js";
import { AdminDestructiveAction } from "../primitives/destructive-action.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminLoadingState, AdminTableSkeleton } from "../primitives/skeleton.js";
import { AdminTable, type AdminTableColumn } from "../primitives/table.js";
import { AdminTableBulkActions, AdminTableRowActions } from "../primitives/table-actions.js";
import { Button } from "../primitives/button.js";
import { defaultAdminTrashMessages } from "./messages.js";
import type { AdminTrashMessages } from "./messages.js";

export type AdminTrashItem = {
  id: string;
  resource: string;
  label: string;
  deletedAt: string | Date;
  deletedBy?: string | null;
};

function formatDeletedAt(value: string | Date, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AdminTrashPage<T extends AdminTrashItem>({
  items,
  loading = false,
  onRestore,
  onPurge,
  onRestoreMany,
  onPurgeMany,
  labels,
  className,
}: {
  items: readonly T[];
  loading?: boolean;
  onRestore: (item: T) => void | Promise<void>;
  onPurge: (item: T) => void | Promise<void>;
  onRestoreMany?: (items: readonly T[]) => void | Promise<void>;
  onPurgeMany?: (items: readonly T[]) => void | Promise<void>;
  labels?: Partial<AdminTrashMessages>;
  className?: string;
}) {
  const i18n = useAdminMessages();
  const copy = { ...defaultAdminTrashMessages, ...i18n.trash, ...labels };
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState("");
  const visibleItems = items.filter((item) => !removed.has(item.id));
  const selectedItems = visibleItems.filter((item) => selected.has(item.id));

  async function run(itemsToActOn: readonly T[], action: (item: T) => void | Promise<void>, successLabel: string) {
    if (!itemsToActOn.length) return;
    const ids = itemsToActOn.map((item) => item.id);
    setError(false);
    setSuccess("");
    setRemoved((current) => new Set([...current, ...ids]));
    try {
      for (const item of itemsToActOn) await action(item);
      setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
      setSuccess(successLabel);
    } catch {
      setRemoved((current) => new Set([...current].filter((id) => !ids.includes(id))));
      setError(true);
    }
  }

  async function runMany(itemsToActOn: readonly T[], action: (items: readonly T[]) => void | Promise<void>, successLabel: string) {
    if (!itemsToActOn.length) return;
    const ids = itemsToActOn.map((item) => item.id);
    setError(false);
    setSuccess("");
    setRemoved((current) => new Set([...current, ...ids]));
    try {
      await action(itemsToActOn);
      setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
      setSuccess(successLabel);
    } catch {
      setRemoved((current) => new Set([...current].filter((id) => !ids.includes(id))));
      setError(true);
    }
  }

  const columns: AdminTableColumn<T>[] = [
    { key: "label", header: copy.item, cell: (item) => <span className="font-medium text-admin-foreground">{item.label}</span> },
    { key: "resource", header: copy.resource, cell: (item) => item.resource },
    { key: "deletedAt", header: copy.deletedAt, cell: (item) => formatDeletedAt(item.deletedAt, i18n.searchLocale) },
    { key: "deletedBy", header: copy.deletedBy, cell: (item) => item.deletedBy || "—" },
    {
      key: "actions",
      header: "",
      cell: (item) => (
        <AdminTableRowActions label={`${copy.item}: ${item.label}`}>
          <Button type="button" size="sm" variant="secondary" onClick={() => void run([item], onRestore, copy.restored)}>{copy.restore}</Button>
          <AdminDestructiveAction
            buttonText={copy.purge}
            triggerAriaLabel={`${copy.purge}: ${item.label}`}
            title={copy.confirmPurgeTitle}
            description={copy.confirmPurgeDescription}
            confirmLabel={copy.confirmLabel}
            cancelLabel={copy.cancelLabel}
            busyLabel={copy.busyLabel}
            onConfirm={() => run([item], onPurge, copy.purged)}
          />
        </AdminTableRowActions>
      ),
    },
  ];

  if (loading) {
    return (
      <AdminLoadingState label={copy.loading} className={className}>
        <AdminTableSkeleton rowCount={5} columnCount={5} />
      </AdminLoadingState>
    );
  }

  return (
    <section className={className} aria-labelledby="admin-trash-title">
      <header className="mb-5">
        <h1 id="admin-trash-title" className="text-2xl font-semibold text-admin-foreground">{copy.title}</h1>
        <p className="mt-1 text-sm text-admin-muted">{copy.description}</p>
      </header>
      {onRestoreMany || onPurgeMany ? (
        <AdminTableBulkActions selectedCount={selectedItems.length} selectedCountLabel={copy.selectedCount} className="mb-4">
          {onRestoreMany ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void runMany(selectedItems, onRestoreMany, copy.restoredMany(selectedItems.length))}>
              {copy.restoreSelected}
            </Button>
          ) : null}
          {onPurgeMany ? (
            <AdminDestructiveAction
              buttonText={copy.purgeSelected}
              title={copy.confirmPurgeSelectedTitle}
              description={copy.confirmPurgeSelectedDescription(selectedItems.length)}
              confirmLabel={copy.confirmLabel}
              cancelLabel={copy.cancelLabel}
              busyLabel={copy.busyLabel}
              onConfirm={() => runMany(selectedItems, onPurgeMany, copy.purgedMany(selectedItems.length))}
            />
          ) : null}
        </AdminTableBulkActions>
      ) : null}
      {error ? <p role="alert" className="mb-3 text-sm font-medium text-admin-danger-text">{copy.actionFailed}</p> : null}
      {success ? <p role="status" className="mb-3 text-sm font-medium text-emerald-700">{success}</p> : null}
      {visibleItems.length === 0 ? (
        <AdminEmptyState title={copy.emptyTitle} body={copy.emptyBody} />
      ) : (
        <AdminTable
          columns={columns}
          rows={[...visibleItems]}
          getKey={(item) => item.id}
          caption={copy.title}
          selection={onRestoreMany || onPurgeMany ? {
            selectedKeys: selected,
            onSelectionChange: (keys) => setSelected(new Set([...keys].map(String))),
            label: copy.selectItem,
            selectAllLabel: copy.selectAll,
          } : undefined}
        />
      )}
    </section>
  );
}
