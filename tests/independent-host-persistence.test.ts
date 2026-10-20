import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSqlitePersistenceAdapter } from "../src/baseline/sqlite";

describe("independent host persistence", () => {
  let directory: string | undefined;
  const originalDatabasePath = process.env.INDEPENDENT_HOST_DATA_DB;

  afterEach(() => {
    vi.resetModules();
    if (originalDatabasePath === undefined) delete process.env.INDEPENDENT_HOST_DATA_DB;
    else process.env.INDEPENDENT_HOST_DATA_DB = originalDatabasePath;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("seeds once and persists host writes through a second adapter instance", async () => {
    directory = mkdtempSync(join(tmpdir(), "helmdeck-independent-host-data-"));
    const filename = join(directory, "records.sqlite");
    process.env.INDEPENDENT_HOST_DATA_DB = filename;

    const host = await import("../examples/independent-host/host/persistence");
    const profile = await host.persistence.read<{ name: string }>("workspace-profile", "workspace");
    expect(profile).toMatchObject({ id: "workspace", name: "Sample editor" });
    await host.persistence.update("workspace-profile", "workspace", { name: "Saved profile" });

    const reopened = createSqlitePersistenceAdapter({ url: filename });
    await expect(reopened.read("workspace-profile", "workspace")).resolves.toMatchObject({
      id: "workspace",
      name: "Saved profile",
    });
  });
});
