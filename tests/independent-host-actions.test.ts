import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminCollectionFormData } from "../src/collections/registry";
import { exampleBlockDefinition, type ExampleContentBlockEntry } from "../examples/independent-host/host/block-definition";

const dependencies = vi.hoisted(() => ({
  getHostSession: vi.fn(),
  update: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dependencies.revalidatePath }));
vi.mock("../examples/independent-host/host/session", () => ({ getHostSession: dependencies.getHostSession }));
vi.mock("../examples/independent-host/host/persistence", () => ({
  persistence: { update: dependencies.update },
}));

const { saveContentBlocks } = await import("../examples/independent-host/host/actions");

function validQuote(id: string): ExampleContentBlockEntry {
  return {
    id,
    kind: "quote",
    heading: "Customer story",
    headingByLocale: { en: "Customer story", tr: "Müşteri hikayesi" },
    copy: "The new setup feels right.",
    attribution: "Alex Morgan",
  };
}

describe("independent host content block action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.getHostSession.mockResolvedValue({ role: "editor" });
  });

  it("rejects duplicate submitted IDs without writing", async () => {
    const form = adminCollectionFormData(exampleBlockDefinition, [validQuote("block_one"), validQuote("block_one")]);

    await expect(saveContentBlocks(form)).resolves.toEqual({
      status: "error",
      message: "Every block must have a unique identity.",
    });
    expect(dependencies.update).not.toHaveBeenCalled();
    expect(dependencies.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects malformed submitted IDs without writing", async () => {
    const form = adminCollectionFormData(exampleBlockDefinition, [validQuote("<script>alert(1)</script>")]);

    await expect(saveContentBlocks(form)).resolves.toEqual({
      status: "error",
      message: "Block identities must use at most 100 letters, numbers, underscores, or hyphens.",
    });
    expect(dependencies.update).not.toHaveBeenCalled();
    expect(dependencies.revalidatePath).not.toHaveBeenCalled();
  });
});
