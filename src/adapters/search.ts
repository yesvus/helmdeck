// SPDX-License-Identifier: MIT
import type { AdminPermission, AdminPermissionsAdapter } from "./host.js";

export type AdminRecordSearchResult = {
  resource: string;
  resourceLabel: string;
  resourceId: string;
  label: string;
  href: string;
};

export type AdminSearchAdapter = {
  search: (query: string, signal: AbortSignal) => Promise<AdminRecordSearchResult[]>;
};

export type AdminSearchCandidate = {
  id: string;
  label: string;
  href: string;
};

export type AdminSearchResource = {
  resource: string;
  label: string;
  permission?: AdminPermission;
  maxResults?: number;
  search: (query: string, signal: AbortSignal, limit: number) => Promise<readonly AdminSearchCandidate[]>;
};

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;
const PERMISSION_CHECK_BATCH_SIZE = 8;

function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function searchResource(
  source: AdminSearchResource,
  permissions: AdminPermissionsAdapter,
  term: string,
  signal: AbortSignal,
): Promise<AdminRecordSearchResult[]> {
  const permission = source.permission ?? `${source.resource}.read`;
  if (!(await raceWithAbort(Promise.resolve().then(() => {
    signal.throwIfAborted();
    return permissions.can(permission);
  }), signal))) return [];

  const limit = source.maxResults ?? DEFAULT_SEARCH_LIMIT;
  const candidates = (await raceWithAbort(Promise.resolve().then(() => {
    signal.throwIfAborted();
    return source.search(term, signal, limit);
  }), signal)).slice(0, limit);
  const allowed: boolean[] = [];

  for (let offset = 0; offset < candidates.length; offset += PERMISSION_CHECK_BATCH_SIZE) {
    signal.throwIfAborted();
    const batch = candidates.slice(offset, offset + PERMISSION_CHECK_BATCH_SIZE);
    const answers = await Promise.all(batch.map((candidate) =>
      raceWithAbort(
        Promise.resolve().then(() => {
          signal.throwIfAborted();
          return permissions.can(permission, { resourceId: candidate.id });
        }),
        signal,
      ),
    ));
    allowed.push(...answers);
  }

  return candidates.flatMap((candidate, index) => allowed[index]
    ? [{
        resource: source.resource,
        resourceLabel: source.label,
        resourceId: candidate.id,
        label: candidate.label,
        href: candidate.href,
      }]
    : []);
}

export function createAdminSearchAdapter({
  permissions,
  resources,
}: {
  permissions: AdminPermissionsAdapter;
  resources: readonly AdminSearchResource[];
}): AdminSearchAdapter {
  for (const source of resources) {
    if (source.maxResults !== undefined &&
      (!Number.isInteger(source.maxResults) || source.maxResults < 1 || source.maxResults > MAX_SEARCH_LIMIT)) {
      throw new Error(`Search limit for resource "${source.resource}" must be an integer from 1 to ${MAX_SEARCH_LIMIT}`);
    }
  }

  return {
    async search(query, signal) {
      const term = query.trim();
      if (!term) return [];
      signal.throwIfAborted();

      const matches = await Promise.allSettled(resources.map((source) =>
        searchResource(source, permissions, term, signal),
      ));

      signal.throwIfAborted();
      const successful = matches.filter((result) => result.status === "fulfilled");
      if (successful.length === 0 && matches.length > 0) {
        throw new AggregateError(
          matches.map((result) => result.status === "rejected" ? result.reason : undefined),
          "Every configured record search failed",
        );
      }
      return successful.flatMap((result) => result.value);
    },
  };
}
