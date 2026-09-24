// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminMediaPicker, type AdminMediaItem } from "../src";

const image: AdminMediaItem = {
  name: "Product photo",
  path: "media/product.webp",
  publicUrl: "/media/product.webp",
  source: "uploaded",
  kind: "image",
};

describe("AdminMediaPicker", () => {
  it("selects an item and closes through the controlled dialog", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <AdminMediaPicker
        items={[image]}
        onClose={onClose}
        onSelect={onSelect}
        open
        title="Choose media"
      />,
    );

    await user.click(await screen.findByRole("button", { name: /Product photo/ }));
    expect(onSelect).toHaveBeenCalledWith(image);
  });

  it("exposes the empty state and a labelled close control", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <AdminMediaPicker
        emptyText="No media is available."
        items={[]}
        onClose={onClose}
        onSelect={vi.fn()}
        open
        title="Choose media"
      />,
    );

    expect(await screen.findByText("No media is available.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
