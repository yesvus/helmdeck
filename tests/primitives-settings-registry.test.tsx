// SPDX-License-Identifier: MIT
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAdminSettingsRegistry,
  type AdminSettingsAdapter,
} from "../src/settings/contract.js";

afterEach(() => cleanup());

describe("settings registry building", () => {
  it("builds grouped definitions with defaults", () => {
    const registry = createAdminSettingsRegistry({
      groups: [
        {
          id: "general",
          title: "General",
          settings: [
            { id: "siteName", label: "Site name", type: "text", default: "Helmdeck" },
            { id: "port", label: "Port", type: "number", default: 3000 },
          ],
        },
      ],
    });
    expect(registry.groups).toHaveLength(1);
    expect(registry.groups[0].title).toBe("General");
    expect(registry.has("siteName")).toBe(true);
    expect(registry.defaults()).toEqual({ siteName: "Helmdeck", port: 3000 });
  });

  it("supports a plain array of groups", () => {
    const registry = createAdminSettingsRegistry([
      { id: "g", title: "G", settings: [{ id: "flag", label: "Flag", type: "boolean", default: false }] },
    ]);
    expect(registry.settings).toHaveLength(1);
  });

  it("validates refusal shapes", () => {
    const registry = createAdminSettingsRegistry([
      {
        id: "g",
        title: "G",
        settings: [
          { id: "port", label: "Port", type: "number", default: 3000, min: 1 },
          { id: "theme", label: "Theme", type: "choice", choices: ["light", "dark"], default: "light" },
        ],
      },
    ]);
    const problems = registry.validate({ port: "abc", theme: "nope", unknown: 1 });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatchObject({ setting: expect.any(String), reason: expect.any(String), message: expect.any(String) });
    expect(registry.validateValue("port", 5)).toBeNull();
    expect(registry.validateValue("port", "abc")).toBeTruthy();
  });
});

describe("settings renderer", () => {
  it("shows a denied write envelope", async () => {
    const user = userEvent.setup();
    const registry = createAdminSettingsRegistry([
      { id: "g", title: "G", settings: [{ id: "name", label: "Name", type: "text", default: "" }] },
    ]);
    const adapter: AdminSettingsAdapter = {
      read: async () => ({ name: "initial" }),
      write: async () => ({ ok: false, accessDenied: true }),
    };
    const { AdminSettingsRegistry } = await import("../src/settings/contract.js");
    render(<AdminSettingsRegistry registry={registry} adapter={adapter} />);
    await waitFor(() => expect(screen.getByDisplayValue("initial")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/access denied/i)).toBeTruthy();
  });

  it("reads back masked secrets after save", async () => {
    const user = userEvent.setup();
    const registry = createAdminSettingsRegistry([
      { id: "g", title: "G", settings: [{ id: "secret", label: "Secret", type: "secret", default: "" }] },
    ]);
    let stored = "";
    const adapter: AdminSettingsAdapter = {
      read: async () => ({ secret: stored ? "••••••••" : "" }),
      write: async (values) => {
        stored = String(values.secret ?? "");
        return { ok: true, values: { secret: "••••••••" } };
      },
    };
    const { AdminSettingsRegistry } = await import("../src/settings/contract.js");
    render(<AdminSettingsRegistry registry={registry} adapter={adapter} />);
    const input = await screen.findByLabelText(/secret/i);
    await user.clear(input);
    await user.type(input, "topsecret");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByDisplayValue("••••••••")).toBeTruthy());
    expect((screen.getByLabelText(/secret/i) as HTMLInputElement).value).not.toBe("topsecret");
  });

  it("shows a pending state while saving", async () => {
    const user = userEvent.setup();
    const registry = createAdminSettingsRegistry([
      { id: "g", title: "G", settings: [{ id: "name", label: "Name", type: "text", default: "" }] },
    ]);
    let resolveWrite: (value: unknown) => void = () => {};
    const adapter: AdminSettingsAdapter = {
      read: async () => ({ name: "initial" }),
      write: () => new Promise((resolve) => { resolveWrite = resolve; }),
    };
    const { AdminSettingsRegistry } = await import("../src/settings/contract.js");
    render(<AdminSettingsRegistry registry={registry} adapter={adapter} />);
    await waitFor(() => expect(screen.getByDisplayValue("initial")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /save/i })).toBeDisabled());
    resolveWrite({ ok: true });
    await waitFor(() => expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled());
  });
});
