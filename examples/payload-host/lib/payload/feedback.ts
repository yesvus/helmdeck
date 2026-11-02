// SPDX-License-Identifier: MIT

import type { CollectionConfig } from "payload";
import { createAdminPayloadAuditHooks } from "@yesvus/helmdeck";
import { isAdmin, principal } from "../rules.ts";
import { APIError } from "payload";

const activityWriter = (row: unknown, req: unknown) => {
  const payload = (req as { payload?: { create?: (args: unknown) => unknown } } | null | undefined)?.payload;
  if (payload && typeof payload.create === "function") {
    return payload.create({ collection: "admin-activity", data: row, overrideAccess: true });
  }
  return undefined;
};

const feedbackAuditHooks = createAdminPayloadAuditHooks({ resource: "feedback", writer: activityWriter });

export const Feedback: CollectionConfig = {
  slug: "feedback",
  admin: { useAsTitle: "subject", group: "People", description: "Public contact submissions for administrator triage." },
  access: {
    create: ({ req: { user } }) => isAdmin(principal(user)),
    read: ({ req: { user } }) => isAdmin(principal(user)),
    update: ({ req: { user } }) => isAdmin(principal(user)),
    delete: () => false,
  },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 120 },
    { name: "email", type: "email", required: true, validate: (value) => typeof value === "string" && value.length <= 254 || "Email must be at most 254 characters." },
    { name: "subject", type: "text", required: true, maxLength: 160 },
    { name: "message", type: "textarea", required: true, maxLength: 10000 },
    { name: "submitted_at", type: "date", required: true, admin: { readOnly: true } },
    { name: "status", type: "select", required: true, defaultValue: "new", options: ["new", "read", "archived"] },
  ],
  hooks: {
    beforeChange: [({ operation, data, originalDoc }) => {
      if (operation === "create") return { ...data, submitted_at: new Date().toISOString() };
      if (data.submitted_at !== undefined && data.submitted_at !== originalDoc?.submitted_at) throw new APIError("submitted_at cannot be changed", 400);
      return data;
    }],
    afterChange: feedbackAuditHooks.afterChange,
    afterDelete: feedbackAuditHooks.afterDelete,
  },
};
