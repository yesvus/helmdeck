// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AdminContextMenu,
  AdminContextMenuContent,
  AdminContextMenuItem,
  AdminContextMenuTrigger,
  AdminDropdownMenu,
  AdminDropdownMenuContent,
  AdminDropdownMenuItem,
  AdminDropdownMenuTrigger,
  AdminPopover,
  AdminPopoverContent,
  AdminPopoverTrigger,
  AdminSheet,
  AdminSheetBody,
  AdminSheetContent,
  AdminSheetTitle,
  AdminSheetTrigger,
} from "../src/primitives/overlays";

describe("AdminDropdownMenu", () => {
  it("opens on the trigger and reports the item that was chosen", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <AdminDropdownMenu>
        <AdminDropdownMenuTrigger>Actions</AdminDropdownMenuTrigger>
        <AdminDropdownMenuContent>
          <AdminDropdownMenuItem onSelect={onSelect}>Duplicate</AdminDropdownMenuItem>
          <AdminDropdownMenuItem>Delete</AdminDropdownMenuItem>
        </AdminDropdownMenuContent>
      </AdminDropdownMenu>,
    );

    const trigger = screen.getByRole("button", { name: "Actions" });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(onSelect).toHaveBeenCalled();
  });

  it("closes on escape and gives the focus back to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <AdminDropdownMenu>
        <AdminDropdownMenuTrigger>Actions</AdminDropdownMenuTrigger>
        <AdminDropdownMenuContent>
          <AdminDropdownMenuItem>Duplicate</AdminDropdownMenuItem>
        </AdminDropdownMenuContent>
      </AdminDropdownMenu>,
    );

    const trigger = screen.getByRole("button", { name: "Actions" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("AdminPopover", () => {
  it("moves the focus into the popover and gives it back to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <AdminPopover>
        <AdminPopoverTrigger>Filters</AdminPopoverTrigger>
        <AdminPopoverContent>
          <button type="button">Apply</button>
        </AdminPopoverContent>
      </AdminPopover>,
    );

    const trigger = screen.getByRole("button", { name: "Filters" });
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole("button", { name: "Apply" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes when the click lands outside it", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <AdminPopover>
          <AdminPopoverTrigger>Filters</AdminPopoverTrigger>
          <AdminPopoverContent>
            <button type="button">Apply</button>
          </AdminPopoverContent>
        </AdminPopover>
        <button type="button">Elsewhere</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("holds the focus inside it when it is told to", async () => {
    const user = userEvent.setup();
    render(
      <AdminPopover modal>
        <AdminPopoverTrigger>Filters</AdminPopoverTrigger>
        <AdminPopoverContent>
          <button type="button">Apply</button>
        </AdminPopoverContent>
      </AdminPopover>,
    );

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.tab();
    expect(screen.getByRole("button", { name: "Apply" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Apply" })).toHaveFocus();
  });
});

describe("AdminContextMenu", () => {
  it("opens on a right click and offers its items", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <AdminContextMenu>
        <AdminContextMenuTrigger>Record</AdminContextMenuTrigger>
        <AdminContextMenuContent>
          <AdminContextMenuItem onSelect={onSelect}>Duplicate</AdminContextMenuItem>
        </AdminContextMenuContent>
      </AdminContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText("Record"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(onSelect).toHaveBeenCalled();
  });
});

describe("AdminSheet", () => {
  it("opens from its edge and closes on escape", async () => {
    const user = userEvent.setup();
    render(
      <AdminSheet>
        <AdminSheetTrigger>Open details</AdminSheetTrigger>
        <AdminSheetContent side="right">
          <AdminSheetTitle>Details</AdminSheetTitle>
          <AdminSheetBody>What the product is.</AdminSheetBody>
        </AdminSheetContent>
      </AdminSheet>,
    );

    const trigger = screen.getByRole("button", { name: "Open details" });
    await user.click(trigger);
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveAttribute("data-state", "open");
    expect(sheet).toHaveClass("right-0", "my-8");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("anchors to the edge it was given", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AdminSheet>
        <AdminSheetTrigger>Open details</AdminSheetTrigger>
        <AdminSheetContent side="bottom">
          <AdminSheetTitle>Details</AdminSheetTitle>
        </AdminSheetContent>
      </AdminSheet>,
    );

    await user.click(screen.getByRole("button", { name: "Open details" }));
    expect(screen.getByRole("dialog")).toHaveClass("bottom-0", "mx-8");
    rerender(
      <AdminSheet>
        <AdminSheetTrigger>Open details</AdminSheetTrigger>
        <AdminSheetContent side="right">
          <AdminSheetTitle>Details</AdminSheetTitle>
        </AdminSheetContent>
      </AdminSheet>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("right-0");
  });
});
