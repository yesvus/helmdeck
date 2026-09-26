// SPDX-License-Identifier: MIT
"use client";

import type { ReactNode } from "react";
import Link from "next/link.js";
import { KeyRound, LogOut, Settings, User } from "lucide-react";
import { Button } from "../primitives/button.js";
import { AdminSectionCard } from "../primitives/layout.js";
import { AdminPageHeader } from "./admin-page-header.js";
import { useAdminShell } from "./context.js";
import { mergeAdminLabels } from "./labels.js";
import type { AdminShellLabels } from "./labels.js";
import { useAdminHref, useAdminMessages } from "../i18n.js";
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

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  // An unparseable value yields an Invalid Date, and both Intl formatting and toISOString
  // throw on one, so it is rejected here rather than at the point of rendering.
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Absolute, localized, and pinned to UTC by default. The timezone matters as much as the
 * clock: the same instant formats as 9:30, 12:30 or 1:30 depending on the runtime, so a
 * server render and the browser hydration after it would otherwise disagree. UTC is the only
 * default that cannot. A host with a real timezone for the viewer passes `timeZone`, and one
 * wanting "2 hours ago" passes `formatSessionAge`.
 */
function defaultSessionAge(value: Date, locale: string, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(value);
  } catch {
    // An unrecognised locale or timezone must not take the page down with it.
    return null;
  }
}

export function AdminProfilePage({
  session,
  sessions,
  settingsHref,
  onSignOut,
  onSignOutEverywhere,
  signOutEverywhereBusy = false,
  timeZone = "UTC",
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
  /** IANA zone for the default age format. UTC keeps a server render and hydration identical. */
  timeZone?: string;
  formatSessionAge?: (startedAt: Date) => string | null;
  children?: ReactNode;
  labels?: Partial<AdminShellLabels>;
}) {
  const shell = useAdminShell();
  const i18n = useAdminMessages();
  const toHref = useAdminHref();
  const mergedLabels = mergeAdminLabels({ ...i18n.shell, ...shell?.labels, ...labels });
  const formatAge = formatSessionAge ?? ((value: Date) => defaultSessionAge(value, i18n.locale, timeZone));
  // Resolved through the host's href mapping, so a locale-enabled host keeps the content
  // locale on the link rather than dropping it.
  const resolvedSettingsHref = settingsHref ? toHref(settingsHref) : undefined;
  const others = sessions?.filter((entry) => !entry.current) ?? [];

  function ageLabel(entry: AdminSessionSummary): ReactNode {
    const date = toDate(entry.startedAt);
    const formatted = date ? formatAge(date) : null;
    return formatted ? `${mergedLabels.profileSessionStarted}: ${formatted}` : null;
  }

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
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">{ageLabel(entry)}</span>
                </li>
              ))}
            </ul>
          )}
        </AdminSectionCard>
      ) : null}

      {resolvedSettingsHref ? (
        <AdminSectionCard icon={Settings} title={mergedLabels.settings} description={mergedLabels.settingsDescription}>
          <Link
            href={resolvedSettingsHref}
            className="text-sm font-medium text-admin-brand-text underline underline-offset-4 hover:underline"
          >
            {mergedLabels.settingsOpen}
          </Link>
        </AdminSectionCard>
      ) : null}
    </div>
  );
}
