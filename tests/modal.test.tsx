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
  it("uses one centered CSS positioning contract with its entrance animation", async () => {
    render(<Modal />);
    const dialog = await screen.findByRole("dialog", { name: "Dialog title" });

    expect(dialog).toHaveClass("fixed", "left-1/2", "top-1/2");
    expect(dialog.className).not.toMatch(/(?:^|\s)-?translate-[xy]-1\/2(?:\s|$)/);
    expect(dialog.style.left).toBe("");
    expect(dialog.style.top).toBe("");
    expect(dialog.style.transform).toBe("");
    expect(dialog.className).toContain("admin-pop-in_150ms_ease-out_forwards");
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(dialog.previousElementSibling).toHaveClass("fixed", "inset-0");
  });

  it("lets consumer placement classes replace the centered defaults", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className="left-8 top-12" aria-label="Placed dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Placed dialog" });

    expect(dialog).toHaveClass("left-8", "top-12");
    expect(dialog.className).not.toMatch(/(?:^|\s)left-1\/2(?:\s|$)/);
    expect(dialog.className).not.toMatch(/(?:^|\s)top-1\/2(?:\s|$)/);
  });

  it.each(["right-8", "start-8", "end-8", "inset-x-8", "inset-8"])(
    "does not add a centered horizontal anchor with %s",
    async (placement) => {
      render(
        <AdminModal defaultOpen>
          <AdminModalContent className={placement} aria-label="Placed dialog" />
        </AdminModal>,
      );
      const dialog = await screen.findByRole("dialog", { name: "Placed dialog" });

      expect(dialog).toHaveClass(placement);
      expect(dialog.className).not.toMatch(/(?:^|\s)left-1\/2(?:\s|$)/);
    },
  );

  it.each(["bottom-8", "inset-y-8", "inset-8"])(
    "does not add a centered vertical anchor with %s",
    async (placement) => {
      render(
        <AdminModal defaultOpen>
          <AdminModalContent className={placement} aria-label="Placed dialog" />
        </AdminModal>,
      );
      const dialog = await screen.findByRole("dialog", { name: "Placed dialog" });

      expect(dialog).toHaveClass(placement);
      expect(dialog.className).not.toMatch(/(?:^|\s)top-1\/2(?:\s|$)/);
    },
  );

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
