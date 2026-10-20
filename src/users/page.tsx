// SPDX-License-Identifier: MIT
"use client";

import { useMemo, useState } from "react";
import { Activity, Clock3, Users, UserRound } from "lucide-react";
import type { AdminAuditEvent } from "../adapters/index.js";
import type { AccountRecord } from "../baseline/credentials.js";
import type { AccountSession } from "../baseline/users.js";
import { useAdminMessages } from "../i18n.js";
import { AdminActivityTimeline } from "../activity/timeline.js";
import { Button } from "../primitives/button.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminField } from "../primitives/field.js";
import { AdminSelect } from "../primitives/select.js";
import { AdminSectionCard } from "../primitives/layout.js";
import { AdminStatusPill } from "../primitives/status-pill.js";
import { defaultAdminUserManagementMessages } from "./messages.js";

export type AdminUserManagementRecord = AccountRecord & {
  lastActivityAt?: string | null;
  recentActivity?: readonly AdminAuditEvent[];
  sessions?: readonly AccountSession[];
};

export type AdminUserManagementPageProps = {
  users: readonly AdminUserManagementRecord[];
  roles: readonly string[];
  onSetRole?: (accountId: string, role: string) => Promise<void>;
  onSetDisabled?: (accountId: string, disabled: boolean) => Promise<void>;
  onResetPassword?: (accountId: string) => Promise<void>;
  onEndSession?: (sessionId: string) => Promise<void>;
  onUpdated?: () => void;
  title?: string;
  description?: string;
};

