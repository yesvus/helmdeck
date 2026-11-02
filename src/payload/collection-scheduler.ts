// SPDX-License-Identifier: MIT

import { AdminPayloadAccessRefused } from "./bridge.js";
import type { AdminPayloadContent, AdminPayloadSessionReader } from "./bridge.js";

export type AdminPayloadCollectionScheduler = {
  publish: (id: string | number, publishedAt?: string) => Promise<unknown>;
  unpublish: (id: string | number) => Promise<unknown>;
  schedule: (id: string | number, publishedAt: string) => Promise<unknown>;
};

export function createAdminPayloadCollectionScheduler({
  content,
  resolveUser,
  collection,
}: {
  content: Pick<AdminPayloadContent, "update">;
  resolveUser: AdminPayloadSessionReader;
  collection: string;
}): AdminPayloadCollectionScheduler {
  const update = async (id: string | number, data: Record<string, unknown>) => {
    if (!(await resolveUser())) throw new AdminPayloadAccessRefused("update");
    return content.update(collection, id, data);
  };
  return {
    publish: (id, publishedAt = new Date().toISOString()) => update(id, { _status: "published", publishedAt }),
    unpublish: (id) => update(id, { _status: "draft" }),
    schedule: (id, publishedAt) => update(id, { _status: "draft", publishedAt }),
  };
}
