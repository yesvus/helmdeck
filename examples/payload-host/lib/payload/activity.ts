// SPDX-License-Identifier: MIT
/**
 * The activity collection Payload holds audit rows in.
 */

import type { CollectionConfig } from "payload";
import { isAdmin, principal } from "../rules.ts";

export const AdminActivity: CollectionConfig = {
  slug: "admin-activity",
  admin: {
    useAsTitle: "action",
    group: "Admin",
    description: "Audit rows written by Helmdeck's audit hooks.",
  },
  access: {
    read: ({ req: { user } }) => isAdmin(principal(user)),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "action", type: "text", required: true, index: true },
    { name: "resource", type: "text", required: true, index: true },
    { name: "resourceId", type: "text", index: true },
    { name: "actorId", type: "text", index: true },
    { name: "occurredAt", type: "text", required: true, index: true },
    { name: "metadata", type: "json" },
  ],
};
