// SPDX-License-Identifier: MIT
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AdminPermission, AdminPermissionsAdapter } from "../adapters/index.js";
import { useAdminMessages } from "../i18n.js";
import { cn } from "../cn.js";

/**
 * Where one permission currently stands. `checking` is the first value so a guard denies
 * rather than flashing the protected content and hiding it again.
 */
export type AdminPermissionState = "checking" | "allowed" | "denied" | "error";

export type AdminPermissionContextValue = {
  /** The adapter, or undefined when the host wired none. */
  adapter?: AdminPermissionsAdapter;
  /**
   * Fail closed. A guard with no adapter to ask is denied, because a missing adapter must
   * never read as permission granted. The cost is that `AdminCan` used without a provider
   * hides everything, which is why that case also warns in development.
   */
  check: (permission: AdminPermission, context?: { resourceId?: string }) => Promise<boolean>;
};

const AdminPermissionsContext = createContext<AdminPermissionContextValue | null>(null);

/** Warns once per mount that a fail-closed decision was made for lack of an adapter. */
export function warnNoAdapter(): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(DENIED_WITHOUT_ADAPTER);
  }
}

const DENIED_WITHOUT_ADAPTER =
  "AdminCan was used without an AdminPermissionsProvider. Denying, because a missing adapter " +
  "must not read as permission granted. Wrap the tree in AdminPermissionsProvider, or drop the guard.";

function cacheKey(permission: AdminPermission, resourceId?: string): string {
  return `${permission}\u0000${resourceId ?? ""}`;
}

/**
 * Resolves permissions and remembers the answers. Several guards and nav items asking the
 * same question in one render share a single adapter call, and a resolved answer is not
 * re-asked on later renders.
 */
export function AdminPermissionsProvider({
  adapter,
  children,
}: {
  adapter?: AdminPermissionsAdapter;
  children: ReactNode;
}) {
  // Bumped when the adapter changes, so answers resolved through the previous one are neither
  // returned nor retained.
  const [version, setVersion] = useState(0);
  const cache = useRef(new Map<string, Promise<boolean>>());
  const cachedVersion = useRef(version);
  const [bound, setBound] = useState(adapter);
  // Swapping the adapter invalidates every answer resolved through the previous one. This is
  // a prop change, so the version moves in render rather than in a post-paint effect write.
  if (bound !== adapter) {
    setBound(adapter);
    setVersion((current) => current + 1);
  }

  const check = useCallback(
    (permission: AdminPermission, context?: { resourceId?: string }) => {
      if (!adapter) {
        return Promise.resolve(false);
      }
      // Refs are only touched here, inside a callback, never during render.
      if (cachedVersion.current !== version) {
        cache.current = new Map();
        cachedVersion.current = version;
      }
      const key = cacheKey(permission, context?.resourceId);
      const cached = cache.current.get(key);
      if (cached) return cached;
      // The promise is cached rather than its result, so two guards mounting in the same
      // render produce one call instead of two, and a rejection is not cached as a denial
      // that then hides a later retry.
      const pending = adapter.can(permission, context).catch(() => false);
      cache.current.set(key, pending);
      return pending;
    },
    [adapter, version],
  );

  const value = useMemo<AdminPermissionContextValue>(() => ({ adapter, check }), [adapter, check]);

  return <AdminPermissionsContext.Provider value={value}>{children}</AdminPermissionsContext.Provider>;
}

// A module constant, not an inline fallback. Building it per render gave `check` a new
// identity every time, and the resolve effect depends on `check`, so a provider-less guard
// re-ran it forever: set state, re-render, new `check`, re-run.
const NO_ADAPTER: AdminPermissionContextValue = {
  adapter: undefined,
  check: () => Promise.resolve(false),
};

export function useAdminPermissions(): AdminPermissionContextValue {
  // Absent a provider this returns the fail-closed check, so a guard used on its own denies
  // rather than throwing in a render path and taking the page down with it.
  return useContext(AdminPermissionsContext) ?? NO_ADAPTER;
}

/**
 * The state of one permission. The answer for a different permission is not shown while the
 * new one resolves, so switching permissions cannot briefly display the previous verdict.
 */
export function useAdminPermission(
  permission: AdminPermission,
  context?: { resourceId?: string },
): AdminPermissionState {
  const { check, adapter } = useAdminPermissions();
  const [record, setRecord] = useState<{ key: string; state: AdminPermissionState } | null>(null);
  // A caller writes `{ resourceId }` inline, so the object is a new value every render.
  // Depending on it re-ran this effect on every render, and the effect sets state, so the
  // render never settled. The primitives are what the cache is keyed on anyway.
  const resourceId = context?.resourceId;
  const key = cacheKey(permission, resourceId);

  const state = record?.key === key ? record.state : "checking";

  useEffect(() => {
    if (!adapter) warnNoAdapter();
    let active = true;
    const scope = resourceId === undefined ? undefined : { resourceId };
    void check(permission, scope).then(
      (allowed) => {
        if (active) setRecord({ key, state: allowed ? "allowed" : "denied" });
      },
      () => {
        // Only reachable if a host's adapter rejects past its own catch. Denied, not allowed.
        if (active) setRecord({ key, state: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [adapter, check, key, permission, resourceId]);

  return state;
}

/** Whether one permission is currently held. `false` while it is still being resolved. */
export function useAdminCan(permission: AdminPermission, context?: { resourceId?: string }): boolean {
  return useAdminPermission(permission, context) === "allowed";
}

/**
 * Renders its children only when the permission is held. While the permission is being
 * resolved, and when it is refused, the children are not rendered at all: rendering them and
 * hiding them would leave focusable controls and readable text in the accessibility tree for
 * content the visitor is not allowed to have.
 *
 * `fallback` replaces the children when the permission is refused. It is for explaining the
 * refusal, not for offering the denied action in a disabled state.
 */
export function AdminCan({
  permission,
  resourceId,
  children,
  fallback,
  labels,
  className,
}: {
  permission: AdminPermission;
  resourceId?: string;
  children: ReactNode;
  fallback?: ReactNode;
  labels?: { permissionDenied?: string };
  className?: string;
}) {
  const state = useAdminPermission(permission, resourceId === undefined ? undefined : { resourceId });
  const i18n = useAdminMessages();

  if (state === "allowed") return <>{children}</>;
  if (state === "denied" || state === "error") {
    return (
      <>
        {fallback ?? (
          <p role="status" className={cn("text-sm text-zinc-600 dark:text-zinc-400", className)}>
            {labels?.permissionDenied ?? i18n.shell.permissionDenied}
          </p>
        )}
      </>
    );
  }
  return null;
}
