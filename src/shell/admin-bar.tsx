// SPDX-License-Identifier: MIT
import { useAdminMessages } from "../i18n/provider.js";

export type AdminBarProps = {
  dashboardHref: string;
  draftStatus: "live" | "draft";
  editHref?: string;
};

export function AdminBar({ dashboardHref, draftStatus, editHref }: AdminBarProps) {
  const { adminBar } = useAdminMessages();
  const status = draftStatus === "draft" ? adminBar.draft : adminBar.live;

  return (
    <aside aria-label={adminBar.label} className="sticky top-0 z-50 border-b border-admin-border bg-admin-surface px-4 py-2 text-admin-foreground shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 text-sm">
        <span aria-live="polite" className="font-medium">{status}</span>
        <nav aria-label={adminBar.actions} className="flex items-center gap-4">
          {editHref ? <a className="underline-offset-4 hover:underline" href={editHref}>{adminBar.edit}</a> : null}
          <a className="font-semibold underline-offset-4 hover:underline" href={dashboardHref}>{adminBar.dashboard}</a>
        </nav>
      </div>
    </aside>
  );
}
