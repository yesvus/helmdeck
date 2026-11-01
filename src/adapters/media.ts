// SPDX-License-Identifier: MIT
export type AdminMediaKind = "image" | "video" | "pdf" | "youtube" | "other";

export type AdminMediaSource = "local" | "uploaded" | "youtube" | "external";

export type AdminMediaUsage = {
  adminHref: string;
  label: string;
  field: string;
};

export type AdminMediaItem = {
  /** Opaque identifier assigned by the host for this asset. */
  id?: string;
  name: string;
  path: string;
  publicUrl: string;
  source: AdminMediaSource;
  kind: AdminMediaKind;
  contentType?: string;
  size?: number;
  updatedAt?: string | null;
  defaultAltText?: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  originalFilename?: string | null;
  uploadedBy?: string | null;
  duplicateCount?: number;
  usages?: AdminMediaUsage[];
};

/**
 * A bounded read of a media store. The host applies `search`, `kind`, `kinds`, `source` and `sort`
 * to its whole collection first, then returns at most `limit` items starting after `cursor`, so a
 * page is never a slice of an unfiltered or unsorted list. `cursor` is the opaque continuation
 * token returned by the previous result; an absent cursor reads the first page. `limit` is the
 * page size the caller asks for, and a host clamps it to what it can serve. Absent fields mean
 * the host's own default rather than "none", so one code path answers a paged and a bare query.
 */
export type AdminMediaListQuery = {
  cursor?: string;
  limit?: number;
  search?: string;
  sort?: AdminMediaSort;
  kind?: AdminMediaKind;
  kinds?: AdminMediaKind[];
  source?: AdminMediaSource;
};

export type AdminMediaSort =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "size-desc"
  | "size-asc"
  | "kind";

/**
 * One page of a bounded media read. `items` holds at most the requested page; `nextCursor` is
 * present only when another page follows, and a caller stops when it is absent. `total` is the
 * number of items the same query matched across the whole store, not the length of this page.
 */
export type AdminMediaListResult = {
  items: AdminMediaItem[];
  nextCursor?: string;
  total?: number;
};

export type AdminMediaUploadOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

export type AdminMediaExternalInput = {
  name: string;
  url: string;
  kind?: AdminMediaKind;
};

export type AdminMediaAdapter = {
  list: (query?: AdminMediaListQuery) => Promise<AdminMediaListResult>;
  upload: (file: File, options?: AdminMediaUploadOptions) => Promise<AdminMediaItem>;
  addExternal?: (input: AdminMediaExternalInput) => Promise<AdminMediaItem>;
  rename?: (item: AdminMediaItem, name: string) => Promise<AdminMediaItem>;
  delete?: (item: AdminMediaItem) => Promise<void>;
};
