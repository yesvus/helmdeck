// SPDX-License-Identifier: MIT
"use client";

import type { ReactNode } from "react";
import type { AdminNavGroup } from "../adapters/index.js";
import { AdminBreadcrumbs } from "./admin-breadcrumbs.js";
import { useAdminShell } from "./context.js";

export function AdminPageHeader({
  action,
  compact = false,
  groups,
  title,
}: {
  action?: ReactNode;
  /** Render only the action row, with no header bar, title or breadcrumbs. */
  compact?: boolean;
  groups?: AdminNavGroup[];
  title: string;
}) {
  const shell = useAdminShell();

  if (compact) {
    return action ? <div className="flex items-center justify-end gap-2">{action}</div> : null;
  }

  if (shell?.currentPageTitle) {
    return action ? <div className="flex items-center justify-end gap-2">{action}</div> : null;
  }

  return (
    <>
      <div className="flex min-h-[var(--admin-header-height)] items-center justify-between gap-4 border-b border-zinc-200 bg-admin-surface-subtle px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <AdminBreadcrumbs groups={groups ?? shell?.nav} />
          <h1 className="truncate text-base font-semibold text-zinc-900">{title}</h1>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </>
  );
}
