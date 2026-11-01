// SPDX-License-Identifier: MIT

/**
 * Host-owned contract for the admin database-backups page.
 *
 * The page never touches a database, filesystem or backup provider. A host's own code reads
 * wherever its backups live and hands the result to the page through this contract, so the
 * retention policy stays the host's to define and the page stays a renderer of it.
 *
 * `backups` is the list of entries the host wants shown, `status` is the overall outcome of the
 * host's read, and `retention` is the authoritative policy the page summarises. `null`/`undefined`
 * for the whole value (or no props at all) means the host supplies nothing, which renders the
 * unconfigured state. A thrown read or an `error` renders the unavailable state.
 */

export type DatabaseBackupEntry = {
  /** Stable identifier for the backup, as the host names it. */
  id: string;
  /** When the backup was taken, in any form a `Date` constructor accepts. */
  timestamp: string | number | Date;
  /** Size in bytes, when the host knows it. */
  size?: number;
  /** Host-defined kind, for example "daily" or "manual". */
  kind?: string;
};

export type DatabaseBackupsRetention =
  | string
  | {
      /** A host-written summary, used verbatim when present. */
      summary?: string;
      label?: string;
      description?: string;
      /** Number of backups the policy keeps. */
      keep?: number;
      maxBackups?: number;
      /** Age limit in days. */
      maxAgeDays?: number;
      /** Age limit in hours. */
      maxAgeHours?: number;
    };

export type DatabaseBackupsStatus =
  | "configured"
  | "unconfigured"
  | "empty"
  | "stale"
  | "unavailable";

export type DatabaseBackupsReport = {
  status?: DatabaseBackupsStatus | "configured" | "ok" | "ready" | "error" | "failed";
  backups?: DatabaseBackupEntry[];
  entries?: DatabaseBackupEntry[];
  items?: DatabaseBackupEntry[];
  records?: DatabaseBackupEntry[];
  retention?: DatabaseBackupsRetention;
  retentionPolicy?: DatabaseBackupsRetention;
  retention_policy?: DatabaseBackupsRetention;
  policy?: DatabaseBackupsRetention;
  error?: string;
  message?: string;
  reason?: string;
  stale?: boolean;
  isStale?: boolean;
  fresh?: boolean;
  isFresh?: boolean;
  configured?: boolean;
  isConfigured?: boolean;
  data?: DatabaseBackupsReport;
  report?: DatabaseBackupsReport;
  snapshot?: DatabaseBackupsReport;
  result?: DatabaseBackupsReport;
  value?: DatabaseBackupsReport;
};

function field(source: unknown, ...names: string[]): unknown {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(record, name)) return record[name];
  }
  for (const nest of ["data", "report", "snapshot", "result", "value", "props"]) {
    const nested = record[nest];
    if (nested && typeof nested === "object") {
      const found = field(nested, ...names);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function resolveDatabaseBackupsState(input: DatabaseBackupsReport | null | undefined): DatabaseBackupsStatus {
  const status = field(input, "status", "state");
  const error = field(input, "error", "message", "reason");
  const retention = field(input, "retention", "retentionPolicy", "retention_policy", "policy");
  const backups = field(input, "backups", "entries", "items", "records");
  const staleFlag = field(input, "stale", "isStale");
  const freshFlag = field(input, "fresh", "isFresh", "freshness");
  const configuredFlag = field(input, "configured", "isConfigured");

  if (status === "unavailable" || status === "error" || status === "failed") return "unavailable";
  if (error !== undefined && error !== null && error !== "" && status !== "configured" && status !== "empty" && status !== "stale") {
    return "unavailable";
  }

  if (status === "unconfigured" || configuredFlag === false) return "unconfigured";
  if (
    retention === undefined &&
    backups === undefined &&
    configuredFlag === undefined &&
    status === undefined &&
    (error === undefined || error === null || error === "")
  ) {
    return "unconfigured";
  }

  const stale =
    status === "stale" ||
    staleFlag === true ||
    freshFlag === false ||
    freshFlag === "false";

  if (stale) return "stale";
  if (status === "empty") return "empty";
  const list = Array.isArray(backups) ? backups : [];
  if (list.length === 0 && retention !== undefined) return "empty";
  if (status === "configured" || status === "ok" || status === "ready") {
    return list.length === 0 && retention === undefined ? "configured" : list.length === 0 ? "empty" : "configured";
  }
  if (list.length === 0 && retention === undefined && status === undefined) return "unconfigured";
  return list.length === 0 ? "empty" : "configured";
}

export function normalizeDatabaseBackups(input: DatabaseBackupsReport | null | undefined): {
  state: DatabaseBackupsStatus;
  backups: DatabaseBackupEntry[];
  retention: DatabaseBackupsRetention | undefined;
  error: string | undefined;
} {
  const state = resolveDatabaseBackupsState(input);
  const rawBackups = field(input, "backups", "entries", "items", "records");
  const backups = Array.isArray(rawBackups) ? (rawBackups as DatabaseBackupEntry[]) : [];
  const retention = field(input, "retention", "retentionPolicy", "retention_policy", "policy") as
    | DatabaseBackupsRetention
    | undefined;
  const rawError = field(input, "error", "message", "reason");
  const error = typeof rawError === "string" ? rawError : rawError != null ? String(rawError) : undefined;
  return { state, backups, retention, error };
}

export function summarizeDatabaseBackupsRetention(retention: DatabaseBackupsRetention | undefined): string | null {
  if (retention === undefined || retention === null) return null;
  if (typeof retention === "string") return retention;
  const record = retention as Record<string, unknown>;
  if (typeof record.summary === "string") return record.summary;
  if (typeof record.label === "string") return record.label;
  if (typeof record.description === "string") return record.description;
  const parts: string[] = [];
  const keep = record.keep ?? record.maxBackups;
  if (typeof keep === "number") parts.push(`Keep ${keep} backups`);
  if (typeof record.maxAgeDays === "number") parts.push(`for ${record.maxAgeDays} days`);
  if (typeof record.maxAgeHours === "number") parts.push(`for ${record.maxAgeHours} hours`);
  return parts.length > 0 ? parts.join(" ") : null;
}
