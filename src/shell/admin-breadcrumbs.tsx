// SPDX-License-Identifier: MIT
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { AdminNavGroup } from "../adapters/index.js";
import { useAdminShell } from "./context.js";
import type { AdminShellLabels } from "./labels.js";
import { mergeAdminLabels } from "./labels.js";
import { useBreadcrumbs } from "./use-breadcrumbs.js";
import { useAdminMessages } from "../i18n.js";

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
  const i18n = useAdminMessages();
  const mergedLabels = mergeAdminLabels({ ...i18n.shell, ...shell?.labels, ...labels });
  const trail = useBreadcrumbs(groups, pathname);

  if (!trail) {
    return null;
  }

  const resolve = resolveSegmentLabel ?? shell?.resolveBreadcrumbSegment ?? defaultResolve;

  return (
    <nav aria-label={mergedLabels.breadcrumbLabel} className="flex items-center gap-1.5 text-xs text-zinc-500">
      {trail.crumbs.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
          {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0" /> : null}
          {crumb.href && !crumb.current ? <Link href={crumb.href} className="truncate hover:text-zinc-900">{crumb.label}</Link> : null}
          {!crumb.href || crumb.current ? <span aria-current={crumb.current ? "page" : undefined} className={crumb.current ? "truncate text-zinc-700" : "truncate"}>{crumb.href ? crumb.label : resolve(crumb.label, mergedLabels)}</span> : null}
        </span>
      ))}
    </nav>
  );
}

function defaultResolve(segment: string, labels: AdminShellLabels) {
  return segment === "new" ? labels.segmentNew : prettifySegment(segment);
}
