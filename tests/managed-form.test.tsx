// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminInput } from "../src/primitives/input";
import { AdminManagedForm } from "../src/primitives/managed-form";
import { AdminRepeaterListField } from "../src/primitives/repeater";
import { AdminSubmitButton } from "../src/primitives/submit-button";
import { AdminMediaField } from "../src/media/field";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin/products/new",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams("locale=en"),
}));

describe("AdminManagedForm", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps submit disabled until a value changes", async () => {
    const user = userEvent.setup();
    render(
      <AdminManagedForm action={async (state) => state}>
        <AdminInput name="name" aria-label="Name" />
        <AdminSubmitButton label="Save" />
      </AdminManagedForm>,
    );

    const submit = screen.getByRole("button", { name: "Save" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Loader");
    await waitFor(() => {
      expect(submit).toBeEnabled();
      expect(submit).toHaveClass("bg-admin-success-action");
    });
  });

  it("persists controlled repeater changes", async () => {
    const user = userEvent.setup();
    render(
      <AdminManagedForm
        action={async (state) => state}
        autosaveKey={() => "repeater"}
      >
        <AdminRepeaterListField
          addLabel="Add capability"
          defaultItems={["Base"]}
          itemLabel="Capability"
          name="capabilities"
        />
      </AdminManagedForm>,
    );

    await user.click(screen.getByRole("button", { name: "Add capability" }));
    await waitFor(
      () => {
        const saved = window.localStorage.getItem("helmdeck:admin-autosave:repeater");
        expect(saved).not.toBeNull();
        expect(JSON.parse(saved ?? "[]")).toContainEqual(["capabilities", "Base"]);
      },
      { timeout: 2500 },
    );
  });

  it("restores controlled repeater values from autosave", async () => {
    window.localStorage.setItem(
      "helmdeck:admin-autosave:repeater",
      JSON.stringify([["capabilities", "Alpha\nBeta"]]),
    );

    render(
      <AdminManagedForm
        action={async (state) => state}
        autosaveKey={() => "repeater"}
      >
        <AdminRepeaterListField
          addLabel="Add capability"
          defaultItems={["Default"]}
          itemLabel="Capability"
          name="capabilities"
        />
      </AdminManagedForm>,
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Capability 1" })).toHaveValue("Alpha");
      expect(screen.getByRole("textbox", { name: "Capability 2" })).toHaveValue("Beta");
    });
  });

  it("restores controlled media values from autosave", async () => {
    const item = {
      name: "Restored image",
      path: "media/restored.webp",
      publicUrl: "https://example.com/restored.webp",
      source: "uploaded" as const,
      kind: "image" as const,
    };
    window.localStorage.setItem(
      "helmdeck:admin-autosave:media",
      JSON.stringify([["cover", item.publicUrl]]),
    );

    const { container } = render(
      <AdminManagedForm
        action={async (state) => state}
        autosaveKey={() => "media"}
      >
        <AdminMediaField
          adapter={{ list: vi.fn().mockResolvedValue({ items: [], total: 0 }), upload: vi.fn() }}
          items={[item]}
          label="Cover"
          name="cover"
        />
      </AdminManagedForm>,
    );

    await waitFor(() => {
      expect(container.querySelector('input[name="cover"]')).toHaveValue(item.publicUrl);
    });
  });
});
