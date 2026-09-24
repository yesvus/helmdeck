// SPDX-License-Identifier: MIT
"use client";

import type { ReactNode } from "react";
import type { AdminNavGroup } from "../adapters/index.js";
import { AdminBreadcrumbs } from "./admin-breadcrumbs.js";
import { useAdminShell } from "./context.js";

export function AdminPageHeader({
  action,
  groups,
  title,
}: {
  action?: ReactNode;
  groups?: AdminNavGroup[];
  title: string;
}) {
  const shell = useAdminShell();

  if (shell?.currentPageTitle) {
    return action ? <div className="flex justify-end">{action}</div> : null;
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
