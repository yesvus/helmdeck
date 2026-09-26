// SPDX-License-Identifier: MIT
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link.js";
import { ExternalLink, LogOut, User } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminShell } from "./context.js";
import type { AdminShellLabels } from "./labels.js";
import { mergeAdminLabels } from "./labels.js";

export function AdminProfileMenu({
  email,
  compact = false,
  profileHref,
  viewSiteHref,
  onLogout,
  labels,
}: {
  email: string | null;
  compact?: boolean;
  profileHref?: string;
  viewSiteHref?: string | null;
  onLogout?: () => void | Promise<void>;
  labels?: Partial<AdminShellLabels>;
}) {
  const shell = useAdminShell();
  const mergedLabels = mergeAdminLabels({ ...shell?.labels, ...labels });
  const resolvedProfileHref = profileHref ?? shell?.profileHref;
  const resolvedViewSiteHref = viewSiteHref === undefined ? shell?.viewSiteHref : viewSiteHref;
  const resolvedOnLogout = onLogout ?? shell?.onLogout;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initial = (email?.trim().charAt(0) || "?").toUpperCase();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative shrink-0 border-t border-zinc-100 p-3",
        compact && "flex justify-center",
      )}
    >
      {open ? (
        <div
          className={cn(
            "absolute bottom-full mb-2 rounded-xl border border-zinc-200 bg-admin-surface p-1.5 shadow-[0_18px_45px_-24px_rgba(15,23,42,0.35)]",
            compact ? "left-3 w-56" : "inset-x-3",
          )}
        >
          {resolvedProfileHref ? (
            <Link
              href={resolvedProfileHref}
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              <User className="h-4 w-4" />
              {mergedLabels.profile}
            </Link>
          ) : null}
          {resolvedViewSiteHref ? (
            <Link
              href={resolvedViewSiteHref}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              <ExternalLink className="h-4 w-4" />
              {mergedLabels.viewSite}
            </Link>
          ) : null}
          {resolvedOnLogout ? (
            <>
              {resolvedProfileHref || resolvedViewSiteHref ? (
                <div className="my-1 border-t border-zinc-100" />
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void resolvedOnLogout();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                {mergedLabels.signOut}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={mergedLabels.profileMenu}
        title={compact ? (email ?? mergedLabels.profileMenu) : undefined}
        className={cn(
          "flex items-center rounded-lg text-left transition-colors hover:bg-zinc-100",
          compact ? "h-10 w-10 justify-center" : "w-full gap-2.5 px-2 py-2",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-admin-overlay text-xs font-bold text-white">
          {initial}
        </span>
        {compact ? null : (
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700">
            {email}
          </span>
        )}
      </button>
    </div>
  );
}
