// SPDX-License-Identifier: MIT
"use client";

import { HardDrive } from "lucide-react";
import { AdminPageHeader } from "@yesvus/helmdeck";
import {
  normalizeDatabaseBackups,
  summarizeDatabaseBackupsRetention,
  type DatabaseBackupEntry,
  type DatabaseBackupsReport,
} from "../../../lib/backups";

/**
 * A reusable database-backups page. The host supplies the snapshot (entries, status and the
 * authoritative retention policy); this page renders it and nothing else, so no backup provider,
 * filesystem or database is reached from here.
 */
function DatabaseBackupsPage(props: DatabaseBackupsReport) {
  const { state, backups, retention, error } = normalizeDatabaseBackups(props);
  const retentionSummary = summarizeDatabaseBackupsRetention(retention);

  return (
    <div className="space-y-6" data-testid="database-backups" data-state={state}>
      <AdminPageHeader title="Database backups" />

      {state === "unconfigured" ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Database backups are not configured.
        </p>
      ) : null}

      {state === "unavailable" ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Database backups are unavailable.
          {error ? ` ${error}` : ""}
        </p>
      ) : null}

      {state === "stale" ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Database backups are stale.
        </p>
      ) : null}

      {state === "empty" ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          No backups recorded yet.
        </p>
      ) : null}

      {state === "configured" || state === "stale" || state === "empty" ? (
        <section className="space-y-4">
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              <HardDrive className="h-4 w-4" aria-hidden="true" />
              Retention policy
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {retentionSummary ?? "No retention policy supplied."}
            </p>
          </div>

          {backups.length > 0 ? (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {backups.map((backup: DatabaseBackupEntry) => (
                <li key={backup.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{backup.id}</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">{String(backup.timestamp)}</span>
                  {backup.size !== undefined ? (
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">{backup.size} bytes</span>
                  ) : null}
                  {backup.kind ? (
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">{backup.kind}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {state === "configured" ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Configured.
        </p>
      ) : null}
    </div>
  );
}

export default DatabaseBackupsPage;
export { DatabaseBackupsPage };
