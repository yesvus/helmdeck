import { describe, expect, it, vi } from "vitest";
import type { AdminHostAdapters } from "../src/index.js";

describe("host adapter contracts", () => {
  it("composes independent host-owned services", async () => {
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const adapters = {
      permissions: { can: async (permission: string) => permission === "article:write" },
      persistence: {
        read: async <T>() => ({ title: "Draft" }) as T,
        query: async <T>() => [] as T[],
        create: async <T>(_resource: string, value: unknown) => value as T,
        update: async <T>(_resource: string, _id: string, value: unknown) => value as T,
        delete: async () => undefined,
      },
      locale: { getInterfaceLocale: () => "en", getContentLocale: () => "tr" },
      audit: { record: async () => undefined },
      preview: { getUrl: ({ resourceId }: { resource: string; resourceId: string }) => `/preview/${resourceId}` },
      cache: { invalidate },
    } satisfies AdminHostAdapters;

    expect(await adapters.permissions.can("article:write")).toBe(true);
    expect(adapters.locale.getInterfaceLocale()).toBe("en");
    expect(adapters.locale.getContentLocale()).toBe("tr");
    expect(await adapters.preview.getUrl({ resource: "article", resourceId: "42" })).toBe("/preview/42");
    await adapters.cache.invalidate({ resource: "article", resourceId: "42", operation: "update" });
    expect(invalidate).toHaveBeenCalledWith({ resource: "article", resourceId: "42", operation: "update" });
  });
});
