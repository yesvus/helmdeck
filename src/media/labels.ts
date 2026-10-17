// SPDX-License-Identifier: MIT
import type { AdminMediaKind } from "../adapters/index.js";

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
  preview?: string;
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
  /** A library rather than a picker: what its own controls say. */
  libraryUnavailable: string;
  libraryTitle: string;
  libraryDescription: string;
  libraryOpen: string;
  libraryNotNavigable: string;
  libraryEmptyBody: string;
  kindFilter: string;
  allKinds: string;
  kinds: Record<AdminMediaKind, string>;
  delete: string;
  deleteTitle: string;
  deleteDescription: string;
  deleteConfirm: string;
  deleteBusy: string;
  deleteFailed: string;
  deleted: string;
};

export const defaultAdminMediaLabels = {
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
  preview: "Preview image",
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
  libraryUnavailable: "This site has no media store wired, so there is nothing to browse here.",
  libraryTitle: "Media",
  libraryDescription: "Everything this site has uploaded or linked, and what you can do with it.",
  libraryOpen: "Open this file in a new tab",
  libraryNotNavigable: "This address cannot be opened safely, so this asset is shown without a link",
  kindFilter: "Filter by kind",
  allKinds: "All kinds",
  kinds: {
    image: "Image",
    video: "Video",
    pdf: "PDF",
    youtube: "YouTube",
  },
  delete: "Delete",
  deleteTitle: "Delete this asset?",
  deleteDescription: "The file is removed from the media store. A record still pointing at it will not find it.",
  deleteConfirm: "Yes, delete",
  deleteBusy: "Deleting...",
  deleteFailed: "That asset could not be deleted.",
  deleted: "Deleted",
  libraryEmptyBody: "An asset appears here once something has been uploaded, or the search and the filter are cleared.",
} satisfies AdminMediaLabels;
