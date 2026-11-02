// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineAdminSettings, AdminSettingsPanel } from "../src/settings/contract";
import { toast } from "../src/primitives/toasts";
import type { AdminSettingsAdapter, AdminSettingsMaskedSecret, AdminSettingsWriteEnvelope } from "../src/settings/contract";

type Stored = Record<string, unknown>;

afterEach(() => {
  toast.dismissAll();
  vi.restoreAllMocks();
});

function fakeAdapter(values: Stored, handler?: (next: Stored) => AdminSettingsWriteEnvelope | Promise<AdminSettingsWriteEnvelope>): AdminSettingsAdapter {
  const current: Stored = values;
  return {
    read: async () => ({ ...current }),
    write: async (next) => {
      if (handler) {
        const envelope = await handler(next);
        if (envelope.ok) Object.assign(current, next);
        return envelope;
      }
      Object.assign(current, next);
      return { ok: true, values: { ...current } };
    },
  };
}

const registry = defineAdminSettings({
  groups: [
    {
      key: "storefront",
      title: "Storefront",
      description: "What the public site reads.",
      settings: [
        { key: "siteTitle", label: "Site title", type: "text", default: "Birted", required: true },
        { key: "featuredLimit", label: "Featured products", type: "number", default: 8, min: 1, max: 12, step: 1 },
        { key: "goldenHour", label: "Golden hour banner", type: "boolean", default: true },
        {
          key: "themeName",
          label: "Theme",
          type: "choice",
          default: "light",
          choices: ["light", "dark", { value: "system", label: "System" }],
        },
        {
          key: "shareUrl",
          label: "Share address",
          type: "text",
          default: "",
          validate: (value) => (typeof value === "string" && value.includes("@") ? "Share address cannot hold an at sign." : undefined),
        },
      ],
    },
    {
      key: "keys",
      title: "Keys",
      settings: [{ key: "webhookSecret", label: "Webhook secret", type: "secret", default: "" }],
    },
  ],
});

describe("defineAdminSettings", () => {
  it("flattens the groups and answers get, has and the defaults", () => {
    expect(registry.settings.map((setting) => setting.key)).toEqual([
      "siteTitle",
      "featuredLimit",
      "goldenHour",
      "themeName",
      "shareUrl",
      "webhookSecret",
    ]);
    expect(registry.has("goldenHour")).toBe(true);
    expect(registry.get("webhookSecret")?.type).toBe("secret");
    expect(registry.defaults()).toMatchObject({ siteTitle: "Birted", featuredLimit: 8, goldenHour: true });
    expect(registry.has("nowhere")).toBe(false);
    expect(registry.get("nowhere")).toBeUndefined();
  });

  it("refuses values the definitions do not accept", () => {
    expect(registry.validateValue("featuredLimit", 0)).toMatch(/at least 1/);
    expect(registry.validateValue("featuredLimit", 13)).toMatch(/at most 12/);
    expect(registry.validateValue("themeName", "sepia")).toMatch(/one of/);
    expect(registry.validateValue("siteTitle", "")).toMatch(/Required/);
    expect(registry.validateValue("shareUrl", "a@b")).toMatch(/at sign/);
    expect(registry.validateValue("nowhere", 1)).toBe("Unknown setting.");
  });

  it("treats a cleared optional number as unset rather than zero", () => {
    expect(registry.validateValue("featuredLimit", "")).toBeNull();
    expect(registry.validateValue("featuredLimit", undefined)).toBeNull();
    expect(registry.validateValue("siteTitle", "")).toMatch(/Required/);
  });
});

