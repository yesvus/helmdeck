// SPDX-License-Identifier: MIT
"use client";

import { useRef } from "react";
import Link from "next/link.js";
import { ExternalLink, LogOut, MoreHorizontal, User } from "lucide-react";
import { cn } from "../cn.js";
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

  const session = shell?.session ?? null;
  const profileHref = shell?.profileHref;
  const viewSiteHref = shell?.viewSiteHref;
  const onLogout = shell?.onLogout;
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const closeSheet = () => detailsRef.current?.removeAttribute("open");

  if (primaryItems.length === 0) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-admin-surface/95 backdrop-blur-lg lg:hidden">
      <div className="mx-auto flex max-w-xl items-stretch">
        {primaryItems.map((item) => (
          <AdminNavLink key={item.href} item={item} compact />
        ))}
        {secondaryGroups.length > 0 || session !== null ? (
          <details ref={detailsRef} className="group relative flex min-w-0 flex-1">
            <summary className="flex min-w-0 flex-1 cursor-pointer list-none flex-col items-center justify-center gap-1 px-2 py-3 text-center text-[11px] font-semibold text-zinc-500 transition-colors hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
              <MoreHorizontal className="h-5 w-5" />
              <span>{labels.mobileMore}</span>
            </summary>
            <div className="fixed inset-x-3 bottom-[76px] max-h-[70dvh] overflow-y-auto rounded-2xl border border-zinc-200 bg-admin-surface p-3 shadow-2xl">
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
              {session !== null ? (
                <section className={cn(secondaryGroups.length > 0 && "mt-4 border-t border-zinc-100 pt-3")}>
                  <div className="grid grid-cols-2 gap-1">
                    {profileHref ? (
                      <Link
                        href={profileHref}
                        onClick={closeSheet}
                        className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                      >
                        <User className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{labels.profile}</span>
                      </Link>
                    ) : null}
                    {viewSiteHref ? (
                      <Link
                        href={viewSiteHref}
                        onClick={closeSheet}
                        className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                      >
                        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{labels.viewSite}</span>
                      </Link>
                    ) : null}
                  </div>
                  {onLogout ? (
                    <button
                      type="button"
                      onClick={() => {
                        closeSheet();
                        void onLogout();
                      }}
                      className="mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {labels.signOut}
                    </button>
                  ) : null}
                </section>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
