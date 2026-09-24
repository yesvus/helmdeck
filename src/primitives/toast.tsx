// SPDX-License-Identifier: MIT
"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";

export type AdminToastTone = "success" | "info" | "error";

export function AdminToastViewport({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 sm:right-6 sm:top-6 sm:w-96">
      {children}
    </div>
  );
}

export function AdminToastCard({
  tone,
  title,
  body,
  icon,
  onClose,
  closeLabel,
}: {
  tone: AdminToastTone;
  title: string;
  body: string;
  icon: ReactNode;
  onClose: () => void;
  closeLabel?: string;
}) {
  const i18n = useAdminMessages();
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto rounded-xl border bg-admin-surface/95 p-4 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45)] backdrop-blur",
        tone === "success"
          ? "border-emerald-200"
          : tone === "error"
            ? "border-red-200"
            : "border-zinc-200",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            tone === "success"
              ? "bg-emerald-50 text-emerald-700"
              : tone === "error"
                ? "bg-red-50 text-red-700"
                : "bg-zinc-100 text-zinc-700",
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          <p className="mt-1 break-words text-sm leading-6 text-zinc-600">{body}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          aria-label={closeLabel ?? i18n.common.dismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
