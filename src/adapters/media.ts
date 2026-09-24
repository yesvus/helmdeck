// SPDX-License-Identifier: MIT
export type AdminMediaKind = "image" | "video" | "pdf" | "youtube";

export type AdminMediaSource = "local" | "uploaded" | "youtube" | "external";

export type AdminMediaUsage = {
  adminHref: string;
  label: string;
  field: string;
};

export type AdminMediaItem = {
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

export type AdminMediaListQuery = {
  cursor?: string;
  limit?: number;
  search?: string;
  kind?: AdminMediaKind;
  source?: AdminMediaSource;
};

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
