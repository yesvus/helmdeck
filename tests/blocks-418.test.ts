// SPDX-License-Identifier: MIT
import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAdminBlockRegistry } from "../src/collections/blocks";

describe("blocks #418 registry contract", () => {
  it("defines a single type with schema validation and type+fields", () => {
    const renderFn = vi.fn((block: Record<string, unknown>) =>
      createElement("h1", null, String((block as { title?: unknown }).title ?? "")),
    );
    const registry = createAdminBlockRegistry([
      {
        type: "hero",
        schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
        render: renderFn,
      },
    ]);
    expect(registry.has("hero")).toBe(true);
    expect(registry.get("hero")?.type).toBe("hero");
    expect(registry.list()).toHaveLength(1);
  });

  it("renders known types", () => {
    const renderFn = vi.fn((block: Record<string, unknown>) =>
      createElement("h1", null, String((block as { title?: unknown }).title ?? "")),
    );
    const registry = createAdminBlockRegistry([
      {
        type: "hero",
        schema: { type: "object", properties: { title: { type: "string" } } },
        render: renderFn,
      },
    ]);
    const { container } = render(createElement("div", null, registry.render([{ type: "hero", title: "Hello" }]) as never));
    expect(container.textContent).toContain("Hello");
    expect(renderFn).toHaveBeenCalledTimes(1);
    expect(renderFn).toHaveBeenCalledWith({ type: "hero", title: "Hello" });
    expect(renderFn.mock.calls[0]).toHaveLength(1);
  });

  it("degrades unknown types without crashing", () => {
    const renderFn = vi.fn((block: Record<string, unknown>) =>
      createElement("h1", null, String((block as { title?: unknown }).title ?? "")),
    );
    const registry = createAdminBlockRegistry([
      {
        type: "hero",
        schema: { type: "object", properties: { title: { type: "string" } } },
        render: renderFn,
      },
    ]);
    expect(() =>
      render(createElement("div", null, registry.render([{ type: "missing", title: "x" }, { type: "hero", title: "Ok" }]) as never)),
    ).not.toThrow();
    const { container } = render(createElement("div", null, registry.render([{ type: "missing", title: "x" }, { type: "hero", title: "Ok" }]) as never));
    expect(container.textContent).toContain("Ok");
    expect(renderFn).toHaveBeenCalledTimes(2);
    expect(renderFn).toHaveBeenCalledWith({ type: "hero", title: "Ok" });
  });

  it("returns typed per-block errors from validate", () => {
    const renderFn = vi.fn((block: Record<string, unknown>) =>
      createElement("h1", null, String((block as { title?: unknown }).title ?? "")),
    );
    const registry = createAdminBlockRegistry([
      {
        type: "hero",
        schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
        render: renderFn,
      },
    ]);
    const problems = registry.validate([{ type: "hero", title: 5 }]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatchObject({ index: 0, type: "hero" });
    expect(Array.isArray(problems[0].errors)).toBe(true);
    expect(problems[0].errors.length).toBeGreaterThan(0);
  });

  it("validates before rendering, skipping invalid blocks", () => {
    const renderFn = vi.fn((block: Record<string, unknown>) =>
      createElement("h1", null, String((block as { title?: unknown }).title ?? "")),
    );
    const registry = createAdminBlockRegistry([
      {
        type: "hero",
        schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
        render: renderFn,
      },
    ]);
    const { container } = render(createElement("div", null, registry.render([{ type: "hero", title: 5 }]) as never));
    expect(container.textContent).toBe("");
    expect(renderFn).not.toHaveBeenCalled();
  });

  it("maps a fake page document's blocks to rendered output", () => {
    const renderFn = vi.fn((block: Record<string, unknown>) =>
      createElement("h2", null, String((block as { heading?: unknown }).heading ?? "")),
    );
    const registry = createAdminBlockRegistry([
      {
        type: "hero",
        schema: { type: "object", properties: { heading: { type: "string" } } },
        render: renderFn,
      },
    ]);
    const fakeDoc = { title: "Page", blocks: [{ blockType: "hero", heading: "Welcome" }] };
    const { container } = render(createElement("div", null, registry.render(fakeDoc.blocks as Array<unknown>) as never));
    expect(container.textContent).toContain("Welcome");
    expect(renderFn).toHaveBeenCalledWith({ blockType: "hero", heading: "Welcome" });
    expect(renderFn.mock.calls[0]).toHaveLength(1);
  });
});
