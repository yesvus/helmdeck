"use client";

import type { AdminMediaAdapter, AdminMediaItem } from "@yesvus/helmdeck";

export const mediaItems: AdminMediaItem[] = [{
  name: "Workspace photo",
  path: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&h=800&q=80",
  publicUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&h=800&q=80",
  source: "external",
  kind: "image",
  contentType: "image/jpeg",
  width: 1200,
  height: 800,
}];

export const mediaAdapter: AdminMediaAdapter = {
  async list() { return { items: [] }; },
  async upload(file) {
    const path = `sample/${file.name}`;
    return {
      name: file.name,
      path,
      publicUrl: `https://example.invalid/${encodeURIComponent(path)}`,
      source: "uploaded",
      kind: file.type === "application/pdf" ? "pdf" : file.type.startsWith("video/") ? "video" : "image",
      contentType: file.type,
      size: file.size,
    };
  },
};
