// SPDX-License-Identifier: MIT

import type { CollectionConfig } from "payload";
import { payloadAccess } from "./access.ts";

export const Categories: CollectionConfig = {
  slug: "categories",
  admin: { useAsTitle: "title", group: "Content" },
  access: {
    create: payloadAccess("create"),
    read: payloadAccess("read"),
    update: payloadAccess("update"),
    delete: payloadAccess("delete"),
  },
  fields: [
    { name: "title", type: "text", required: true },
    { name: "slug", type: "text", required: true, unique: true, index: true },
  ],
};
