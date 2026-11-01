// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminModalDialog } from "../src/primitives/modal-dialog";

describe("AdminModalDialog", () => {
  it("renders confirm as alertdialog and closes on escape returning focus", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AdminModalDialog
        variant="confirm"
        trigger={<button type="button">Open confirm</button>}
        title="Delete record?"
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Open confirm" });
    await user.click(trigger);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(trigger).toHaveFocus();
  });

  it("renders alert as alertdialog", async () => {
    const user = userEvent.setup();
    render(
      <AdminModalDialog
        variant="alert"
        trigger={<button type="button">Open alert</button>}
        title="Saved"
        description="Your changes were saved."
        confirmLabel="OK"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open alert" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("renders prompt as dialog with input", async () => {
    const user = userEvent.setup();
    render(
      <AdminModalDialog
        variant="prompt"
        trigger={<button type="button">Open prompt</button>}
        title="Rename"
        inputLabel="Name"
        confirmLabel="Save"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open prompt" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
  });

  it("validates prompt input and shows error", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <AdminModalDialog
        variant="prompt"
        open
        onOpenChange={vi.fn()}
        title="Rename"
        inputLabel="Name"
        validate={(value) => (value.trim() ? undefined : "Required")}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm with value when valid", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <AdminModalDialog
        variant="prompt"
        open
        onOpenChange={onOpenChange}
        title="Rename"
        inputLabel="Name"
        validate={(value) => (value.trim() ? undefined : "Required")}
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Name" });
    await user.type(input, "New name");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onConfirm).toHaveBeenCalledWith("New name");
  });

  it("disables buttons when pending", async () => {
    render(
      <AdminModalDialog
        variant="confirm"
        open
        onOpenChange={vi.fn()}
        title="Delete?"
        pending
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("traps focus inside dialog", async () => {
    const user = userEvent.setup();
    render(
      <AdminModalDialog
        variant="confirm"
        open
        onOpenChange={vi.fn()}
        title="Delete?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />,
    );
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Delete" });
    await user.tab();
    // focus should stay within dialog
    expect(document.activeElement).not.toBe(document.body);
  });
});
