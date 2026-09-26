// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AdminModal,
  AdminModalBody,
  AdminModalClose,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
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
  it("provides explicit pinned header, scroll body, and responsive footer regions", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent>
          <AdminModalHeader><AdminModalTitle>Long form</AdminModalTitle></AdminModalHeader>
          <AdminModalBody data-testid="modal-body">Scrollable content</AdminModalBody>
          <AdminModalFooter data-testid="modal-footer"><button type="button">Save</button></AdminModalFooter>
        </AdminModalContent>
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Long form" });
    expect(dialog.firstElementChild).toHaveClass("shrink-0");
    expect(dialog.firstElementChild).toHaveClass("border-b", "bg-admin-surface-subtle");
    expect(screen.getByTestId("modal-body")).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(screen.getByTestId("modal-footer")).toHaveClass("shrink-0", "flex-col-reverse", "sm:flex-row", "border-t", "bg-admin-surface-subtle");
    expect(dialog).toHaveClass("max-h-[min(90dvh,56rem)]");
  });

  it("prevents Escape, outside click, and close-button dismissal while pending", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AdminModal open onOpenChange={onOpenChange}>
        <AdminModalContent preventClose aria-label="Pending dialog">
          <AdminModalTitle>Pending</AdminModalTitle>
        </AdminModalContent>
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Pending" });
    expect(dialog.querySelector("button[disabled]")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    await user.click(dialog.previousElementSibling as HTMLElement);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("uses one centered CSS positioning contract with its entrance animation", async () => {
    render(<Modal />);
    const dialog = await screen.findByRole("dialog", { name: "Dialog title" });

    expect(dialog).toHaveClass("fixed", "left-1/2", "top-1/2");
    expect(dialog).toHaveClass("-translate-x-1/2", "-translate-y-1/2");
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

  it("lets a custom max width replace the default dialog width", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className="w-[calc(100%_-_2rem)] max-w-[88rem] sm:max-w-[88rem]" aria-label="Wide dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Wide dialog" });

    expect(dialog).toHaveClass("max-w-[88rem]", "sm:max-w-[88rem]");
    expect(dialog.className).not.toMatch(/(?:^|\s)w-full(?:\s|$)/);
    expect(dialog.className).not.toContain("sm:max-w-md");
    expect(dialog.className).not.toContain("max-w-[calc(100%-2rem)]");
  });

  it("preserves base sizing defaults when consumer sizing utilities are breakpoint-scoped", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className="sm:w-96 lg:max-w-4xl" aria-label="Responsive dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Responsive dialog" });

    expect(dialog).toHaveClass("w-full", "max-w-[calc(100%-2rem)]", "sm:max-w-md", "sm:w-96", "lg:max-w-4xl");
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
