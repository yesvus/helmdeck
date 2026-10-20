import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("independent host persistence", () => {
  let directory: string | undefined;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("seeds once and persists host writes through a second adapter instance", async () => {
    vi.resetModules();
    directory = mkdtempSync(join(tmpdir(), "helmdeck-independent-host-data-"));
    const filename = join(directory, "records.sqlite");
    vi.stubEnv("INDEPENDENT_HOST_DATA_DB", filename);

    const firstHost = await import("../examples/independent-host/host/persistence");
    vi.resetModules();
    const secondHost = await import("../examples/independent-host/host/persistence");
    const [projects, profile] = await Promise.all([
      firstHost.persistence.query<{ id: string }>("projects"),
      secondHost.persistence.read<{ name: string }>("workspace-profile", "workspace"),
    ]);
    expect(projects).toHaveLength(2);
    expect(profile).toMatchObject({ id: "workspace", name: "Sample editor" });
    await firstHost.persistence.update("workspace-profile", "workspace", { name: "Saved profile" });
    await firstHost.persistence.delete("projects", "project_01");

    vi.resetModules();
    const restartedHost = await import("../examples/independent-host/host/persistence");
    await expect(restartedHost.persistence.query("projects")).resolves.toHaveLength(1);
    const contentBlocks = await restartedHost.persistence.read<{ blocks: { id: string }[] }>(
      "content-blocks",
      "landing",
    );
    expect(contentBlocks?.blocks.map(({ id }) => id)).toEqual(["block_hero", "block_quote"]);
    await expect(restartedHost.persistence.read("workspace-profile", "workspace")).resolves.toMatchObject({
      id: "workspace",
      name: "Saved profile",
    });
  });
});
