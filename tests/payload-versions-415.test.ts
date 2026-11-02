// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import {
  AdminPayloadAccessRefused,
  type AdminPayloadContent,
} from "../src/index.js";
import { adminPayloadVersionDiff, createAdminPayloadVersionHistory } from "../src/payload/version-history.js";

describe("Payload versions (415)", () => {
  it("lists compact rows over the guarded bridge", async () => {
    const findVersions = vi.fn(async () => ({
      docs: [
        { id: "v2", createdAt: "2026-01-02T00:00:00.000Z", createdBy: { email: "ada@example.com" }, version: { title: "Second" } },
        { id: "v1", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "bob", version: { title: "First" } },
      ],
    }));
    const content = { findVersions, findVersionByID: vi.fn(), restoreVersion: vi.fn() } as unknown as Pick<AdminPayloadContent, "findVersions" | "findVersionByID" | "restoreVersion">;
    const history = createAdminPayloadVersionHistory({ content, collection: "pages" });
    const rows = await history.list("page-1");
    expect(findVersions).toHaveBeenCalled();
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("v2");
    expect(rows[0].versionAt).toBe("2026-01-02T00:00:00.000Z");
    expect(rows[0].author).toBe("ada@example.com");
    expect(rows[0].label).toBe("Second");
  });

  it("diffs plain data and omits unchanged fields", () => {
    const before = { title: "Old", count: 1, flag: true, nested: { a: 1 } };
    const after = { title: "New", count: 1, flag: true, nested: { a: 2 }, extra: "x" };
    const diff = adminPayloadVersionDiff(before, after);
    const fields = diff.map((entry) => entry.field).sort();
    expect(fields).toEqual(["extra", "nested", "title"]);
    const titleEntry = diff.find((entry) => entry.field === "title");
    expect(titleEntry).toMatchObject({ before: "Old", after: "New", kind: "changed" });
    const extraEntry = diff.find((entry) => entry.field === "extra");
    expect(extraEntry).toMatchObject({ after: "x", kind: "added" });
    // removed case
    const removed = adminPayloadVersionDiff({ gone: 1 }, {});
    expect(removed).toEqual([{ field: "gone", before: 1, kind: "removed" }]);
  });

  it("unwraps a version snapshot when present", () => {
    const diff = adminPayloadVersionDiff({ version: { title: "Old" } }, { version: { title: "New" } });
    expect(diff).toEqual([{ field: "title", before: "Old", after: "New", kind: "changed" }]);
  });

  it("refuses restore without a resolved user via the bridge", async () => {
    const restoreVersion = vi.fn(async () => {
      throw new AdminPayloadAccessRefused("restoreVersion");
    });
    const content = { findVersions: vi.fn(), findVersionByID: vi.fn(), restoreVersion } as unknown as Pick<AdminPayloadContent, "findVersions" | "findVersionByID" | "restoreVersion">;
    const history = createAdminPayloadVersionHistory({ content, collection: "pages" });
    await expect(history.restore("v1")).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    expect(restoreVersion).toHaveBeenCalled();
  });

  it("passes restore params through to the bridge", async () => {
    const restoreVersion = vi.fn(async (...args: unknown[]) => ({ ok: true, args }));
    const content = { findVersions: vi.fn(), findVersionByID: vi.fn(), restoreVersion } as unknown as Pick<AdminPayloadContent, "findVersions" | "findVersionByID" | "restoreVersion">;
    const history = createAdminPayloadVersionHistory({ content, collection: "pages" });
    await history.restore("v1", { depth: 0 });
    expect(restoreVersion).toHaveBeenCalledWith("pages", "v1", { depth: 0 });
  });

  it("reads a version by id through the bridge", async () => {
    const findVersionByID = vi.fn(async () => ({ id: "v1", version: { title: "T" } }));
    const content = { findVersions: vi.fn(), findVersionByID, restoreVersion: vi.fn() } as unknown as Pick<AdminPayloadContent, "findVersions" | "findVersionByID" | "restoreVersion">;
    const history = createAdminPayloadVersionHistory({ content, collection: "pages" });
    const doc = await history.read("page-1", "v1");
    expect(findVersionByID).toHaveBeenCalledWith("pages", "v1", { depth: 0 });
    expect((doc as { id: unknown }).id).toBe("v1");
  });
});
