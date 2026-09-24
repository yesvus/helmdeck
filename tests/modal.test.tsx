// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AdminModal,
  AdminModalClose,
  AdminModalContent,
  AdminModalDescription,
  AdminModalTitle,
  AdminModalTrigger,
} from "../src";

function Modal({ onOpenChange = vi.fn() }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <AdminModal onOpenChange={onOpenChange} open>
      <AdminModalContent>
        <AdminModalTitle>Dialog title</AdminModalTitle>
        <AdminModalDescription>Dialog description</AdminModalDescription>
        <button type="button">Dialog action</button>
      </AdminModalContent>
    </AdminModal>
  );
}

describe("AdminModalContent", () => {
  it("is centered in its initial rendered frame and retains its entrance animation", async () => {
    render(<Modal />);
    const dialog = await screen.findByRole("dialog", { name: "Dialog title" });

    expect(dialog).toHaveStyle({
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    });
    expect(dialog.className).toContain("admin-pop-in_150ms_ease-out");
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(dialog.previousElementSibling).toHaveClass("fixed", "inset-0");
  });

  it("keeps focus management and closes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AdminModal onOpenChange={onOpenChange}>
        <AdminModalTrigger>Open dialog</AdminModalTrigger>
        <AdminModalContent>
          <AdminModalTitle>Dialog title</AdminModalTitle>
          <button type="button">Dialog action</button>
        </AdminModalContent>
      </AdminModal>,
    );

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(await screen.findByRole("button", { name: "Dialog action" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open dialog" })).toHaveFocus();
  });

  it("allows nested dialogs to open and close independently", async () => {
    const user = userEvent.setup();
    render(
      <AdminModal defaultOpen>
        <AdminModalContent>
          <AdminModalTitle>Outer dialog</AdminModalTitle>
          <AdminModal defaultOpen>
            <AdminModalContent>
              <AdminModalTitle>Inner dialog</AdminModalTitle>
              <AdminModalClose>Close inner</AdminModalClose>
            </AdminModalContent>
          </AdminModal>
        </AdminModalContent>
      </AdminModal>,
    );

    expect(await screen.findByRole("dialog", { name: "Inner dialog" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close inner" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Inner dialog" })).toBeNull());
    expect(screen.getByRole("dialog", { name: "Outer dialog" })).toBeInTheDocument();
  });
});
