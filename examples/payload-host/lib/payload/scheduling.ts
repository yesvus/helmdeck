// SPDX-License-Identifier: MIT
/**
 * Scheduled publishing of Payload pages through Payload Jobs.
 *
 * The host queues a page here and registers the publishing task in `payload.config.ts`, so the
 * moment a job's `waitUntil` arrives Payload's runner picks it up and publishes the page it names.
 */

import { createAdminPayloadScheduler } from "@yesvus/helmdeck";
import { readPayloadSession } from "../session";
import { payloadInstance } from "./content";

export const PUBLISH_TASK = "publishPayloadPage";

export async function schedulePagePublish(collection: string, id: string, publishAt: Date | string) {
  const payload = await payloadInstance();
  const scheduler = createAdminPayloadScheduler({ payload: payload as never, resolveUser: readPayloadSession });
  return scheduler.schedule({ collection, id, publishAt });
}

export async function cancelPagePublish(id: string) {
  const payload = await payloadInstance();
  const scheduler = createAdminPayloadScheduler({ payload: payload as never, resolveUser: readPayloadSession });
  return scheduler.cancel({ id });
}

export async function runScheduledPublishes() {
  const payload = await payloadInstance();
  const scheduler = createAdminPayloadScheduler({ payload: payload as never, resolveUser: readPayloadSession });
  return scheduler.run();
}