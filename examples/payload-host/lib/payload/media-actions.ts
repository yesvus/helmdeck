// SPDX-License-Identifier: MIT
/**
 * The one path from this host's media library into Payload's uploads.
 *
 * The library reads and writes through `AdminMediaAdapter`, and the adapter's methods are server
 * actions here, so each call reaches Payload through the package's bridge with `overrideAccess:
 * false` and the session's user. The bytes are handed to Payload as Payload's own file option,
 * where they were not arriving before the bridge passed them.
 */

"use server";

import { createAdminPayloadMediaAdapter } from "@yesvus/helmdeck";
import type { AdminMediaItem, AdminMediaListQuery, AdminMediaListResult } from "@yesvus/helmdeck";
import { payloadContent } from "./content";

const COLLECTION = "media";

async function adapter() {
  const content = await payloadContent();
  return createAdminPayloadMediaAdapter({ content, collection: COLLECTION });
}

export async function listPayloadMedia(query?: AdminMediaListQuery): Promise<AdminMediaListResult> {
  return (await adapter()).list(query);
}

export async function uploadPayloadMedia(formData: FormData): Promise<AdminMediaItem> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("No file was uploaded.");
  }
  return (await adapter()).upload(file);
}

export async function renamePayloadMedia(item: AdminMediaItem, name: string): Promise<AdminMediaItem> {
  const mediaAdapter = await adapter();
  if (!mediaAdapter.rename) throw new Error("Rename is not supported.");
  return mediaAdapter.rename(item, name);
}

export async function deletePayloadMedia(item: AdminMediaItem): Promise<void> {
  const mediaAdapter = await adapter();
  if (!mediaAdapter.delete) throw new Error("Delete is not supported.");
  return mediaAdapter.delete(item);
}
