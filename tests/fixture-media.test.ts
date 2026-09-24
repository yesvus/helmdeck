import { describe, expect, it } from "vitest";
import { demoMediaAdapter } from "../fixtures/media";

describe("public fixture media", () => {
  it("uses real web sources with metadata matching each media kind", async () => {
    const { items } = await demoMediaAdapter.list();
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.publicUrl).toMatch(/^https:\/\//);
      expect(item.publicUrl).not.toContain("example.com");
      if (item.kind === "image") {
        expect(item.contentType).toBe("image/jpeg");
        expect(item.width).toBe(1200);
        expect(item.height).toBe(800);
      }
      if (item.kind === "video") {
        expect(item.contentType).toBe("video/mp4");
        expect(item.width).toBe(960);
        expect(item.height).toBe(540);
      }
      if (item.kind === "pdf") expect(item.contentType).toBe("application/pdf");
      if (item.kind === "youtube") expect(item.publicUrl).toContain("youtube.com/watch");
    }
  });

  it("keeps multi-kind filtering and cursor pagination available", async () => {
    const first = await demoMediaAdapter.list({ kinds: ["image", "video"], limit: 1 });
    const second = await demoMediaAdapter.list({ kinds: ["image", "video"], limit: 1, cursor: first.nextCursor });
    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].path).not.toBe(first.items[0].path);
  });
});
