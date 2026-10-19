import { describe, expect, it } from "vitest";
import { createBlockSaveGuard } from "../examples/independent-host/host/block-save-guard";

describe("independent host content block save guard", () => {
  it("does not overlap writes and leaves edits made during a save dirty", async () => {
    const guard = createBlockSaveGuard();
    let resolveWrite!: (value: string) => void;
    let overlappingWriteStarted = false;
    const firstSave = guard.save(() => new Promise<string>((resolve) => {
      resolveWrite = resolve;
    }));
    if (!firstSave) throw new Error("The first write was not started.");
    await Promise.resolve();

    expect(guard.pending).toBe(true);
    expect(guard.save(async () => {
      overlappingWriteStarted = true;
      return "overlapping write";
    })).toBeNull();
    guard.markChanged();
    resolveWrite("saved snapshot");

    await expect(firstSave).resolves.toEqual({ value: "saved snapshot", unchanged: false });
    expect(guard.pending).toBe(false);
    expect(overlappingWriteStarted).toBe(false);
  });

  it("releases the guard when a save operation throws synchronously", async () => {
    const guard = createBlockSaveGuard();
    const failedSave = guard.save(() => {
      throw new Error("write failed");
    });
    if (!failedSave) throw new Error("The first write was not started.");

    await expect(failedSave).rejects.toThrow("write failed");
    expect(guard.pending).toBe(false);
    await expect(guard.save(async () => "retry")).resolves.toEqual({ value: "retry", unchanged: true });
  });
});
