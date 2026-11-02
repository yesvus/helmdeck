// SPDX-License-Identifier: MIT
/**
 * Payload collections for visitor analytics and the contact inbox.
 */

import type { CollectionConfig } from "payload";
import { createAdminPayloadAuditHooks } from "@yesvus/helmdeck";
import { isAdmin, principal } from "../rules.ts";

const activityWriter = (row: unknown, req: unknown) => {
  const payload = (req as { payload?: { create?: (args: unknown) => unknown } } | null | undefined)?.payload;
  if (payload && typeof payload.create === "function") {
    return payload.create({ collection: "admin-activity", data: row, overrideAccess: true });
  }
  return undefined;
};

const contactAuditHooks = createAdminPayloadAuditHooks({ resource: "contact-messages", writer: activityWriter });

export const AnalyticsEvents: CollectionConfig = {
  slug: "analytics-events",
  admin: { useAsTitle: "path", group: "Admin", description: "Visitor events recorded server-side." },
  access: {
    create: () => false,
    read: ({ req: { user } }) => isAdmin(principal(user)),
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "kind", type: "text", required: true, maxLength: 64, index: true },
    { name: "path", type: "text", required: true, maxLength: 512, index: true },
    { name: "visitor_key", type: "text", maxLength: 128, index: true },
    { name: "source", type: "text", maxLength: 128 },
    { name: "occurred_at", type: "text", required: true, index: true },
    { name: "properties", type: "json" },
  ],
};

export const ContactMessages: CollectionConfig = {
  slug: "contact-messages",
  admin: { useAsTitle: "subject", group: "People", description: "Public contact submissions for administrator triage." },
  access: {
    create: () => true,
    read: ({ req: { user } }) => isAdmin(principal(user)),
    update: ({ req: { user } }) => isAdmin(principal(user)),
    delete: () => false,
  },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 120 },
    { name: "email", type: "email", required: true, validate: (value) => typeof value === "string" && value.length <= 254 || "Email must be at most 254 characters." },
    { name: "subject", type: "text", required: true, maxLength: 160 },
    { name: "message", type: "textarea", required: true, maxLength: 10000 },
    { name: "created_at", type: "text", required: true, admin: { readOnly: true } },
    { name: "receivedAt", type: "text", required: false, admin: { readOnly: true } },
    { name: "status", type: "select", required: true, defaultValue: "new", options: ["new", "read", "archived"] },
  ],
  hooks: {
    beforeChange: [({ operation, data }) => {
      if (operation === "create") return { ...data, created_at: new Date().toISOString(), receivedAt: new Date().toISOString(), status: "new" };
      return data;
    }],
    afterChange: contactAuditHooks.afterChange,
    afterDelete: contactAuditHooks.afterDelete,
  },
};

// Aliases for compatibility with varying naming expectations.
export const AnalyticsEvent = AnalyticsEvents;
export const Analytics = AnalyticsEvents;
export const ContactMessage = ContactMessages;
export const ContactInbox = ContactMessages;
export const InboxMessages = ContactMessages;
