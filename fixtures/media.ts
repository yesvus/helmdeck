"use client";

import type {
  AdminMediaAdapter,
  AdminMediaExternalInput,
  AdminMediaItem,
  AdminMediaListQuery,
} from "@yesvus/helmdeck";

let demoItems: AdminMediaItem[] = [
  {
    name: "Compact loader",
    path: "demo/compact-loader.svg",
    publicUrl: "/media/compact-loader.svg",
    source: "uploaded",
    kind: "image",
    contentType: "image/svg+xml",
    size: 18_400,
    updatedAt: "2026-09-24T09:30:00.000Z",
    width: 1200,
    height: 800,
  },
  {
    name: "Operator studio",
    path: "demo/operator-studio.svg",
    publicUrl: "/media/operator-studio.svg",
    source: "local",
    kind: "image",
    contentType: "image/svg+xml",
    size: 14_200,
    updatedAt: "2026-09-23T14:10:00.000Z",
    width: 1200,
    height: 800,
  },
  {
    name: "Service manual",
    path: "demo/service-manual.pdf",
    publicUrl: "/media/service-manual.pdf",
    source: "uploaded",
    kind: "pdf",
    contentType: "application/pdf",
    size: 2_800_000,
    updatedAt: "2026-09-22T11:45:00.000Z",
  },
  {
    name: "Product walkthrough",
    path: "youtube/dQw4w9WgXcQ",
    publicUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    source: "youtube",
    kind: "youtube",
    updatedAt: "2026-09-21T08:20:00.000Z",
  },
  {
    name: "Launch film",
    path: "demo/launch-film.mp4",
    publicUrl: "/media/launch-film.mp4",
    source: "uploaded",
    kind: "video",
    contentType: "video/mp4",
    size: 18_400_000,
    updatedAt: "2026-09-20T16:00:00.000Z",
    width: 1920,
    height: 1080,
  },
];

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function getDemoMediaItems() {
  return (await demoMediaAdapter.list()).items;
}

export const demoMediaAdapter: AdminMediaAdapter = {
  async list(query: AdminMediaListQuery = {}) {
    const search = query.search?.trim().toLocaleLowerCase();
    const items = demoItems.filter((item) => {
      const matchesSearch = !search || `${item.name} ${item.kind}`.toLocaleLowerCase().includes(search);
      const matchesKind = !query.kind || item.kind === query.kind;
      return matchesSearch && matchesKind;
    });
    return { items, total: items.length };
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
    return item;
  },
  async rename(item, name) {
    const next = { ...item, name };
    demoItems = demoItems.map((current) => (current.path === item.path ? next : current));
    return next;
  },
  async delete(item) {
    demoItems = demoItems.filter((current) => current.path !== item.path);
  },
};
