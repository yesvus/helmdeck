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
    expect(dialog).toHaveClass("max-h-[min(56rem,100dvh_-_4rem)]");
  });

  it("shares the card surface radius rather than a literal one", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent aria-label="Rounded dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Rounded dialog" });

    // The dialog was the last surface still on its own radius, at 16px against the cards' 14px.
    expect(dialog).toHaveClass("rounded-admin-card");
    expect(dialog.className).not.toMatch(/\brounded-2xl\b/);
  });

  it("reserves room for the close button in the title row itself", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent aria-label="Reserved dialog">
          <AdminModalHeader><AdminModalTitle>Reserved</AdminModalTitle></AdminModalHeader>
        </AdminModalContent>
      </AdminModal>,
    );
    // aria-labelledby, which Radix points at the title, outranks aria-label, so the accessible
    // name here is the title text and not the aria-label.
    const withButton = await screen.findByRole("dialog", { name: "Reserved" });
    // Asking each consumer for a "pr-14" leaked the requirement out of the component, and
    // AdminDestructiveAction never passed it, so its close button sat on the title.
    expect(withButton).toHaveClass("[&>:first-child]:pr-14");
  });

  it("reserves nothing when there is no close button to clear", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent aria-label="Bare dialog" showCloseButton={false}>
          <AdminModalHeader><AdminModalTitle>Bare</AdminModalTitle></AdminModalHeader>
        </AdminModalContent>
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Bare" });

    expect(dialog.className).not.toContain("[&>:first-child]:pr-14");
    expect(dialog.querySelector("button[aria-label]")).toBeNull();
  });

  it("positions the close button in the title row", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent aria-label="Closeable dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Closeable dialog" });

    // right-5/top-5 rather than right-4/top-4: the button is 32px wide, so at 16px from the edge it
    // reached past the p-6 content edge and into the text.
    expect(dialog.querySelector("button[aria-label]")).toHaveClass("absolute", "right-5", "top-5");
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
        <AdminModalContent className="w-[70rem] max-w-[88rem] sm:max-w-[88rem]" aria-label="Wide dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Wide dialog" });

    expect(dialog).toHaveClass("max-w-[88rem]", "sm:max-w-[88rem]");
    // A distinct width, so an absence check can tell the consumer's own class from the default's.
    expect(dialog.className).not.toMatch(/(?:^|\s)w-\[calc\(/);
    expect(dialog.className).not.toContain("sm:max-w-lg");
    expect(dialog.className).not.toMatch(/(?:^|\s)max-w-\[calc\(/);
  });

  it("hands width ownership to the consumer when sizing utilities are breakpoint-scoped", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className="sm:w-96 lg:max-w-4xl" aria-label="Responsive dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Responsive dialog" });

    expect(dialog).toHaveClass("sm:w-96", "lg:max-w-4xl");
    // The base cap used to ship alongside "sm:w-96", and with no merging behind them the winner was
    // whichever Tailwind ordered last, so a consumer could not reliably widen the dialog.
    expect(dialog.className).not.toMatch(/(?:^|\s)w-\[calc\(/);
    expect(dialog.className).not.toContain("sm:max-w-lg");
  });

  it.each([
    "2xl:w-96",
    "min-[900px]:w-96",
    "[&:hover]:w-96",
    "[@supports(display:grid)]:w-96",
  ])("recognises %s as a consumer-owned width", async (utility) => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className={utility} aria-label="Variant width dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Variant width dialog" });

    // The default width cap is surrendered even though only "w-" was supplied: a max-width smaller
    // than the requested width wins by clamping, so keeping "sm:max-w-lg" would cap "lg:w-[60rem]"
    // at 32rem. The gutter goes with it, since the consumer named a width outright.
    expect(dialog.className).not.toMatch(/(?:^|\s)w-\[calc\(/);
    expect(dialog.className).not.toContain("sm:max-w-lg");
    // With the gutter gone, nothing stopped a fixed rem width from exceeding the viewport.
    expect(dialog).toHaveClass("max-w-[calc(100%_-_2rem)]");
  });

  it.each(["2xl:max-w-4xl", "min-[900px]:max-w-4xl", "dark:max-w-4xl"])(
    "recognises %s as a consumer-owned maximum width",
    async (utility) => {
      render(
        <AdminModal defaultOpen>
          <AdminModalContent className={utility} aria-label="Variant max dialog" />
        </AdminModal>,
      );
      const dialog = await screen.findByRole("dialog", { name: "Variant max dialog" });

      expect(dialog.className).not.toContain("sm:max-w-lg");
    },
  );

  it.each(["2xl:left-8", "min-[900px]:left-8"])("drops the centered horizontal anchor for %s", async (utility) => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className={utility} aria-label="Variant placed dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Variant placed dialog" });

    expect(dialog.className).not.toMatch(/(?:^|\s)left-1\/2(?:\s|$)/);
    expect(dialog.className).not.toMatch(/(?:^|\s)-translate-x-1\/2(?:\s|$)/);
    expect(dialog).toHaveClass("top-1/2", "-translate-y-1/2");
  });

  it.each(["2xl:top-12", "min-[900px]:top-12"])("drops the centered vertical anchor for %s", async (utility) => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className={utility} aria-label="Variant placed dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Variant placed dialog" });

    expect(dialog.className).not.toMatch(/(?:^|\s)top-1\/2(?:\s|$)/);
    expect(dialog.className).not.toMatch(/(?:^|\s)-translate-y-1\/2(?:\s|$)/);
    expect(dialog).toHaveClass("left-1/2", "-translate-x-1/2");
  });

  it("keeps the centering anchors for variant-scoped utilities that are not placement", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className="data-[state=open]:w-96 hover:max-w-lg" aria-label="Anchored dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Anchored dialog" });

    expect(dialog).toHaveClass("left-1/2", "-translate-x-1/2", "top-1/2", "-translate-y-1/2");
  });

  it("keeps the vertical anchor when only the horizontal axis is placed", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className="inset-x-8" aria-label="Horizontal only dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Horizontal only dialog" });

    expect(dialog.className).not.toMatch(/(?:^|\s)left-1\/2(?:\s|$)/);
    expect(dialog).toHaveClass("top-1/2", "-translate-y-1/2");
  });

  it("keeps the horizontal anchor when only the vertical axis is placed", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className="inset-y-8" aria-label="Vertical only dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Vertical only dialog" });

    expect(dialog.className).not.toMatch(/(?:^|\s)top-1\/2(?:\s|$)/);
    expect(dialog).toHaveClass("left-1/2", "-translate-x-1/2");
  });

  it.each(["lg:max-w-4xl", "max-w-4xl", "2xl:max-w-4xl"])(
    "keeps the base width for the max-width-only consumer %s",
    async (utility) => {
      render(
        <AdminModal defaultOpen>
          <AdminModalContent className={utility} aria-label="Max only dialog" />
      </AdminModal>,
      );
      const dialog = await screen.findByRole("dialog", { name: "Max only dialog" });

      // A max-w is not a width. Dropping the gutter here left the dialog at its intrinsic content
      // width wherever the consumer's own breakpoint did not apply.
      expect(dialog).toHaveClass("w-[calc(100%_-_2rem)]");
      expect(dialog.className).not.toContain("sm:max-w-lg");
      // They brought their own max-w, so adding the viewport bound would compete with it.
      expect(dialog.className).not.toMatch(/(?:^|\s)max-w-\[calc\(/);
    },
  );

  it("applies the base sizing defaults only when the consumer supplies no width", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className="p-8" aria-label="Default dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Default dialog" });

    expect(dialog).toHaveClass("w-[calc(100%_-_2rem)]", "sm:max-w-lg");
    // The cap is the smaller value at every width above sm, so an "sm:w-..." gutter would never
    // decide the rendered width. It shipped for one release and was dead.
    expect(dialog.className).not.toContain("sm:w-[calc(");
    // Nothing to bound here: the gutter already is the bound.
    expect(dialog.className).not.toMatch(/(?:^|\s)max-w-\[calc\(/);
  });

  it("has gutter detectors that can actually match", () => {
    // A "not.toMatch" whose pattern cannot match any real class passes forever and proves nothing.
    // An earlier version of this file required "%" straight after "calc(", which no emitted class
    // has, so three assertions were inert. Pin that both detectors fire, and that the leading
    // boundary is what separates a gutter from a max-width.
    const gutter = /(?:^|\s)w-\[calc\(/;
    const bound = /(?:^|\s)max-w-\[calc\(/;

    expect("fixed z-50 w-[calc(100%_-_2rem)] sm:max-w-lg").toMatch(gutter);
    expect("fixed z-50 max-w-[calc(100%_-_2rem)]").toMatch(bound);
    expect("fixed z-50 max-w-[calc(100%_-_2rem)]").not.toMatch(gutter);
    expect("fixed z-50 w-[calc(100%_-_2rem)]").not.toMatch(bound);
    expect("fixed z-50 w-[70rem]").not.toMatch(gutter);
  });

  it("keeps the body as the only scroll container so the header and footer stay pinned", async () => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent>
          <AdminModalHeader><AdminModalTitle>Long form</AdminModalTitle></AdminModalHeader>
          <AdminModalBody>Scrollable content</AdminModalBody>
          <AdminModalFooter><button type="button">Save</button></AdminModalFooter>
        </AdminModalContent>
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Long form" });
    // Two live scrollbars at once put a strip of empty space inside the body's right padding, and
    // the collapsed flex child let the header scroll away despite the pinned-region contract.
    expect(dialog).toHaveClass("overflow-hidden");
    expect(dialog.className).not.toMatch(/(?:^|\s)overflow-y-auto(?:\s|$)/);
  });

  it.each([
    ["right-8", true],
    ["start-8", true],
    ["end-8", true],
    ["inset-x-8", true],
    ["inset-8", false],
  ])("does not add a centered horizontal anchor with %s", async (placement, keepsVertical) => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className={placement} aria-label="Placed dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Placed dialog" });

    expect(dialog).toHaveClass(placement);
    expect(dialog.className).not.toMatch(/(?:^|\s)left-1\/2(?:\s|$)/);
    // A single-axis placement must leave the other axis centred; a bare "inset-" places both.
    if (keepsVertical) expect(dialog).toHaveClass("top-1/2", "-translate-y-1/2");
    else expect(dialog.className).not.toMatch(/(?:^|\s)top-1\/2(?:\s|$)/);
  });

  it.each([
    ["bottom-8", true],
    ["inset-y-8", true],
    ["inset-8", false],
  ])("does not add a centered vertical anchor with %s", async (placement, keepsHorizontal) => {
    render(
      <AdminModal defaultOpen>
        <AdminModalContent className={placement} aria-label="Placed dialog" />
      </AdminModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Placed dialog" });

    expect(dialog).toHaveClass(placement);
    expect(dialog.className).not.toMatch(/(?:^|\s)top-1\/2(?:\s|$)/);
    if (keepsHorizontal) expect(dialog).toHaveClass("left-1/2", "-translate-x-1/2");
    else expect(dialog.className).not.toMatch(/(?:^|\s)left-1\/2(?:\s|$)/);
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
