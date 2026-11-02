// SPDX-License-Identifier: MIT

import type { CollectionConfig } from "payload";
import { isAdmin, principal } from "../rules.ts";

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
  fields: [
    { name: "label", type: "text", required: true },
    { name: "slug", type: "text", required: true, unique: true, index: true },
  ],
};

export const Tags: CollectionConfig = {
  slug: "tags",
  admin: { useAsTitle: "label", group: "Content" },
  access: adminOnlyAccess,
  fields: [
    { name: "label", type: "text", required: true },
    { name: "slug", type: "text", required: true, unique: true, index: true },
  ],
};
