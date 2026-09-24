// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminInput } from "../src/primitives/input";
import { AdminManagedForm } from "../src/primitives/managed-form";
import { AdminSubmitButton } from "../src/primitives/submit-button";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/products/new",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams("locale=en"),
}));

describe("AdminManagedForm", () => {
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
    await waitFor(() => expect(submit).toBeEnabled());
  });
});
