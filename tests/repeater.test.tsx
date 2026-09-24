// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminRepeaterListField } from "../src/primitives/repeater";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/products/new",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("AdminRepeaterListField", () => {
  it("serializes trimmed rows into a hidden form value", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AdminRepeaterListField
        addLabel="Add feature"
        defaultItems={["Lift assist"]}
        itemLabel="Feature"
        label="Features"
        name="features"
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Feature 1" }), " A");
    await user.click(screen.getByRole("button", { name: "Add feature" }));
    await user.type(screen.getByRole("textbox", { name: "Feature 2" }), "Ride control");

    expect(container.querySelector('textarea[name="features"]')).toHaveValue(
      "Lift assist A\nRide control",
    );
  });
});
