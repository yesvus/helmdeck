// SPDX-License-Identifier: MIT
"use client";

import { MoreHorizontal } from "lucide-react";
import type { AdminNavGroup } from "../adapters/index.js";
import { AdminNavLink } from "./admin-nav.js";
import { useAdminShell } from "./context.js";
import { mergeAdminLabels } from "./labels.js";

export function AdminMobileNav({ groups }: { groups?: AdminNavGroup[] }) {
  const shell = useAdminShell();
  const labels = mergeAdminLabels(shell?.labels);
  const nav = groups ?? shell?.nav ?? [];
  const items = nav.flatMap((group) => group.items);
  const primaryItems = items.filter((item) => item.mobilePrimary);
  const secondaryGroups = nav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.mobilePrimary),
    }))
    .filter((group) => group.items.length > 0);

  if (primaryItems.length === 0) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur-lg lg:hidden">
      <div className="mx-auto flex max-w-xl items-stretch">
        {primaryItems.map((item) => (
          <AdminNavLink key={item.href} item={item} compact />
        ))}
        {secondaryGroups.length > 0 ? (
          <details className="group relative flex min-w-0 flex-1">
            <summary className="flex min-w-0 flex-1 cursor-pointer list-none flex-col items-center justify-center gap-1 px-2 py-3 text-center text-[11px] font-semibold text-zinc-500 transition-colors hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
              <MoreHorizontal className="h-5 w-5" />
              <span>{labels.mobileMore}</span>
            </summary>
            <div className="fixed inset-x-3 bottom-[76px] max-h-[70dvh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-2xl">
              {secondaryGroups.map((group) => (
                <section key={group.label} className="not-last:mb-4">
                  <h2 className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
                    {group.label}
                  </h2>
                  <div className="grid grid-cols-2 gap-1">
                    {group.items.map((item) => (
                      <AdminNavLink key={item.href} item={item} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </details>
        ) : null}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
