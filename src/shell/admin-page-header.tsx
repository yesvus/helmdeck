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

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-10 flex min-h-[72px] items-center justify-between gap-4 border-b border-zinc-200 bg-zinc-50/95 px-4 py-3 backdrop-blur transition-[left] duration-200 sm:px-6 lg:left-[var(--admin-sidebar-current)] lg:px-8">
        <div className="min-w-0">
          <AdminBreadcrumbs groups={groups ?? shell?.nav} />
          <h1 className="truncate text-base font-semibold text-zinc-900">{title}</h1>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="h-[72px]" aria-hidden="true" />
    </>
  );
}