function dateLabel(value: string | null | undefined, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AdminUserManagementPage({
  users,
  roles,
  onSetRole,
  onSetDisabled,
  onResetPassword,
  onEndSession,
  onUpdated,
  title,
  description,
}: AdminUserManagementPageProps) {
  const adminMessages = useAdminMessages();
  const messages = { ...defaultAdminUserManagementMessages, ...adminMessages.users };
  const locale = adminMessages.searchLocale;
  const [selectedId, setSelectedId] = useState(users[0]?.id ?? "");
  const [roleDraft, setRoleDraft] = useState<{ accountId: string; value: string } | null>(null);
  const [confirmDisableId, setConfirmDisableId] = useState("");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const selected = users.find((user) => user.id === selectedId) ?? users[0];
  const activeSessions = useMemo(() => selected?.sessions ?? [], [selected]);
  const roleValue = selected && roleDraft?.accountId === selected.id ? roleDraft.value : selected?.role ?? "";

  async function run(key: string, operation: () => Promise<void>, success: string) {
    setBusy(key);
    setFeedback("");
    try {
      await operation();
      setFeedback(success);
      onUpdated?.();
    } catch {
      setFeedback(messages.operationFailed);
    } finally {
      setBusy("");
    }
  }

  if (!selected) {
    return <AdminEmptyState title={messages.noAccounts} body={messages.description} />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-950">{title ?? messages.title}</h1>
        <p className="mt-1 text-sm text-zinc-600">{description ?? messages.description}</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.5fr)]">
        <AdminSectionCard icon={Users} title={messages.accounts} description={messages.accountCount(users.length)}>
          <ul className="divide-y divide-admin-border">
            {users.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  aria-current={user.id === selected.id ? "true" : undefined}
                  className="flex w-full items-start justify-between gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  onClick={() => {
                    setSelectedId(user.id);
                    setRoleDraft({ accountId: user.id, value: user.role ?? "" });
                    setConfirmDisableId("");
                    setFeedback("");
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-900">{user.name || user.email}</span>
                    {user.name ? <span className="block truncate text-xs text-zinc-500">{user.email}</span> : null}
                  </span>
                  <AdminStatusPill tone={user.disabled ? "neutral" : "success"} label={user.disabled ? messages.disabled : messages.active} />
                </button>
              </li>
            ))}
          </ul>
        </AdminSectionCard>

        <div className="space-y-6">
          <AdminSectionCard icon={UserRound} title={selected.name || selected.email} description={selected.email}>
            <div className="grid gap-4 sm:grid-cols-2">
              <p className="text-sm"><span className="font-medium">{messages.created}:</span> {dateLabel(selected.createdAt, locale, messages.noActivity)}</p>
              <p className="text-sm"><span className="font-medium">{messages.lastActivity}:</span> {dateLabel(selected.lastActivityAt, locale, messages.noActivity)}</p>
              <p className="text-sm"><span className="font-medium">{messages.status}:</span> {selected.disabled ? messages.disabled : messages.active}</p>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              {onSetRole ? (
                <AdminField label={messages.role}>
                  <AdminSelect value={roleValue} onChange={(event) => setRoleDraft({ accountId: selected.id, value: event.currentTarget.value })}>
                    <option value="">{messages.noRole}</option>
                    {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                  </AdminSelect>
                </AdminField>
              ) : <p className="text-sm"><span className="font-medium">{messages.role}:</span> {selected.role || messages.noRole}</p>}
              {onSetRole ? (
                <Button
                  size="sm"
                  disabled={busy !== "" || roleValue === (selected.role ?? "")}
                  onClick={() => void run("role", () => onSetRole(selected.id, roleValue), messages.saved)}
                >{messages.saveRole}</Button>
              ) : null}
              {onSetDisabled && !selected.disabled ? (
                <Button size="sm" variant="destructive" onClick={() => setConfirmDisableId(selected.id)}>{messages.disable}</Button>
              ) : null}
              {onSetDisabled && selected.disabled ? (
                <Button size="sm" variant="outline" disabled={busy !== ""} onClick={() => void run("enable", () => onSetDisabled(selected.id, false), messages.saved)}>{messages.enable}</Button>
              ) : null}
              {onResetPassword ? (
                <Button size="sm" variant="outline" disabled={busy !== ""} onClick={() => void run("reset", () => onResetPassword(selected.id), messages.resetRequested)}>{messages.resetPassword}</Button>
              ) : null}
            </div>
            {confirmDisableId === selected.id ? (
              <div className="mt-4 rounded-lg border border-admin-border bg-admin-surface-subtle p-4" role="group" aria-label={messages.confirmDisable}>
                <p className="text-sm">{messages.confirmDisableBody}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="destructive" disabled={busy !== ""} onClick={() => void run("disable", async () => {
                    if (onSetDisabled) await onSetDisabled(selected.id, true);
                    setConfirmDisableId("");
                  }, messages.saved)}>{messages.confirmDisable}</Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDisableId("")}>{messages.cancel}</Button>
                </div>
              </div>
            ) : null}
            {feedback ? <p className="mt-4 text-sm text-zinc-700" role="status">{feedback}</p> : null}
          </AdminSectionCard>

          <AdminSectionCard icon={Clock3} title={messages.sessions}>
            {activeSessions.length ? (
              <ul className="divide-y divide-admin-border">
                {activeSessions.map((session) => (
                  <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <p className="text-sm">{session.current ? messages.currentSession : session.id} · {messages.expires}: {dateLabel(Number.isFinite(session.expiresAt) ? new Date(session.expiresAt * 1000).toISOString() : undefined, locale, messages.noActivity)}</p>
                    {onEndSession && !session.current ? (
                      <Button size="sm" variant="outline" disabled={busy !== ""} onClick={() => void run(`session:${session.id}`, () => onEndSession(session.id), messages.sessionEnded)}>{messages.endSession}</Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-zinc-600">{messages.noSessions}</p>}
          </AdminSectionCard>

          <AdminSectionCard icon={Activity} title={messages.recentActivity}>
            {selected.recentActivity?.length ? (
              <AdminActivityTimeline events={selected.recentActivity} cap={5} />
            ) : <p className="text-sm text-zinc-600">{messages.noRecentActivity}</p>}
          </AdminSectionCard>
        </div>
      </div>
    </div>
  );
}
