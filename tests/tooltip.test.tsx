// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Tooltip } from "../src/primitives/tooltip";

const rect = (left: number, top: number, width: number, height: number) => ({
  x: left,
  y: top,
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  toJSON: () => ({}),
});

describe("Tooltip", () => {
  it("renders the same portal-free markup on the server and initial client render", async () => {
    const tooltip = <Tooltip label="Help" content="Details"><span>i</span></Tooltip>;
    const serverMarkup = renderToString(tooltip);
    const container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const hydrationError = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, tooltip); });
    expect(serverMarkup).not.toContain('role="tooltip"');
    expect(hydrationError).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    hydrationError.mockRestore();
  });

  it.each(["start", "center", "end"] as const)("aligns the arrow with the anchor for %s alignment", async (align) => {
    const { container } = render(<Tooltip label="Help" content="Details" side="bottom" align={align}><span>i</span></Tooltip>);
    const trigger = screen.getByRole("button", { name: "Help" });
    trigger.getBoundingClientRect = () => rect(200, 100, 40, 20) as DOMRect;
    screen.getByRole("tooltip", { hidden: true }).getBoundingClientRect = () => rect(0, 0, 120, 40) as DOMRect;
    fireEvent.pointerEnter(trigger);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    const popup = screen.getByRole("tooltip");
    expect(popup).toHaveAttribute("data-align", align);
    const arrow = popup.firstElementChild as HTMLElement;
    expect(Number.parseFloat(arrow.style.left)).toBe(align === "start" ? 16 : align === "center" ? 56 : 96);
    expect(container).toContainElement(trigger);
  });

  it("repositions on scroll and resize, then removes its listeners on close", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Tooltip label="Help" content="Details"><span>i</span></Tooltip>);
    const trigger = screen.getByRole("button", { name: "Help" });
    let left = 200;
    trigger.getBoundingClientRect = () => rect(left, 100, 40, 20) as DOMRect;
    screen.getByRole("tooltip", { hidden: true }).getBoundingClientRect = () => rect(0, 0, 120, 40) as DOMRect;
    fireEvent.pointerEnter(trigger);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    const popup = screen.getByRole("tooltip");
    expect(popup.style.left).toBe("160px");
    left = 240;
    fireEvent.scroll(window);
    expect(popup.style.left).toBe("200px");
    left = 280;
    fireEvent.resize(window);
    expect(popup.style.left).toBe("240px");

    unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    add.mockRestore();
    remove.mockRestore();
  });
});
