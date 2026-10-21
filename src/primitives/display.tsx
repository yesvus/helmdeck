// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";
import { useAdminHref } from "../i18n.js";
import { adminToneClasses, type AdminTone } from "./tone.js";

const badgeToneClassName = adminToneClasses(
  {
    neutral: "bg-zinc-100 text-zinc-700",
    info: "bg-sky-100 text-sky-800",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
  },
  "bg-red-100 text-red-800",
);

/**
 * A small label for a count, a category or a tag. A status value has its own primitive,
 * `AdminStatusPill`, and a badge is the compact label that sits inside a row or a tab.
 */
export function AdminBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: AdminTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        badgeToneClassName[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const avatarSizeClassName: Record<AdminAvatarSize, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-12 w-12 text-sm",
};

export type AdminAvatarSize = "sm" | "md" | "lg";

function initialsFrom(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
}

/**
 * A person's picture, or their initials when there is no picture or it does not load. The image is
 * decorative by default, because the name it stands for is usually next to it, so the initials are
 * what a screen reader reads.
 */
export function AdminAvatar({
  src,
  name,
  size = "md",
  alt = "",
  className,
}: {
  src?: string;
  name: string;
  size?: AdminAvatarSize;
  alt?: string;
  className?: string;
}) {
  // The source that failed is the one that is remembered, so a new source is tried again rather
  // than inheriting the failure of the last one.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-200 font-semibold uppercase text-zinc-700",
        avatarSizeClassName[size],
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt}
          onError={() => setFailedSrc(src ?? null)}
          className="h-full w-full object-cover"
        />
      ) : (
        <>
          <span aria-hidden="true">{initialsFrom(name)}</span>
          {alt ? <span className="sr-only">{alt}</span> : null}
        </>
      )}
    </span>
  );
}

/**
 * A progress bar. The value is read out through the progressbar role, with the percentage as the
 * value text, so the number does not depend on the bar being seen.
 */
export function AdminProgress({
  value,
  max = 100,
  label,
  showValue = false,
  className,
}: {
  value: number;
  max?: number;
  label: string;
  showValue?: boolean;
  className?: string;
}) {
  // A number that is not finite would put "NaN" into the ARIA values and into the width of the
  // bar, so it is bounded into something a reader can be told about.
  const boundedMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? value : 0;
  const boundedValue = Math.min(Math.max(safeValue, 0), boundedMax);
  const percent = Math.round((boundedValue / boundedMax) * 100);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={boundedValue}
        aria-valuemin={0}
        aria-valuemax={boundedMax}
        aria-valuetext={`${percent}%`}
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-200"
      >
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} />
      </div>
      {showValue ? <span className="text-xs text-zinc-500">{percent}%</span> : null}
    </div>
  );
}

/**
 * A rule between two parts of a page. A vertical rule is still a separator, and says so.
 */
export function AdminSeparator({
  orientation = "horizontal",
  label,
  className,
}: {
  orientation?: "horizontal" | "vertical";
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      className={cn(
        "bg-zinc-200",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
    />
  );
}

export type AdminBreadcrumbItem = {
  label: ReactNode;
  href?: string;
  current?: boolean;
};

/**
 * A trail of where the reader is. The last item is the current page and says so with
 * `aria-current`, and an item with a link is a link unless it is the current one.
 */
export function AdminBreadcrumb({
  items,
  label,
  hideSingle = false,
  className,
}: {
  items: AdminBreadcrumbItem[];
  label?: string;
  hideSingle?: boolean;
  className?: string;
}) {
  const i18n = useAdminMessages();
  const toHref = useAdminHref();
  const navLabel = label ?? i18n.shell.breadcrumbLabel;
  if (hideSingle && items.length === 1) {
    return (
      <nav aria-label={navLabel} className={cn("text-xs text-zinc-500", className)}>
        <ol className="flex min-w-0 items-center gap-1.5">
          <li className="sr-only">
            <span aria-current="page">{items[0]?.label}</span>
          </li>
        </ol>
      </nav>
    );
  }
  return (
    <nav aria-label={navLabel} className={cn("text-xs text-zinc-500", className)}>
      <ol className="flex min-w-0 items-center gap-1.5">
        {items.map((item, index) => {
          // A trail that names its current page is taken at its word; one that does not names its
          // last page, which is where the reader is.
          const named = items.some((candidate) => candidate.current === true);
          const current = item.current ?? (!named && index === items.length - 1);
          return (
            <li key={index} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
              {current ? (
                <span aria-current="page" className="truncate text-zinc-700">{item.label}</span>
              ) : item.href ? (
                <a href={toHref(item.href)} className="truncate hover:text-zinc-900">{item.label}</a>
              ) : (
                <span className="truncate">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
