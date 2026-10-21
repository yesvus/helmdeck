// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import { Button } from "../primitives/button.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminPagination } from "../primitives/pagination.js";
import { AdminStatusPill } from "../primitives/status-pill.js";
import { AdminLoadingState, AdminSkeleton } from "../primitives/skeleton.js";
import { useAdminMessages } from "../i18n.js";
import { defaultAdminInboxMessages } from "./messages.js";
import type { AdminInboxMessages } from "./messages.js";

export type AdminInboxStatus = "unread" | "read" | "archived";

export type AdminInboxItem = {
  id: string;
  sender: string;
  subject: string;
  preview: string;
  receivedAt: string | Date;
  status: AdminInboxStatus;
};

export type AdminInboxMessageData = AdminInboxItem & { body: string };

function statusCopy(status: AdminInboxStatus, labels: AdminInboxMessages): string {
  return labels[status];
}

function statusTone(status: AdminInboxStatus): "neutral" | "info" | "success" {
  if (status === "unread") return "info";
  if (status === "read") return "success";
  return "neutral";
}

function receivedLabel(value: string | Date, locale: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function InboxCardSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-3 rounded-xl border border-admin-border bg-admin-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="space-y-2">
        <AdminSkeleton className="h-4 w-36" />
        <AdminSkeleton className="h-4 w-56 max-w-full" />
        <AdminSkeleton className="h-3 w-48 max-w-full" />
      </div>
      <AdminSkeleton className="h-8 w-28" />
    </div>
  );
}

export function AdminInboxList<T extends AdminInboxItem>({
  messages,
  loading = false,
  page,
  pageCount,
  onPageChange,
  onOpen,
  onMarkRead,
  onArchive,
  labels,
  className,
}: {
  messages: readonly T[];
  loading?: boolean;
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  onOpen?: (message: T) => void;
  onMarkRead?: (message: T) => void | Promise<void>;
  onArchive?: (message: T) => void | Promise<void>;
  labels?: Partial<AdminInboxMessages>;
  className?: string;
}) {
  const i18n = useAdminMessages();
  const copy = { ...defaultAdminInboxMessages, ...i18n.inbox, ...labels };
  const [failedMessageId, setFailedMessageId] = useState<string | null>(null);
  const pagination = page !== undefined && pageCount !== undefined && onPageChange !== undefined
    ? <AdminPagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
    : null;

  if (loading) {
    return (
      <AdminLoadingState label={copy.loading} className={className}>
        <div className="grid gap-3">
          {Array.from({ length: 4 }, (_, index) => <InboxCardSkeleton key={index} />)}
        </div>
        {pagination}
      </AdminLoadingState>
    );
  }

  return (
    <section className={className} aria-label={copy.message}>
      {messages.length === 0 ? (
        <AdminEmptyState title={copy.emptyTitle} body={copy.emptyBody} />
      ) : (
        <ul className="grid gap-3">
          {messages.map((message) => (
            <li key={message.id} className="grid gap-3 rounded-xl border border-admin-border bg-admin-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {onOpen ? (
                    <button type="button" onClick={() => onOpen(message)} className="truncate text-left font-semibold text-admin-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                      {message.subject}
                    </button>
                  ) : (
                    <h2 className="truncate font-semibold text-admin-foreground">{message.subject}</h2>
                  )}
                  <AdminStatusPill tone={statusTone(message.status)} label={copy[message.status]} />
                </div>
                <p className="mt-1 text-sm text-admin-muted">{message.sender} · {receivedLabel(message.receivedAt, i18n.searchLocale)}</p>
                <p className="mt-2 line-clamp-2 text-sm text-admin-foreground">{message.preview}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {message.status === "unread" && onMarkRead ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    setFailedMessageId(null);
                    void Promise.resolve().then(() => onMarkRead(message)).catch(() => setFailedMessageId(message.id));
                  }}>{copy.markRead}</Button>
                ) : null}
                {message.status !== "archived" && onArchive ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    setFailedMessageId(null);
                    void Promise.resolve().then(() => onArchive(message)).catch(() => setFailedMessageId(message.id));
                  }}>{copy.archive}</Button>
                ) : null}
              </div>
              {failedMessageId === message.id ? <p role="alert" className="text-sm text-admin-danger-text">{copy.actionFailed}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {pagination ? <div className="mt-5">{pagination}</div> : null}
    </section>
  );
}

export function AdminInboxMessage({
  message,
  onMarkRead,
  onArchive,
  labels,
  className,
}: {
  message: AdminInboxMessageData;
  onMarkRead?: (message: AdminInboxMessageData) => void | Promise<void>;
  onArchive?: (message: AdminInboxMessageData) => void | Promise<void>;
  labels?: Partial<AdminInboxMessages>;
  className?: string;
}) {
  const i18n = useAdminMessages();
  const copy = { ...defaultAdminInboxMessages, ...i18n.inbox, ...labels };
  const [actionFailed, setActionFailed] = useState(false);

  function runAction(action: ((message: AdminInboxMessageData) => void | Promise<void>) | undefined) {
    if (!action) return;
    setActionFailed(false);
    void Promise.resolve().then(() => action(message)).catch(() => setActionFailed(true));
  }

  return (
    <article className={className ?? "rounded-xl border border-admin-border bg-admin-surface p-5 sm:p-7"}>
      <header className="border-b border-admin-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-admin-foreground">{message.subject}</h1>
          <AdminStatusPill tone={statusTone(message.status)} label={statusCopy(message.status, copy)} />
        </div>
        <p className="mt-2 text-sm text-admin-muted">{copy.sender}: {message.sender}</p>
        <p className="mt-1 text-sm text-admin-muted">{copy.received}: {receivedLabel(message.receivedAt, i18n.searchLocale)}</p>
      </header>
      <p className="whitespace-pre-wrap py-6 text-sm leading-6 text-admin-foreground">{message.body}</p>
      <div className="flex flex-wrap gap-2 border-t border-admin-border pt-4">
        {message.status === "unread" && onMarkRead ? (
          <Button type="button" variant="outline" onClick={() => runAction(onMarkRead)}>{copy.markRead}</Button>
        ) : null}
        {message.status !== "archived" && onArchive ? (
          <Button type="button" variant="outline" onClick={() => runAction(onArchive)}>{copy.archive}</Button>
        ) : null}
      </div>
      {actionFailed ? <p role="alert" className="mt-3 text-sm text-admin-danger-text">{copy.actionFailed}</p> : null}
    </article>
  );
}
