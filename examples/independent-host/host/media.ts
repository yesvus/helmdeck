"use client";

import type { AdminMediaAdapter } from "@yesvus/helmdeck";

export const mediaAdapter: AdminMediaAdapter = {
  async list() { return { items: [] }; },
  async upload(file) {
    const path = `sample/${file.name}`;
    return {
      name: file.name,
      path,
      publicUrl: URL.createObjectURL(file),
      source: "uploaded",
      kind: file.type.startsWith("video/") ? "video" : "image",
      contentType: file.type,
      size: file.size,
    };
  },
};
