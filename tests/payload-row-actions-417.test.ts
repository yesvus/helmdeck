import { describe, expect, it, vi } from "vitest";
import { AdminPayloadAccessRefused, createAdminPayloadCollectionScheduler, type AdminPayloadContent } from "../src/index.js";

describe("Payload collection row actions", () => {
  it("publishes, unpublishes and schedules through guarded content updates", async () => {
    const update = vi.fn(async (...args: [string, string | number, unknown]) => ({ id: "p1", args }));
    const content = { update } as unknown as Pick<AdminPayloadContent, "update">;
    const scheduler = createAdminPayloadCollectionScheduler({ content, resolveUser: async () => ({ id: "u1" }), collection: "pages" });
    await scheduler.publish("p1", "2026-01-01T00:00:00.000Z");
    await scheduler.unpublish("p1");
    await scheduler.schedule("p1", "2026-02-01T00:00:00.000Z");
    expect(update.mock.calls.map((call) => call[2])).toEqual([
      { _status: "published", publishedAt: "2026-01-01T00:00:00.000Z" },
      { _status: "draft" },
      { _status: "draft", publishedAt: "2026-02-01T00:00:00.000Z" },
    ]);
  });

  it("refuses a missing user before updating", async () => {
    const update = vi.fn();
    const scheduler = createAdminPayloadCollectionScheduler({ content: { update } as unknown as Pick<AdminPayloadContent, "update">, resolveUser: async () => null, collection: "pages" });
    await expect(scheduler.publish("p1")).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    expect(update).not.toHaveBeenCalled();
  });
});
