// SPDX-License-Identifier: MIT
export type AdminMediaLabels = {
  description: string;
  searchPlaceholder: string;
  searchLabel: string;
  sortLabel: string;
  upload: string;
  hideUpload: string;
  closeUpload: string;
  previousMedia: string;
  nextMedia: string;
  file: string;
  external: string;
  externalUrl: string;
  externalName: string;
  addExternal: string;
  empty: string;
  loading: string;
  loadMore: string;
  loadError: string;
  retry: string;
  results: string;
  total: string;
  select: string;
  replace: string;
  clear: string;
  recommendedRatio: string;
  drop: string;
  browse: string;
  startUpload: string;
  uploading: string;
  uploadSuccess: string;
  uploadError: string;
  sourceLocal: string;
  sourceUploaded: string;
  sourceYoutube: string;
  sourceExternal: string;
};

export const defaultAdminMediaLabels: AdminMediaLabels = {
  description: "Select an existing item or upload a new file.",
  searchPlaceholder: "Search media",
  searchLabel: "Search media",
  sortLabel: "Sort media",
  upload: "Upload",
  hideUpload: "Hide upload",
  closeUpload: "Close upload panel",
  previousMedia: "Previous media",
  nextMedia: "Next media",
  file: "File",
  external: "External link",
  externalUrl: "Media URL",
  externalName: "Display name",
  addExternal: "Add link",
  empty: "No matching media is available.",
  loading: "Loading media...",
  loadMore: "Load more",
  loadError: "Media could not be loaded.",
  retry: "Try again",
  results: "items",
  total: "total",
  select: "Select media",
  replace: "Replace",
  clear: "Clear",
  recommendedRatio: "Recommended ratio",
  drop: "Drop a file here or choose one",
  browse: "Choose file",
  startUpload: "Upload file",
  uploading: "Uploading",
  uploadSuccess: "Upload complete",
  uploadError: "Upload failed",
  sourceLocal: "Site file",
  sourceUploaded: "Uploaded media",
  sourceYoutube: "YouTube link",
  sourceExternal: "External media",
};
