// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminInput } from "../src/primitives/input";
import { AdminManagedForm, useUnsavedChangesGuard } from "../src/primitives/managed-form";
import { AdminDialogProvider } from "../src/primitives/modal-dialog";
import { AdminRepeaterListField } from "../src/primitives/repeater";
import { AdminSubmitButton } from "../src/primitives/submit-button";
import { AdminMediaField } from "../src/media/field";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin/products/new",
  useRouter: () => ({ replace: navigation.replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn()}),
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

  it("registers beforeunload only while dirty and removes it when clean", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AdminManagedForm action={async (state) => state}>
        <AdminInput name="name" aria-label="Name" defaultValue="Original" />
      </AdminManagedForm>,
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");

    await user.clear(input);
    await user.type(input, "Changed");
    await waitFor(() => {
      expect(addListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    });

    await user.clear(input);
    await user.type(input, "Original");
    await waitFor(() => {
      expect(removeListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    });

    addListener.mockRestore();
    removeListener.mockRestore();
    expect(container.querySelector("form")).not.toBeNull();
  });

  it("prevents the browser's beforeunload event while dirty", async () => {
    const user = userEvent.setup();
    const addListener = vi.spyOn(window, "addEventListener");
    render(
      <AdminManagedForm action={async (state) => state}>
        <AdminInput name="name" aria-label="Name" />
      </AdminManagedForm>,
    );
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Changed");
    await waitFor(() => expect(addListener).toHaveBeenCalledWith("beforeunload", expect.any(Function)));
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    addListener.mockRestore();
  });

  it("removes the beforeunload listener on unmount", async () => {
    const user = userEvent.setup();
    const removeListener = vi.spyOn(window, "removeEventListener");
    const view = render(
      <AdminManagedForm action={async (state) => state}>
        <AdminInput name="name" aria-label="Name" />
      </AdminManagedForm>,
    );
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Changed");
    await waitFor(() => expect(removeListener).not.toHaveBeenCalledWith("beforeunload", expect.any(Function)));
    view.unmount();
    expect(removeListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    removeListener.mockRestore();
  });

  it("removes the beforeunload listener after a successful save", async () => {
    const user = userEvent.setup();
    const removeListener = vi.spyOn(window, "removeEventListener");
    render(
      <AdminManagedForm
        action={async () => ({ status: "success", message: "Saved", feedbackKey: "saved" })}
      >
        <AdminInput name="name" aria-label="Name" />
        <button type="submit">Save form</button>
      </AdminManagedForm>,
    );
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Changed");
    await user.click(screen.getByRole("button", { name: "Save form" }));
    await waitFor(() => expect(removeListener).toHaveBeenCalledWith("beforeunload", expect.any(Function)));
    removeListener.mockRestore();
  });

  it("exposes dirty state and a navigation confirmation API", async () => {
    function Probe() {
      const guard = useUnsavedChangesGuard();
      return (
        <>
          <span>{guard.isDirty ? "dirty" : "clean"}</span>
          <button onClick={() => void guard.confirmNavigation().then((allowed) => screen.getByRole("status").textContent = String(allowed))}>
            Check navigation
          </button>
          <span role="status" />
        </>
      );
    }

    render(
      <AdminDialogProvider>
        <AdminManagedForm action={async (state) => state}>
          <AdminInput name="name" aria-label="Name" />
          <Probe />
        </AdminManagedForm>
      </AdminDialogProvider>,
    );
    expect(screen.getByText("clean")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Check navigation" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("true"));
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
