// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { AdminMediaItem } from "../src/adapters";
import {
  getYouTubeThumbnailUrl,
  isImageMediaItem,
  isPdfMediaItem,
  isVideoMediaItem,
  sortAdminMediaItems,
} from "../src/media";

const image: AdminMediaItem = {
  name: "Loader",
  path: "loader.webp",
  publicUrl: "https://cdn.test/loader.webp",
  source: "uploaded",
  kind: "image",
  size: 2_000,
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const video: AdminMediaItem = {
  name: "Demo",
  path: "demo.mp4",
  publicUrl: "https://cdn.test/demo.mp4",
  source: "uploaded",
  kind: "video",
  size: 20_000,
  updatedAt: "2026-09-22T00:00:00.000Z",
};

describe("media utilities", () => {
  it("detects media kinds", () => {
    expect(isImageMediaItem(image)).toBe(true);
    expect(isVideoMediaItem(video)).toBe(true);
    expect(isPdfMediaItem({ ...image, kind: "pdf", path: "manual.pdf" })).toBe(true);
  });

  it("sorts newest first and uses locale-aware names", () => {
    expect(sortAdminMediaItems([image, video], "date-desc").map((item) => item.name)).toEqual([
      "Demo",
      "Loader",
    ]);
  });

  it("creates YouTube thumbnails from common URL shapes", () => {
    expect(getYouTubeThumbnailUrl("https://youtu.be/abc123")).toBe(
      "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    );
  });
});
