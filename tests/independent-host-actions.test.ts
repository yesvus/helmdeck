import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminCollectionFormData } from "../src/collections/registry";
import { exampleBlockDefinition, type ExampleContentBlockEntry } from "../examples/independent-host/host/block-definition";

const dependencies = vi.hoisted(() => ({
  getHostSession: vi.fn(),
  update: vi.fn(),
  query: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dependencies.revalidatePath }));
vi.mock("../examples/independent-host/host/session", () => ({ getHostSession: dependencies.getHostSession }));
vi.mock("../examples/independent-host/host/persistence", () => ({
  persistence: {
    query: dependencies.query,
    read: dependencies.read,
    create: dependencies.create,
    update: dependencies.update,
    delete: dependencies.delete,
  },
}));

const {
  createExampleResource,
  queryExampleResource,
  saveContentBlocks,
  updateExampleResource,
} = await import("../examples/independent-host/host/actions");

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

describe("independent host resource actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.getHostSession.mockResolvedValue({ role: "editor" });
  });

  it("reads only registered resources through the host adapter", async () => {
    dependencies.query.mockResolvedValue([{ id: "project_01" }]);

    await expect(queryExampleResource("projects", { status: "Active" })).resolves.toEqual([
      { id: "project_01" },
    ]);
    expect(dependencies.query).toHaveBeenCalledWith("projects", { status: "Active" });
    await expect(queryExampleResource("users")).rejects.toThrow(/not available/);
    expect(dependencies.query).toHaveBeenCalledTimes(1);
  });

  it("checks host authorization before reading records", async () => {
    dependencies.getHostSession.mockResolvedValue({ role: "viewer" });

    await expect(queryExampleResource("projects")).rejects.toThrow(/not authorized/);
    expect(dependencies.query).not.toHaveBeenCalled();
  });

  it("validates generated-form writes against the host resource fields", async () => {
    await expect(createExampleResource("projects", {
      name: "Launch",
      status: "Active",
      owner: "Jordan Lee",
      unexpected: "value",
    })).rejects.toThrow(/unsupported field/);
    expect(dependencies.create).not.toHaveBeenCalled();

    dependencies.create.mockResolvedValue({ id: "project_03", name: "Launch" });
    await expect(createExampleResource("projects", {
      name: " Launch ",
      status: " Active ",
      owner: " Jordan Lee ",
    })).resolves.toEqual({ id: "project_03", name: "Launch" });
    expect(dependencies.create).toHaveBeenCalledWith("projects", {
      name: "Launch",
      status: "Active",
      owner: "Jordan Lee",
    });
  });

  it("does not let an update create a record that the host cannot read", async () => {
    dependencies.read.mockResolvedValue(null);

    await expect(updateExampleResource("projects", "missing", {
      name: "Launch",
      status: "Active",
      owner: "Jordan Lee",
    })).rejects.toThrow(/no longer exists/);
    expect(dependencies.update).not.toHaveBeenCalled();
  });
});
