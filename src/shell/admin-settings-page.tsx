// SPDX-License-Identifier: MIT
"use client";

import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import { AdminSectionCard } from "../primitives/layout.js";
import { AdminPageHeader } from "./admin-page-header.js";
import { useAdminShell } from "./context.js";
import { mergeAdminLabels } from "./labels.js";
import type { AdminShellLabels } from "./labels.js";
import { useAdminMessages } from "../i18n.js";

/**
 * A landing page for settings, so a host has somewhere to point `settingsHref` on the first
 * run instead of a link to nowhere. Sections are passed in rather than hardcoded, so the page
 * is a frame and not an opinion about what a host's settings contain.
 */
export function AdminSettingsPage({
  sections,
  children,
  labels,
}: {
  sections?: Array<{ id: string; title: string; description?: string; content: ReactNode }>;
  children?: ReactNode;
  labels?: Partial<AdminShellLabels>;
}) {
  const shell = useAdminShell();
  const i18n = useAdminMessages();
  const mergedLabels = mergeAdminLabels({ ...i18n.shell, ...shell?.labels, ...labels });

  return (
    <div className="space-y-6">
      <AdminPageHeader title={mergedLabels.settings} />
      {sections?.map((section) => (
        <AdminSectionCard
          key={section.id}
          id={section.id}
          icon={Settings}
          title={section.title}
          description={section.description}
        >
          {section.content}
        </AdminSectionCard>
      ))}
      {children}
    </div>
  );
}
