// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminManagedForm } from "../src/primitives/managed-form";
import { AdminFormActionPanel } from "../src/primitives/action-panel";
import { AdminInput } from "../src/primitives/input";

vi.mock("next/navigation.js", () => ({ usePathname: () => "/admin", useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

function setup(overrides: Partial<React.ComponentProps<typeof AdminFormActionPanel>> = {}) {
  return render(<AdminManagedForm action={async (state) => state}>
    <AdminInput name="title" aria-label="Title" />
    <AdminFormActionPanel onSave={vi.fn()} {...overrides} />
  </AdminManagedForm>);
}

describe("AdminFormActionPanel #383", () => {
  it("disables save when clean and enables it when dirty with live status", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Updated");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
  });

  it("shows publish only when provided and confirms discard", async () => {
    const user = userEvent.setup();
    const discard = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setup({ onPublish: vi.fn(), onDiscard: discard });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "x");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(discard).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("complementary")).toHaveClass("sticky", "bottom-0", "sm:ml-auto");
  });

  it("reports pending while a save callback runs", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    setup({ onSave: () => new Promise<void>((done) => { resolve = done; }) });
    await user.type(screen.getByRole("textbox", { name: "Title" }), "x");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saving..."));
    resolve();
  });
});
