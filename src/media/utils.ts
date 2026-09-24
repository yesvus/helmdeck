// SPDX-License-Identifier: MIT
import type { AdminMediaItem } from "../adapters/index.js";

const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"];
const videoExtensions = [".mp4", ".mov", ".m4v", ".webm"];

export function isImageMediaItem(item: AdminMediaItem) {
  if (item.kind === "image") {
    return true;
  }
  if (item.kind === "pdf" || item.kind === "youtube") {
    return false;
  }
  if (item.contentType?.startsWith("image/")) {
    return true;
  }
  const path = item.path.toLocaleLowerCase();
  return imageExtensions.some((extension) => path.endsWith(extension));
}

export function isPdfMediaItem(item: AdminMediaItem) {
  if (item.kind === "pdf") {
    return true;
  }
  if (item.kind === "image" || item.kind === "youtube") {
    return false;
  }
  return item.contentType === "application/pdf" || item.path.toLocaleLowerCase().endsWith(".pdf");
}

export function isYouTubeMediaItem(item: AdminMediaItem) {
  return item.kind === "youtube";
}

export function isVideoMediaItem(item: AdminMediaItem) {
  if (item.kind === "video") {
    return true;
  }
  if (item.kind === "image" || item.kind === "pdf" || item.kind === "youtube") {
    return false;
  }
  if (item.contentType?.startsWith("video/")) {
    return true;
  }
  const path = item.path.toLocaleLowerCase();
  return videoExtensions.some((extension) => path.endsWith(extension));
}

export function isVisualMediaItem(item: AdminMediaItem) {
  return isImageMediaItem(item) || isYouTubeMediaItem(item) || isVideoMediaItem(item);
}

export function isPdfMediaUrl(value: string) {
  return value.toLocaleLowerCase().endsWith(".pdf");
}

export function isVideoMediaUrl(value: string) {
  const path = value.toLocaleLowerCase();
  return videoExtensions.some((extension) => path.endsWith(extension));
}

export function isImageMediaUrl(value: string) {
  const path = value.toLocaleLowerCase();
  return !isPdfMediaUrl(path) && !isVideoMediaUrl(path) && !getYouTubeId(value);
}

export function getYouTubeId(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments[0] === "embed" || segments[0] === "shorts") {
        return segments[1] ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function getYouTubeThumbnailUrl(value: string) {
  const id = getYouTubeId(value);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
}

export function getAdminMediaThumbnailUrl(item: AdminMediaItem) {
  if (isYouTubeMediaItem(item)) {
    return getYouTubeThumbnailUrl(item.publicUrl);
  }
  return isImageMediaItem(item) ? item.publicUrl : "";
}

export function formatMediaSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) {
    return "";
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

export type AdminMediaSort =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "size-desc"
  | "size-asc"
  | "kind";

export const adminMediaSortValues: AdminMediaSort[] = [
  "date-desc",
  "date-asc",
  "name-asc",
  "name-desc",
  "size-desc",
  "size-asc",
  "kind",
];

const kindOrder: Record<AdminMediaItem["kind"], number> = {
  image: 1,
  video: 2,
  pdf: 3,
  youtube: 4,
};

export function getAdminMediaTimestamp(item: AdminMediaItem) {
  if (item.updatedAt) {
    const time = Date.parse(item.updatedAt);
    if (!Number.isNaN(time)) {
      return time;
    }
  }

  const unixMatch = item.path.match(/(?:^|[/_-])(\d{10,13})(?:$|[/._-])/);
  if (unixMatch) {
    const parsed = Number(unixMatch[1]);
    if (parsed > 1_000_000_000_000) return parsed;
    if (parsed > 1_000_000_000) return parsed * 1000;
  }

  const dateMatch = item.path.match(/(\d{4}[-_/]\d{2}[-_/]\d{2})/);
  if (dateMatch) {
    const parsed = Date.parse(dateMatch[1].replace(/[_/]/g, "-"));
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function sortAdminMediaItems(items: AdminMediaItem[], sort: AdminMediaSort, locale = "en") {
  return [...items].sort((a, b) => {
    const byName = () => a.name.localeCompare(b.name, locale, { sensitivity: "base", numeric: true });

    switch (sort) {
      case "date-desc": {
        const timeA = getAdminMediaTimestamp(a);
        const timeB = getAdminMediaTimestamp(b);
        if (timeA === 0 && timeB !== 0) return 1;
        if (timeA !== 0 && timeB === 0) return -1;
        return timeA === timeB ? byName() : timeB - timeA;
      }
      case "date-asc": {
        const timeA = getAdminMediaTimestamp(a);
        const timeB = getAdminMediaTimestamp(b);
        if (timeA === 0 && timeB !== 0) return 1;
        if (timeA !== 0 && timeB === 0) return -1;
        return timeA === timeB ? byName() : timeA - timeB;
      }
      case "name-desc":
        return b.name.localeCompare(a.name, locale, { sensitivity: "base", numeric: true });
      case "size-desc": {
        const sizeA = a.size ?? 0;
        const sizeB = b.size ?? 0;
        if (sizeA === 0 && sizeB !== 0) return 1;
        if (sizeA !== 0 && sizeB === 0) return -1;
        return sizeA === sizeB ? byName() : sizeB - sizeA;
      }
      case "size-asc": {
        const sizeA = a.size ?? 0;
        const sizeB = b.size ?? 0;
        if (sizeA === 0 && sizeB !== 0) return 1;
        if (sizeA !== 0 && sizeB === 0) return -1;
        return sizeA === sizeB ? byName() : sizeA - sizeB;
      }
      case "kind": {
        const kindA = kindOrder[a.kind];
        const kindB = kindOrder[b.kind];
        return kindA === kindB ? byName() : kindA - kindB;
      }
      case "name-asc":
      default:
        return byName();
    }
  });
}
