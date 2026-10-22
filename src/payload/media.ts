// SPDX-License-Identifier: MIT

import type {
  AdminMediaAdapter,
  AdminMediaItem,
  AdminMediaKind,
  AdminMediaListQuery,
  AdminMediaListResult,
  AdminMediaSort,
} from "../adapters/media.js";
import type { AdminPayloadContent } from "./bridge.js";

/**
 * The media library, over Payload's upload collection.
 *
 * Payload's upload collection already holds what a media library shows: the file, its size, its
 * type, the image's dimensions and the variants. The library's job is to present that, so the
 * adapter maps a row onto the package's media item rather than inventing a second shape.
 *
 * Every read and every write goes through the content module, so the upload collection is read
 * under the same rule as the rest of the records.
 */

/** The row Payload's upload collection holds. */
export type AdminPayloadMediaRow = {
  id: string | number;
  filename?: string | null;
  mimeType?: string | null;
  filesize?: number | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  url?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

/** The kind a file's type makes it, which is what the library presents. */
export function adminPayloadMediaKind(row: AdminPayloadMediaRow): AdminMediaKind {
  const type = row.mimeType ?? "";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf") return "pdf";
  // A type the library has no name for keeps no claim about what it is, so the grid shows a
  // document glyph without a type label rather than calling it an image or a PDF.
  return "other";
}

/** The package's media item, from a Payload upload row. */
export function defaultAdminPayloadMediaItem(row: AdminPayloadMediaRow): AdminMediaItem {
  return {
    name: row.filename ?? "",
    path: String(row.id),
    publicUrl: row.url ?? "",
    source: "uploaded",
    kind: adminPayloadMediaKind(row),
    contentType: row.mimeType ?? undefined,
    size: row.filesize ?? undefined,
    updatedAt: row.updatedAt ?? null,
    defaultAltText: row.alt ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    originalFilename: row.filename ?? null,
  };
}

const MEDIA_SORTS: Record<AdminMediaSort, string> = {
  "date-desc": "-updatedAt",
  "date-asc": "updatedAt",
  "name-asc": "filename",
  "name-desc": "-filename",
  "size-desc": "-filesize",
  "size-asc": "filesize",
  kind: "mimeType",
};

export type AdminPayloadMediaAdapterOptions = {
  content: AdminPayloadContent;
  /** The collection the uploads are held in. */
  collection?: string;
  /** How a row becomes the item the library shows. */
  mapItem?: (row: AdminPayloadMediaRow) => AdminMediaItem;
  /**
   * The condition the list is narrowed by. The search is a name that contains the term; a host
   * whose collection holds a kind of its own narrows by that here.
   */
  where?: (query: AdminMediaListQuery) => Record<string, unknown> | undefined;
  /** How many rows one page holds. */
  pageSize?: number;
};

export function createAdminPayloadMediaAdapter({
  content,
  collection = "media",
  mapItem = defaultAdminPayloadMediaItem,
  where,
  pageSize = 50,
}: AdminPayloadMediaAdapterOptions): AdminMediaAdapter {
  const pageFor = (cursor: string | undefined): number => {
    if (!cursor) return 1;
    const page = Number.parseInt(cursor, 10);
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
  };

  return {
    list: async (query: AdminMediaListQuery = {}): Promise<AdminMediaListResult> => {
      const limit = Math.min(query.limit ?? pageSize, pageSize);
      const page = pageFor(query.cursor);
      const condition = where
        ? where(query)
        : query.search
          // The fixture media store's own search is a literal substring, so the term's % and _
          // stay literals here too.
          ? { filename: { contains: query.search } }
          : undefined;
      const result = (await content.find(collection, {
        where: condition,
        sort: query.sort ? MEDIA_SORTS[query.sort] : "-updatedAt",
        limit,
        page,
      })) as { docs?: AdminPayloadMediaRow[]; totalDocs?: number };
      const docs = result.docs ?? [];
      return {
        items: docs.map((row) => mapItem(row)),
        total: result.totalDocs,
        nextCursor: docs.length === limit ? String(page + 1) : undefined,
      };
    },
    upload: async (file: File): Promise<AdminMediaItem> => {
      const created = (await content.create(collection, {}, { file })) as AdminPayloadMediaRow;
      return mapItem(created);
    },
    rename: async (item: AdminMediaItem, name: string): Promise<AdminMediaItem> => {
      const updated = (await content.update(collection, item.path, { filename: name })) as AdminPayloadMediaRow;
      return mapItem(updated);
    },
    delete: async (item: AdminMediaItem): Promise<void> => {
      await content.delete(collection, item.path);
    },
  };
}
