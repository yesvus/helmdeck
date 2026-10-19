"use client";

import {
  sortAdminMediaItems,
  type AdminMediaAdapter,
  type AdminMediaExternalInput,
  type AdminMediaItem,
  type AdminMediaListQuery,
} from "@yesvus/helmdeck";

let demoItems: AdminMediaItem[] = [
  {
    name: "Wireless headphones",
    path: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&h=800&q=80",
    publicUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&h=800&q=80",
    source: "external",
    kind: "image",
    contentType: "image/jpeg",
    updatedAt: "2026-09-24T09:30:00.000Z",
    width: 1200,
    height: 800,
  },
  {
    name: "Workspace supplies",
    path: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1200&h=800&q=80",
    publicUrl: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1200&h=800&q=80",
    source: "external",
    kind: "image",
    contentType: "image/jpeg",
    updatedAt: "2026-09-23T14:10:00.000Z",
    width: 1200,
    height: 800,
  },
  {
    name: "W3C PDF sample",
    path: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    publicUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    source: "external",
    kind: "pdf",
    contentType: "application/pdf",
    size: 13_264,
    updatedAt: "2026-09-22T11:45:00.000Z",
  },
  {
    name: "Big Buck Bunny film",
    path: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    publicUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    source: "youtube",
    kind: "youtube",
    updatedAt: "2026-09-21T08:20:00.000Z",
  },
  {
    name: "CC0 flower video",
    path: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    publicUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    source: "external",
    kind: "video",
    contentType: "video/mp4",
    size: 1_128_375,
    updatedAt: "2026-09-20T16:00:00.000Z",
    width: 960,
    height: 540,
  },
];

const catalogListeners = new Set<(items: AdminMediaItem[]) => void>();

function notifyCatalogListeners() {
  const items = getDemoMediaCatalogItems();
  for (const listener of catalogListeners) listener(items);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function getDemoMediaItems() {
  return (await demoMediaAdapter.list()).items;
}

export function getDemoMediaCatalogItems() {
  return demoItems.filter((item) => item.kind === "image" && item.source === "external" && /^https?:\/\//i.test(item.publicUrl));
}

export function subscribeDemoMediaCatalog(listener: (items: AdminMediaItem[]) => void) {
  catalogListeners.add(listener);
  listener(getDemoMediaCatalogItems());
  return () => {
    catalogListeners.delete(listener);
  };
}

export const demoMediaAdapter: AdminMediaAdapter = {
  async list(query: AdminMediaListQuery = {}) {
    const search = query.search?.trim().toLocaleLowerCase();
    const filtered = demoItems.filter((item) => {
      const matchesSearch = !search || `${item.name} ${item.kind}`.toLocaleLowerCase().includes(search);
      const matchesKind = !query.kind || item.kind === query.kind;
      const matchesKinds = !query.kinds?.length || query.kinds.includes(item.kind);
      const matchesSource = !query.source || item.source === query.source;
      return matchesSearch && matchesKind && matchesKinds && matchesSource;
    });
    const ordered = sortAdminMediaItems(filtered, query.sort ?? "date-desc");
    const parsedCursor = query.cursor ? Number.parseInt(query.cursor, 10) : 0;
    const safeStart = Number.isFinite(parsedCursor) && parsedCursor > 0 ? parsedCursor : 0;
    const limit = query.limit && query.limit > 0 ? Math.floor(query.limit) : ordered.length;
    const items = ordered.slice(safeStart, safeStart + limit);
    const nextCursor = safeStart + items.length < ordered.length ? String(safeStart + items.length) : undefined;
    return { items, total: ordered.length, nextCursor };
  },
  async upload(file, options) {
    for (const progress of [18, 47, 76, 100]) {
      await wait(180);
      options?.onProgress?.(progress);
    }
    const item: AdminMediaItem = {
      name: file.name,
      path: `demo/${file.name}`,
      publicUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : `/media/${file.name}`,
      source: "uploaded",
      kind: file.type.startsWith("image/")
        ? "image"
        : file.type === "application/pdf"
          ? "pdf"
          : "video",
      contentType: file.type,
      size: file.size,
      updatedAt: new Date().toISOString(),
    };
    demoItems = [item, ...demoItems];
    notifyCatalogListeners();
    return item;
  },
  async addExternal(input: AdminMediaExternalInput) {
    const item: AdminMediaItem = {
      name: input.name,
      path: input.url,
      publicUrl: input.url,
      source: "external",
      kind: input.kind ?? "image",
      updatedAt: new Date().toISOString(),
    };
    demoItems = [item, ...demoItems];
    notifyCatalogListeners();
    return item;
  },
  async rename(item, name) {
    const next = { ...item, name };
    demoItems = demoItems.map((current) => (current.path === item.path ? next : current));
    notifyCatalogListeners();
    return next;
  },
  async delete(item) {
    demoItems = demoItems.filter((current) => current.path !== item.path);
    notifyCatalogListeners();
  },
};