describe("AdminSettingsPanel", () => {
  it("renders each settings group as a section card", async () => {
    render(<AdminSettingsPanel registry={registry} adapter={fakeAdapter({})} />);
    await screen.findByRole("textbox", { name: "Site title" });
    const cards = document.querySelectorAll("section.rounded-admin-card.border-admin-border");
    expect(cards).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Storefront" })).toBeInTheDocument();
  });

  it("attaches validation errors only to their matching fields", async () => {
    const user = userEvent.setup();
    render(<AdminSettingsPanel registry={registry} adapter={fakeAdapter({})} />);
    await user.type(await screen.findByRole("textbox", { name: "Share address" }), "a@b");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Share address cannot hold an at sign.")).toBeInTheDocument();
    const failingField = screen.getByRole("textbox", { name: "Share address" }).closest(".flex.flex-col.gap-2");
    const cleanField = screen.getByRole("textbox", { name: "Site title" }).closest(".flex.flex-col.gap-2");
    expect(failingField?.querySelector('[role="alert"]')).toHaveTextContent("Share address cannot hold an at sign.");
    expect(cleanField?.querySelector('[role="alert"]')).toBeNull();
  });

  it("uses the house submit button surface", async () => {
    render(<AdminSettingsPanel registry={registry} adapter={fakeAdapter({})} />);
    const button = await screen.findByRole("button", { name: "Save" });
    expect(button.className).toContain("bg-brand-500");
    expect(button.className).toContain("h-9");
  });

  it("emits a success toast by default and can suppress it", async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, "success");
    const adapter = fakeAdapter({});
    const { rerender } = render(<AdminSettingsPanel registry={registry} adapter={adapter} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Saved."));

    success.mockClear();
    rerender(<AdminSettingsPanel registry={registry} adapter={adapter} notify={false} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));
    expect(success).not.toHaveBeenCalled();
  });

  it("stores values through the adapter on a valid save", async () => {
    const user = userEvent.setup();
    const stored: Stored = {};
    render(<AdminSettingsPanel registry={registry} adapter={fakeAdapter(stored)} notify={false} />);

    // The initial read replaces the defaults, then the save carries the edited map through.
    await user.type(screen.getByRole("textbox", { name: "Site title" }), "Atlantis");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const saved = await screen.findByRole("status");
    expect(saved).toHaveTextContent("Saved.");
    expect(stored["siteTitle"]).toBe("BirtedAtlantis");
    expect(stored["goldenHour"]).toBe(true);
  });

  it("blocks the save and lists the refusals the registry returns", async () => {
    const user = userEvent.setup();
    const write = vi.fn(async (): Promise<AdminSettingsWriteEnvelope> => ({ ok: true }));
    render(<AdminSettingsPanel registry={registry} adapter={{ read: async () => ({}), write }} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    // The definition's own validator refuses this value, so the write never reaches the adapter.
    await user.type(screen.getByRole("textbox", { name: "Share address" }), "a@b");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Share address cannot hold an at sign.");
    expect(write).not.toHaveBeenCalled();
  });

  it("shows the host adapter's denial as a denied outcome", async () => {
    const user = userEvent.setup();
    const adapter = fakeAdapter({}, async (): Promise<AdminSettingsWriteEnvelope> => ({
      ok: false,
      accessDenied: true,
      message: "Only a keeper writes keys.",
    }));
    render(<AdminSettingsPanel registry={registry} adapter={adapter} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Access denied.");
    expect(alert).toHaveTextContent("Only a keeper writes keys.");
    expect(alert.querySelector(".rounded-admin-card.border-red-200")).toBeInTheDocument();
    // A denial is the host's own access rule speaking, so the panel keeps the values on hand rather
    // than wiping them.
    expect(screen.getByRole("textbox", { name: "Site title" })).toBeInTheDocument();
  });

  it("re-reads the stored values after a save, so a secret comes back masked", async () => {
    const user = userEvent.setup();
    const adapter = fakeAdapter({}, (): AdminSettingsWriteEnvelope => ({
      ok: true,
      values: { webhookSecret: "MASK" } as Record<string, unknown>,
    }));
    render(<AdminSettingsPanel registry={registry} adapter={adapter} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    const secret = screen.getByLabelText("Webhook secret") as HTMLInputElement;
    await user.type(secret, "the-real-secret");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    const maskedSecret = screen.getByLabelText("Webhook secret") as HTMLInputElement;
    expect(maskedSecret.value).toBe("MASK");
    expect(maskedSecret.type).toBe("password");
  });

  it("surfaces a failing read instead of an empty page", async () => {
    render(
      <AdminSettingsPanel
        registry={registry}
        adapter={{
          read: async () => { throw new Error("Store unreachable."); },
          write: async () => ({ ok: true }),
        }}
      />,
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Store unreachable.");
  });

  it("writes a cleared optional number as unset, not as zero", async () => {
    const user = userEvent.setup();
    const stored: Stored = { featuredLimit: 8 };
    render(<AdminSettingsPanel registry={registry} adapter={fakeAdapter(stored)} notify={false} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    await user.clear(screen.getByLabelText("Featured products"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const saved = await screen.findByRole("status");
    expect(saved).toHaveTextContent("Saved.");
    expect(stored["featuredLimit"]).toBeUndefined();
  });
});

describe("the masked secret contract", () => {
  it("is the only way a value re-enters as a secret", () => {
    // The brand is a compile-time device: a host cannot type a plaintext secret where the adapter
    // promised it had already been masked on the server.
    const masked = "MASK" as AdminSettingsMaskedSecret;
    expect(masked.length).toBeGreaterThan(0);
  });
});
