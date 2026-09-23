"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, LogOut, User } from "lucide-react";
import { cn } from "../cn";
import { useAdminShell } from "./context";
import type { AdminShellLabels } from "./labels";
import { mergeAdminLabels } from "./labels";

export function AdminProfileMenu({
  email,
  variant = "sidebar",
  compact = false,
  profileHref,
  viewSiteHref,
  onLogout,
  labels,
}: {
  email: string | null;
  variant?: "sidebar" | "topbar";
  compact?: boolean;
  profileHref?: string;
  viewSiteHref?: string | null;
  onLogout?: () => void;
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
  const inSidebar = variant === "sidebar";

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
        "relative shrink-0",
        inSidebar && "border-t border-zinc-100 p-3",
        inSidebar && compact && "flex justify-center",
      )}
    >
      {open ? (
        <div
          className={cn(
            "absolute z-50 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_18px_45px_-24px_rgba(15,23,42,0.35)]",
            inSidebar
              ? compact
                ? "bottom-full left-3 mb-2 w-56"
                : "bottom-full inset-x-3 mb-2"
              : "top-full right-0 mt-1 w-56",
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
                  resolvedOnLogout();
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
          !inSidebar && "gap-2.5 px-2 py-1.5",
          inSidebar && compact && "h-10 w-10 justify-center",
          inSidebar && !compact && "w-full gap-2.5 px-2 py-2",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
          {initial}
        </span>
        {compact ? null : (
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium text-zinc-700",
              !inSidebar && "hidden sm:block",
            )}
          >
            {email}
          </span>
        )}
        {inSidebar ? null : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />}
      </button>
    </div>
  );
}
