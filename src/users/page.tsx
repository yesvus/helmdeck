// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
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

type UserManagementLocalState = {
  sourceUsers: readonly AdminUserManagementRecord[];
  updates: Record<string, Partial<AdminUserManagementRecord>>;
  roleDraft: { accountId: string; value: string; baseRole: string } | null;
};

function dateLabel(value: string | null | undefined, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date);
}

function sessionExpiry(expiresAt: number): string | undefined {
  if (!Number.isFinite(expiresAt)) return undefined;
  const date = new Date(expiresAt * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
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
  const [confirmDisableId, setConfirmDisableId] = useState("");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [localState, setLocalState] = useState<UserManagementLocalState>({ sourceUsers: users, updates: {}, roleDraft: null });
  const currentState = localState.sourceUsers === users
    ? localState
    : { sourceUsers: users, updates: {}, roleDraft: null };
  const displayedUsers = users.map((user) => ({ ...user, ...currentState.updates[user.id] }));
  const selected = displayedUsers.find((user) => user.id === selectedId) ?? displayedUsers[0];
  const activeSessions = selected?.sessions ?? [];
  const roleValue = selected && currentState.roleDraft?.accountId === selected.id && currentState.roleDraft.baseRole === (selected.role ?? "")
    ? currentState.roleDraft.value
    : selected?.role ?? "";

  function updateLocalState(update: (current: UserManagementLocalState) => UserManagementLocalState) {
    setLocalState((current) => update(current.sourceUsers === users
      ? current
      : { sourceUsers: users, updates: {}, roleDraft: null }));
  }

  async function run(key: string, operation: () => Promise<void>, success: string, onSuccess?: () => void) {
    setBusy(key);
    setFeedback("");
    try {
      await operation();
      onSuccess?.();
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
            {displayedUsers.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  aria-current={user.id === selected.id ? "true" : undefined}
                  className="flex w-full items-start justify-between gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  disabled={busy !== ""}
                  onClick={() => {
                    setSelectedId(user.id);
                    updateLocalState((current) => ({ ...current, roleDraft: { accountId: user.id, value: user.role ?? "", baseRole: user.role ?? "" } }));
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
              <p className="text-sm"><span className="font-medium">{messages.created}:</span> {dateLabel(selected.createdAt, locale, messages.notRecorded)}</p>
              <p className="text-sm"><span className="font-medium">{messages.lastActivity}:</span> {dateLabel(selected.lastActivityAt, locale, messages.noActivity)}</p>
              <p className="text-sm"><span className="font-medium">{messages.status}:</span> {selected.disabled ? messages.disabled : messages.active}</p>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              {onSetRole ? (
                <AdminField label={messages.role}>
                  <AdminSelect disabled={busy !== ""} value={roleValue} onChange={(event) => updateLocalState((current) => ({ ...current, roleDraft: { accountId: selected.id, value: event.currentTarget.value, baseRole: selected.role ?? "" } }))}>
                    <option value="">{messages.noRole}</option>
                    {[...new Set(selected.role ? [selected.role, ...roles] : roles)].map((role) => <option key={role} value={role}>{role}</option>)}
                  </AdminSelect>
                </AdminField>
              ) : <p className="text-sm"><span className="font-medium">{messages.role}:</span> {selected.role || messages.noRole}</p>}
              {onSetRole ? (
                <Button
                  size="sm"
                  disabled={busy !== "" || roleValue === (selected.role ?? "")}
                  onClick={() => void run("role", () => onSetRole(selected.id, roleValue), messages.saved, () => {
                    updateLocalState((current) => ({
                      ...current,
                      updates: { ...current.updates, [selected.id]: { ...current.updates[selected.id], role: roleValue } },
                      roleDraft: { accountId: selected.id, value: roleValue, baseRole: roleValue },
                    }));
                  })}
                >{messages.saveRole}</Button>
              ) : null}
              {onSetDisabled && !selected.disabled ? (
                <Button size="sm" variant="destructive" disabled={busy !== ""} onClick={() => setConfirmDisableId(selected.id)}>{messages.disable}</Button>
              ) : null}
              {onSetDisabled && selected.disabled ? (
                <Button size="sm" variant="outline" disabled={busy !== ""} onClick={() => void run("enable", () => onSetDisabled(selected.id, false), messages.saved, () => updateLocalState((current) => ({ ...current, updates: { ...current.updates, [selected.id]: { ...current.updates[selected.id], disabled: false } } })))}>{messages.enable}</Button>
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
                  }, messages.saved, () => updateLocalState((current) => ({ ...current, updates: { ...current.updates, [selected.id]: { ...current.updates[selected.id], disabled: true, sessions: [] } } })))}>{messages.confirmDisable}</Button>
                  <Button size="sm" variant="outline" disabled={busy !== ""} onClick={() => setConfirmDisableId("")}>{messages.cancel}</Button>
                </div>
              </div>
            ) : null}
            <p className="mt-4 min-h-5 text-sm text-zinc-700" role="status" aria-live="polite">{feedback}</p>
          </AdminSectionCard>

          <AdminSectionCard icon={Clock3} title={messages.sessions}>
            {activeSessions.length ? (
              <ul className="divide-y divide-admin-border">
                {activeSessions.map((session) => (
                  <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <p className="text-sm">{session.current ? messages.currentSession : session.id} · {messages.expires}: {dateLabel(sessionExpiry(session.expiresAt), locale, messages.notRecorded)}</p>
                    {onEndSession && !session.current ? (
                      <Button size="sm" variant="outline" disabled={busy !== ""} onClick={() => void run(`session:${session.id}`, () => onEndSession(session.id), messages.sessionEnded, () => updateLocalState((current) => ({ ...current, updates: { ...current.updates, [selected.id]: { ...current.updates[selected.id], sessions: activeSessions.filter((item) => item.id !== session.id) } } })))}>{messages.endSession}</Button>
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
