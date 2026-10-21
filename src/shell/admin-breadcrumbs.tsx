// SPDX-License-Identifier: MIT
"use client";

import Link from "next/link.js";
import type { AdminNavGroup } from "../adapters/index.js";
import { AdminBreadcrumb } from "../primitives/display.js";
import { useAdminShell } from "./context.js";
import type { AdminShellLabels } from "./labels.js";
import { mergeAdminLabels } from "./labels.js";
import { useBreadcrumbs } from "./use-breadcrumbs.js";
import { useAdminHref, useAdminMessages } from "../i18n.js";

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
  const toHref = useAdminHref();
  const mergedLabels = mergeAdminLabels({ ...i18n.shell, ...shell?.labels, ...labels });
  const trail = useBreadcrumbs(groups, pathname);

  if (!trail) {
    return null;
  }

  const resolve = resolveSegmentLabel ?? shell?.resolveBreadcrumbSegment ?? defaultResolve;
  const currentCrumb = trail.crumbs.at(-1);

  const items = trail.crumbs.map((crumb) => ({
    label: crumb.href && !crumb.current
      ? <Link href={toHref(crumb.href)} className="truncate hover:text-zinc-900">{crumb.label}</Link>
      : crumb.href
        ? crumb.label
        : resolve(crumb.label, mergedLabels),
    current: crumb.current,
  }));

  if (trail.crumbs.length === 1) {
    return <AdminBreadcrumb items={[{ label: currentCrumb?.label }]} label={mergedLabels.breadcrumbLabel} hideSingle />;
  }

  return <AdminBreadcrumb items={items} label={mergedLabels.breadcrumbLabel} />;
}

function defaultResolve(segment: string, labels: AdminShellLabels) {
  return segment === "new" ? labels.segmentNew : prettifySegment(segment);
}
