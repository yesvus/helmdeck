// SPDX-License-Identifier: MIT
"use client";

import type { ReactNode } from "react";
import { KeyRound, LogOut, Settings, User } from "lucide-react";
import { Button } from "../primitives/button.js";
import { AdminSectionCard } from "../primitives/layout.js";
import { AdminPageHeader } from "./admin-page-header.js";
import { useAdminShell } from "./context.js";
import { mergeAdminLabels } from "./labels.js";
import type { AdminShellLabels } from "./labels.js";
import { useAdminMessages } from "../i18n.js";
import type { AdminSession } from "../adapters/index.js";

/** One signed-in session, as far as the profile page needs to describe it. */
export type AdminSessionSummary = {
  id: string;
  /** What the host calls this session, usually the browser or device. */
  label?: string;
  startedAt: string | number | Date;
  lastUsedAt?: string | number | Date;
  /** The session making this request. Marked so a visitor can tell it from the others. */
  current?: boolean;
};

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Absolute, localized, and with no clock read, so a server render and the hydration that
 * follows it cannot disagree about the text. A host that wants "2 hours ago" passes
 * `formatSessionAge` and takes on the hydration question itself.
 */
function defaultSessionAge(value: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(value);
  } catch {
    // An unrecognised locale must not take the page down with it.
    return value.toISOString();
  }
}

export function AdminProfilePage({
  session,
  sessions,
  settingsHref,
  onSignOut,
  onSignOutEverywhere,
  signOutEverywhereBusy = false,
  formatSessionAge,
  children,
  labels,
}: {
  session: AdminSession;
  sessions?: AdminSessionSummary[];
  settingsHref?: string;
  onSignOut?: () => void | Promise<void>;
  /** Omitted when the host cannot revoke other sessions, and the control is then not rendered. */
  onSignOutEverywhere?: () => void | Promise<void>;
  signOutEverywhereBusy?: boolean;
  formatSessionAge?: (startedAt: Date) => string;
  children?: ReactNode;
  labels?: Partial<AdminShellLabels>;
}) {
  const shell = useAdminShell();
  const i18n = useAdminMessages();
  const mergedLabels = mergeAdminLabels({ ...i18n.shell, ...shell?.labels, ...labels });
  const formatAge = formatSessionAge ?? ((value: Date) => defaultSessionAge(value, i18n.locale));
  const resolvedSettingsHref = settingsHref;
  const others = sessions?.filter((entry) => !entry.current) ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={mergedLabels.profile}
        action={
          onSignOut ? (
            <Button type="button" variant="outline" onClick={() => void onSignOut()}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {mergedLabels.signOut}
            </Button>
          ) : null
        }
      />

      <AdminSectionCard icon={User} title={mergedLabels.profileIdentity} description={session.email}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-zinc-600 dark:text-zinc-400">{mergedLabels.profileName}</dt>
            <dd className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {session.name ?? session.email}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-600 dark:text-zinc-400">{mergedLabels.profileEmail}</dt>
            <dd className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {session.email}
            </dd>
          </div>
          {session.role ? (
            <div>
              <dt className="text-sm text-zinc-600 dark:text-zinc-400">{mergedLabels.profileRole}</dt>
              <dd className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">{session.role}</dd>
            </div>
          ) : null}
        </dl>
        {children}
      </AdminSectionCard>

      {sessions ? (
        <AdminSectionCard
          icon={KeyRound}
          title={mergedLabels.profileSessions}
          description={mergedLabels.profileSessionsDescription}
          action={
            onSignOutEverywhere ? (
              <Button
                type="button"
                variant="outline"
                disabled={signOutEverywhereBusy}
                aria-busy={signOutEverywhereBusy || undefined}
                onClick={() => void onSignOutEverywhere()}
              >
                {mergedLabels.signOutEverywhere}
              </Button>
            ) : null
          }
        >
          {others.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{mergedLabels.profileNoOtherSessions}</p>
          ) : (
            <ul className="divide-y divide-admin-border">
              {others.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {entry.label ?? entry.id}
                  </span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {mergedLabels.profileSessionStarted}: {formatAge(toDate(entry.startedAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminSectionCard>
      ) : null}

      {resolvedSettingsHref ? (
        <AdminSectionCard icon={Settings} title={mergedLabels.settings} description={mergedLabels.settingsDescription}>
          <a
            href={resolvedSettingsHref}
            className="text-sm font-medium text-admin-brand-text underline underline-offset-4 hover:underline"
          >
            {mergedLabels.settingsOpen}
          </a>
        </AdminSectionCard>
      ) : null}
    </div>
  );
}
