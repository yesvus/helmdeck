// SPDX-License-Identifier: MIT
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { AdminNavGroup } from "../adapters";
import { useAdminShell } from "./context";
import type { AdminShellLabels } from "./labels";
import { mergeAdminLabels } from "./labels";
import { useBreadcrumbs } from "./use-breadcrumbs";

function prettifySegment(segment: string) {
  const words = segment.replace(/[-_]/g, " ").trim();
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

export function AdminBreadcrumbs({
  groups,
  pathname,
  labels,
  resolveSegmentLabel,
}: {
  groups?: AdminNavGroup[];
  pathname?: string;
  labels?: Partial<AdminShellLabels>;
  resolveSegmentLabel?: (segment: string, labels: AdminShellLabels) => string;
}) {
  const shell = useAdminShell();
  const mergedLabels = mergeAdminLabels({ ...shell?.labels, ...labels });
  const trail = useBreadcrumbs(groups, pathname);

  if (!trail || trail.remainder.length === 0) {
    return null;
  }

  const resolve = resolveSegmentLabel ?? defaultResolve;

  return (
    <nav aria-label={mergedLabels.breadcrumbLabel} className="flex items-center gap-1.5 text-xs text-zinc-500">
      <Link href={trail.item.href} className="hover:text-zinc-900">
        {trail.item.label}
      </Link>
      {trail.remainder.map((segment, index) => (
        <span key={`${segment}-${index}`} className="flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3" />
          <span className={index === trail.remainder.length - 1 ? "text-zinc-700" : undefined}>
            {resolve(segment, mergedLabels)}
          </span>
        </span>
      ))}
    </nav>
  );
}

function defaultResolve(segment: string, labels: AdminShellLabels) {
  return segment === "new" ? labels.segmentNew : prettifySegment(segment);
}
