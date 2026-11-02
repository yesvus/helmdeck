// SPDX-License-Identifier: MIT

import type { Access, CollectionConfig } from "payload";
import { payloadAccess } from "./access.ts";
import { isAdmin, principal } from "../rules.ts";

export const publishedPostsRead: Access = ({ req: { user } }) => {
  if (isAdmin(principal(user))) return true;
  return { status: { equals: "published" } };
};

export const Posts: CollectionConfig = {
  slug: "posts",
  admin: { useAsTitle: "title", group: "Content", defaultColumns: ["title", "status", "publishedAt"] },
  access: {
    create: payloadAccess("create"),
    read: publishedPostsRead,
    update: payloadAccess("update"),
    delete: payloadAccess("delete"),
  },
  hooks: {
    beforeValidate: [({ data, originalDoc }) => {
      if (data && !data.slug && typeof data.title === "string") {
        data.slug = data.title.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
      if (data && !data.slug && typeof originalDoc?.title === "string" && typeof data.title !== "string") data.slug = originalDoc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return data;
    }],
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "slug", type: "text", required: true, unique: true, index: true,
      validate: (value: string | null | undefined) => Boolean(value?.trim()) || "A slug is required.",
    },
    { name: "excerpt", type: "textarea" },
    { name: "content", type: "richText", required: true },
    { name: "heroImage", type: "relationship", relationTo: "media" },
    { name: "authors", type: "relationship", relationTo: "users", hasMany: true },
    { name: "publishedAt", type: "date" },
    { name: "status", type: "select", required: true, defaultValue: "draft", options: ["draft", "published"], access: {
      read: ({ req: { user } }) => isAdmin(principal(user)),
      update: ({ req: { user } }) => isAdmin(principal(user)),
    } },
    { name: "categories", type: "relationship", relationTo: "categories", hasMany: true },
    { name: "tags", type: "relationship", relationTo: "tags", hasMany: true },
  ],
};
