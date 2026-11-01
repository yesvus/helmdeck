// SPDX-License-Identifier: MIT
"use client";

import { useMemo } from "react";
import { AdminMediaLibraryPage } from "@yesvus/helmdeck";
import type { AdminMediaAdapter } from "@yesvus/helmdeck";
import {
  deletePayloadMedia,
  listPayloadMedia,
  renamePayloadMedia,
  uploadPayloadMedia,
} from "@/lib/payload/media-actions";
import { PERMISSIONS } from "@/lib/permission-names";

/**
 * The media library, reading and writing Payload's upload collection.
 *
 * Uploads land in Payload's `media` collection, and listing, renaming and deleting go through the
 * package's adapter over the one call site, so the access check and the session travel with every
 * operation the way they do for the content.
 */
export default function MediaPage() {
  const adapter = useMemo<AdminMediaAdapter>(
    () => ({
      list: listPayloadMedia,
      upload: async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        return uploadPayloadMedia(formData);
      },
      rename: renamePayloadMedia,
      delete: deletePayloadMedia,
    }),
    [],
  );

  return (
    <AdminMediaLibraryPage
      adapter={adapter}
      accept="image/*,application/pdf,video/*"
      uploadPermission={PERMISSIONS.mediaCreate}
      deletePermission={PERMISSIONS.mediaDelete}
    />
  );
}
