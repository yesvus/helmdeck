// SPDX-License-Identifier: MIT

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

const categoriesAuditHooks = createAdminPayloadAuditHooks({ resource: "categories", writer: activityWriter });
const tagsAuditHooks = createAdminPayloadAuditHooks({ resource: "tags", writer: activityWriter });

const adminOnlyAccess = {
  create: ({ req: { user } }: { req: { user: unknown } }) => isAdmin(principal(user)),
  read: () => true,
  update: ({ req: { user } }: { req: { user: unknown } }) => isAdmin(principal(user)),
  delete: ({ req: { user } }: { req: { user: unknown } }) => isAdmin(principal(user)),
};

export const Categories: CollectionConfig = {
  slug: "categories",
  admin: { useAsTitle: "label", group: "Content" },
  access: adminOnlyAccess,
  hooks: categoriesAuditHooks,
  fields: [
    { name: "label", type: "text", required: true },
    { name: "slug", type: "text", required: true, unique: true, index: true },
  ],
};

export const Tags: CollectionConfig = {
  slug: "tags",
  admin: { useAsTitle: "label", group: "Content" },
  access: adminOnlyAccess,
  hooks: tagsAuditHooks,
  fields: [
    { name: "label", type: "text", required: true },
    { name: "slug", type: "text", required: true, unique: true, index: true },
  ],
};
