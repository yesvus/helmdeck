import { describe, expect, it } from "vitest";
import { createBlockSaveGuard } from "../examples/independent-host/host/block-save-guard";

describe("independent host content block save guard", () => {
  it("does not overlap writes and leaves edits made during a save dirty", async () => {
    const guard = createBlockSaveGuard();
    let resolveWrite!: (value: string) => void;
    const firstSave = guard.save(() => new Promise<string>((resolve) => {
      resolveWrite = resolve;
    }));
    if (!firstSave) throw new Error("The first write was not started.");

    expect(guard.pending).toBe(true);
    expect(guard.save(async () => "overlapping write")).toBeNull();
    guard.markChanged();
    resolveWrite("saved snapshot");

    await expect(firstSave).resolves.toEqual({ value: "saved snapshot", unchanged: false });
    expect(guard.pending).toBe(false);
  });
});
