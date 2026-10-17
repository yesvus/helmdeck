// SPDX-License-Identifier: MIT
/**
 * The whole activity page: a heading, then the trail.
 *
 * A host that mounts the timeline inside its own page can, and most do, because the page around it is
 * usually a shell the host has already built. This is the other half: the route a host adds when it
 * has no reason to design one, so an audit log is a link rather than a project.
 *
 * The permission is the same gate the timeline takes, applied once here so a host passes it in a
 * single place. It decides what renders; what is readable is the loader's decision, made on the
 * server.
 */

"use client";

import { useAdminMessages } from "../i18n.js";
import {
  defaultAdminActivityMessages,
  turkishAdminActivityMessages,
  type AdminActivityMessages,
} from "./messages.js";
import { AdminActivityTimeline, type AdminActivityTimelineProps } from "./timeline.js";

export type AdminActivityPageProps = AdminActivityTimelineProps & {
  /** The heading. Falls back to the trail's own title. */
  title?: string;
  /** The line under the heading. Falls back to the trail's own description. */
  description?: string;
};

export function AdminActivityPage({ title, description, ...trail }: AdminActivityPageProps) {
  const messages = useAdminMessages();
  const copy: AdminActivityMessages =
    messages.activity ?? (messages.locale === "tr" ? turkishAdminActivityMessages : defaultAdminActivityMessages);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title ?? copy.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{description ?? copy.description}</p>
      </header>
      <AdminActivityTimeline {...trail} />
    </div>
  );
}