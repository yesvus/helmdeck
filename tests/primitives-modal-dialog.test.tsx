// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminDialogProvider, AdminModalDialog, useAdminDialog } from "../src/primitives/modal-dialog";
import type { AdminDialogs } from "../src/primitives/modal-dialog";

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

    const input = screen.getByRole("textbox", { name: "Name" });
    await user.type(input, "New name");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onConfirm).toHaveBeenCalledWith("New name");
  });

  it("disables the buttons while the dialog is busy", async () => {
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
    // The pending label replaces the action's text, so a reader hears the state from the button.
    expect(screen.getByRole("button", { name: "Working..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("falls back to the localized dialog labels", () => {
    const { rerender } = render(
      <AdminModalDialog variant="confirm" open title="Delete?" />,
    );
    // A confirm asks, an alert acknowledges and a prompt submits, so the host passes a label only
    // when its button text needs to be more specific than its language's generic word.
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    rerender(<AdminModalDialog variant="alert" open title="Saved" />);
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
    rerender(<AdminModalDialog variant="prompt" open title="Rename" inputLabel="Name" />);
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("renders the danger styling only when the caller marks the confirm destructive", () => {
    const { rerender } = render(
      <AdminModalDialog variant="confirm" open destructive title="Delete?" />,
    );
    // The intent a caller states decides the styling: red is an accusation the dialog does not
    // make by itself about a confirm that may as well archive.
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveClass("bg-admin-danger-action");
    rerender(<AdminModalDialog variant="confirm" open title="Archive?" />);
    expect(screen.getByRole("button", { name: "Confirm" })).not.toHaveClass("bg-admin-danger-action");
  });

  it("rejects an invalid prompt value with the localized refusal when the validator says only false", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <AdminModalDialog
        variant="prompt"
        open
        title="Rename"
        validate={(value) => (value.trim() ? undefined : false)}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Provide a valid value.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps the input invalid state through aria-invalid", () => {
    render(
      <AdminModalDialog variant="prompt" open title="Rename" error="Already taken" />,
    );
    expect(screen.getByRole("textbox", { name: "Rename" })).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps Escape from closing while the dialog is busy", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AdminModalDialog
        variant="confirm"
        open
        onOpenChange={onOpenChange}
        title="Delete?"
        pending
        onConfirm={vi.fn()}
      />,
    );
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("traps focus inside dialog", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button" data-testid="outside">Outside</button>
        <AdminModalDialog
          variant="confirm"
          open
          onOpenChange={vi.fn()}
          title="Delete?"
          confirmLabel="Delete"
          cancelLabel="Cancel"
        />
      </>
    );
    // Radix's focus scope takes the closed page out of the accessibility tree and tabs through
    // the dialog's own controls: a keyboard path to a control the reader cannot see does not exist.
    const outside = document.body.querySelector("button[data-testid=outside]");
    expect(outside).not.toBeNull();
    // The outside control is not an accessible button while the dialog is open, so a screen
    // reader's list of buttons stops at the dialog.
    expect(screen.queryByRole("button", { name: "Outside" })).not.toBeInTheDocument();
    const inside = screen.getAllByRole("button");
    expect(inside).toHaveLength(3);
    // Cancel, the X close and the confirm: whatever the tab order is, the keyboard cycles the
    // dialog's own controls rather than walking out to the page the dialog opened on top of.
    type Step = "tab" | "shift-tab";
    const steps: Step[] = ["tab", "tab", "shift-tab", "tab"];
    for (const step of steps) {
      await (step === "tab" ? user.tab() : user.tab({ shift: true }));
      expect(inside, `focus left the dialog after ${step}`).toContain(document.activeElement);
    }
  });
});

describe("useAdminDialog", () => {
  it("answers the imperative confirm a boolean", async () => {
    const user = userEvent.setup();
    const dialogsRef: { current?: AdminDialogs } = {};
    const promiseRef: { current?: Promise<boolean> } = {};
    function Harness() {
      const dialogs = useAdminDialog();
      dialogsRef.current = dialogs;
      return (
        <button
          type="button"
          onClick={() => { promiseRef.current = dialogs.confirm({ title: "Delete?" }); }}
        >
          Delete
        </button>
      );
    }
    render(
      <AdminDialogProvider>
        <Harness />
      </AdminDialogProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog", { name: "Delete?" })).toBeInTheDocument();
    let answer: boolean | undefined;
    promiseRef.current?.then((value) => { answer = value; });
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(answer).toBe(true));
  });

  it("answers a cancelled imperative confirm false", async () => {
    const user = userEvent.setup();
    const dialogsRef: { current?: AdminDialogs } = {};
    const promiseRef: { current?: Promise<boolean> } = {};
    function Harness() {
      const dialogs = useAdminDialog();
      dialogsRef.current = dialogs;
      return (
        <button
          type="button"
          onClick={() => { promiseRef.current = dialogs.confirm({ title: "Delete?" }); }}
        >
          Delete
        </button>
      );
    }
    render(
      <AdminDialogProvider>
        <Harness />
      </AdminDialogProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    let answer: boolean | undefined;
    promiseRef.current?.then((value) => { answer = value; });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(answer).toBe(false));
  });

  it("answers an imperative prompt null on cancel and the value on confirm", async () => {
    const user = userEvent.setup();
    const dialogsRef: { current?: AdminDialogs } = {};
    const promiseRef: { current?: Promise<string | null> } = {};
    function Harness() {
      const dialogs = useAdminDialog();
      dialogsRef.current = dialogs;
      return (
        <button
          type="button"
          onClick={() => { promiseRef.current = dialogs.prompt({ title: "Rename" }); }}
        >
          Rename
        </button>
      );
    }
    render(
      <AdminDialogProvider>
        <Harness />
      </AdminDialogProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    expect(screen.getByRole("dialog", { name: "Rename" })).toBeInTheDocument();
    let answer: string | null | undefined;
    promiseRef.current?.then((value) => { answer = value; });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(answer).toBe(null));
  });

  it("answers an imperative prompt with the value the reader typed", async () => {
    const user = userEvent.setup();
    const dialogsRef: { current?: AdminDialogs } = {};
    const promiseRef: { current?: Promise<string | null> } = {};
    function Harness() {
      const dialogs = useAdminDialog();
      dialogsRef.current = dialogs;
      return (
        <button
          type="button"
          onClick={() => { promiseRef.current = dialogs.prompt({ title: "Rename" }); }}
        >
          Rename
        </button>
      );
    }
    render(
      <AdminDialogProvider>
        <Harness />
      </AdminDialogProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    let answer: string | null | undefined;
    promiseRef.current?.then((value) => { answer = value; });
    await user.type(screen.getByRole("textbox", { name: "Rename" }), "New name");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(answer).toBe("New name"));
  });

  it("resolves an imperative confirm once, so a late cancel cannot rewrite the answer", async () => {
    const user = userEvent.setup();
    const resolutions = vi.fn();
    function Harness() {
      const dialogs = useAdminDialog();
      return (
        <button
          type="button"
          onClick={() => { void dialogs.confirm({ title: "Delete?" }).then(resolutions); }}
        >
          Delete
        </button>
      );
    }
    render(
      <AdminDialogProvider>
        <Harness />
      </AdminDialogProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(resolutions).toHaveBeenCalledWith(true));
    // The dialog closed on the confirm, so an extra close from the transition after it has
    // nothing to resolve.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(resolutions).toHaveBeenCalledTimes(1));
  });
});
