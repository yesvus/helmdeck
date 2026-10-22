// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminRecordDetail } from "../src/primitives/record-detail";

describe("AdminRecordDetail", () => {
  it("shows the title, the body and the actions of a record", () => {
    render(
      <AdminRecordDetail
        open
        onOpenChange={() => {}}
        title="Order 4412"
        description="Placed on the twentieth."
        actions={<button type="button">Duplicate</button>}
      >
        <p>The record's fields</p>
      </AdminRecordDetail>,
    );

    expect(screen.getByRole("dialog", { name: "Order 4412" })).toBeInTheDocument();
    expect(screen.getByText("The record's fields")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("keeps the surface open while the save is in flight", () => {
    render(
      <AdminRecordDetail open onOpenChange={() => {}} title="Order 4412" pending>
        <p>The record's fields</p>
      </AdminRecordDetail>,
    );

    expect(screen.getByRole("button", { name: "Saving" })).toHaveAttribute("aria-busy", "true");
  });

  it("shows the error of the last save", () => {
    render(
      <AdminRecordDetail open onOpenChange={() => {}} title="Order 4412" error="The order could not be saved.">
        <p>The record's fields</p>
      </AdminRecordDetail>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("The order could not be saved.");
  });

  it("closes on the close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AdminRecordDetail open onOpenChange={onOpenChange} title="Order 4412">
        <p>The record's fields</p>
      </AdminRecordDetail>,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("submits the fields when the save button is pressed", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <AdminRecordDetail open onOpenChange={() => {}} title="Order 4412" onSave={onSave}>
        <input aria-label="Quantity" defaultValue="3" />
      </AdminRecordDetail>,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalled();
  });
});
