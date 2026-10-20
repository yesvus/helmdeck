// SPDX-License-Identifier: MIT
import type { AdminPermissionsAdapter } from "./host.js";

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
  search: (query: string, signal: AbortSignal) => Promise<readonly AdminSearchCandidate[]>;
};

export function createAdminSearchAdapter({
  permissions,
  resources,
}: {
  permissions: AdminPermissionsAdapter;
  resources: readonly AdminSearchResource[];
}): AdminSearchAdapter {
  return {
    async search(query, signal) {
      const term = query.trim();
      if (!term) return [];
      signal.throwIfAborted();

      const matches = await Promise.all(resources.map(async (source) => {
        const permission = `${source.resource}.read`;
        if (!(await permissions.can(permission))) return [];
        signal.throwIfAborted();
        const candidates = await source.search(term, signal);
        signal.throwIfAborted();
        const allowed = await Promise.all(candidates.map(async (candidate) =>
          permissions.can(permission, { resourceId: candidate.id }),
        ));
        return candidates.flatMap((candidate, index) => allowed[index]
          ? [{
              resource: source.resource,
              resourceLabel: source.label,
              resourceId: candidate.id,
              label: candidate.label,
              href: candidate.href,
            }]
          : []);
      }));

      signal.throwIfAborted();
      return matches.flat();
    },
  };
}
