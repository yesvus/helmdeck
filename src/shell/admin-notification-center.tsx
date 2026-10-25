// SPDX-License-Identifier: MIT
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link.js";
import { Bell } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminHref } from "../i18n.js";

export type AdminNotification = {
  id: string;
  title: string;
  body?: string;
  read?: boolean;
  href?: string;
  createdAt?: string;
};

/**
 * A notification center for the admin shell top bar.
 *
 * The host owns the notification source and any polling; this component only renders the bell,
 * the unread badge and the dropdown list. Keeping the source outside lets hosts reuse their own
 * notification store and keeps the center optional for hosts that have none.
 */
export function AdminNotificationCenter({
  items = [],
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onRefresh,
  onError,
  label = "Notifications",
  emptyLabel = "No notifications",
  markAllLabel = "Mark all read",
  refreshLabel = "Refresh",
}: {
  items?: AdminNotification[];
  unreadCount?: number;
  onMarkRead?: (notification: AdminNotification) => void | Promise<void>;
  onMarkAllRead?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
  onError?: (error: unknown, context: "refresh" | "markAllRead" | "markRead") => void;
  label?: string;
  emptyLabel?: string;
  markAllLabel?: string;
  refreshLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const toHref = useAdminHref();
  const count = unreadCount ?? items.filter((item) => !item.read).length;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const buttonAriaLabel = count > 0 ? `${label}, ${count} unread` : label;

  function resolveHref(target: string): string {
    return /^https?:\/\//i.test(target) ? target : toHref(target);
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        aria-label={buttonAriaLabel}
        title={label}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {count > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white"
            aria-hidden="true"
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-zinc-200 bg-admin-surface shadow-[0_18px_45px_-24px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <span className="text-xs font-semibold text-zinc-700">{label}</span>
            <div className="flex items-center gap-2">
              {onRefresh ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await onRefresh();
                    } catch (e) {
                      onError?.(e, "refresh");
                      console.error("Failed to refresh notifications", e);
                    }
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-900"
                >
                  {refreshLabel}
                </button>
              ) : null}
              {onMarkAllRead ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await onMarkAllRead();
                    } catch (e) {
                      onError?.(e, "markAllRead");
                      console.error("Failed to mark all notifications read", e);
                    }
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-900"
                >
                  {markAllLabel}
                </button>
              ) : null}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-zinc-500">{emptyLabel}</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {items.map((item) => {
                  const content = (
                    <span className={cn("block px-3 py-2 text-sm", !item.read && "bg-zinc-50")}>
                      <span className="block font-medium text-zinc-900">{item.title}</span>
                      {item.body ? <span className="mt-0.5 block text-xs text-zinc-500">{item.body}</span> : null}
                    </span>
                  );
                  return (
                    <li key={item.id}>
                      {item.href ? (
                        <Link
                          href={resolveHref(item.href)}
                          onClick={async () => {
                            try {
                              await onMarkRead?.(item);
                            } catch (e) {
                              onError?.(e, "markRead");
                              console.error("Failed to mark notification read", e);
                            }
                            setOpen(false);
                          }}
                          className="block hover:bg-zinc-50"
                        >
                          {content}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await onMarkRead?.(item);
                            } catch (e) {
                              onError?.(e, "markRead");
                              console.error("Failed to mark notification read", e);
                            }
                          }}
                          className="block w-full text-left hover:bg-zinc-50"
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
