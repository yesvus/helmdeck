// SPDX-License-Identifier: MIT
"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminNavGroup, AdminPermission } from "../adapters/index.js";
import { useAdminPermissions } from "./permissions.js";

/**
 * Nav filtered by permission. An item with no `permission` is always kept, so adopting this
 * costs a host nothing until it opts an item in.
 *
 * Nothing is removed until every permission on the nav has been answered. Rendering the
 * unfiltered nav first and hiding items afterwards would put links to pages the visitor
 * cannot open into the accessibility tree and the tab order, and would visibly repopulate
 * the sidebar.
 *
 * The cost of that is an empty first paint on a nav that has any gated item. A host that
 * prerenders the shell should resolve permissions before it renders, rather than shipping
 * a nav that fills in after hydration.
 */
export function useAdminPermittedNav(groups: AdminNavGroup[]): {
  groups: AdminNavGroup[];
  /** True until every permission referenced by the nav has been answered. */
  pending: boolean;
} {
  const { check, adapter } = useAdminPermissions();

  // Keyed by content rather than by the nav array's identity. A host writing nav={[{...}]}
  // inline produces a new array every render, and depending on that would re-resolve on every
  // render, which in turn sets state and re-renders.
  const gatedKey = useMemo(
    () =>
      Array.from(
        new Set(
          groups
            .flatMap((group) => group.items)
            .map((item) => item.permission)
            .filter((permission): permission is AdminPermission => typeof permission === "string"),
        ),
      )
        .sort()
        .join("\u0000"),
    [groups],
  );
  const gated = useMemo(() => (gatedKey ? gatedKey.split("\u0000") : []), [gatedKey]);

  const results = useGatedPermissions(gated, check, adapter !== undefined);

  const permitted = useMemo(() => {
    const allowed = new Set<AdminPermission>();
    for (const permission of gated) {
      if (results.get(permission) === true) allowed.add(permission);
    }
    return allowed;
  }, [gated, results]);

  const pending = gated.some((permission) => !results.has(permission));

  const filtered = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !item.permission || permitted.has(item.permission)),
        }))
        .filter((group) => group.items.length > 0),
    [groups, permitted],
  );

  // A gated nav stays empty until it is answered, so a denied item is never briefly visible.
  return { groups: pending ? [] : filtered, pending };
}

/** Resolves a fixed set of permissions and reports which have answered. */
function useGatedPermissions(
  permissions: AdminPermission[],
  check: (permission: AdminPermission) => Promise<boolean>,
  enabled: boolean,
): Map<AdminPermission, boolean> {
  const [results, setResults] = useState<Map<AdminPermission, boolean>>(() => new Map());
  useEffect(() => {
    if (!enabled || permissions.length === 0) return;
    let active = true;
    void Promise.all(
      permissions.map((permission) => check(permission).then((allowed) => [permission, allowed] as const)),
    ).then((entries) => {
      if (active) setResults(new Map(entries));
    });
    return () => {
      active = false;
    };
  }, [check, enabled, permissions]);

  return results;
}
