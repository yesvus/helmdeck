// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { AdminI18nProvider, AdminMediaPicker, type AdminMediaItem } from "../src";

const image: AdminMediaItem = {
  name: "Product photo",
  path: "media/product.webp",
  publicUrl: "/media/product.webp",
  source: "uploaded",
  kind: "image",
};

function EnglishPicker(props: ComponentProps<typeof AdminMediaPicker>) {
  return (
    <AdminI18nProvider locale="en">
      <AdminMediaPicker {...props} />
    </AdminI18nProvider>
  );
}

describe("AdminMediaPicker", () => {
  it("selects an item and closes through the controlled dialog", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <EnglishPicker
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

  it("loads filtered pages through the adapter", async () => {
    const user = userEvent.setup();
    const secondImage = {
      ...image,
      name: "Second photo",
      path: "media/second.webp",
      publicUrl: "/media/second.webp",
    };
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [image], nextCursor: "next-page", total: 2 })
      .mockResolvedValueOnce({ items: [secondImage], total: 2 });
    const adapter = { list, upload: vi.fn() };

    render(
      <EnglishPicker
        adapter={adapter}
        items={[]}
        pageSize={1}
        source="uploaded"
        onClose={vi.fn()}
        onSelect={vi.fn()}
        open
        title="Choose media"
      />,
    );

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 1,
        search: undefined,
        source: "uploaded",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        cursor: "next-page",
        limit: 1,
        search: undefined,
        source: "uploaded",
      }),
    );
  });

  it("filters adapter pages to the field's allowed kinds", async () => {
    const pdf = {
      ...image,
      name: "Manual",
      path: "media/manual.pdf",
      publicUrl: "/media/manual.pdf",
      kind: "pdf" as const,
    };
    const list = vi.fn().mockResolvedValue({ items: [pdf, image] });
    render(
      <EnglishPicker
        adapter={{ list, upload: vi.fn() }}
        allowedKinds={["image"]}
        items={[]}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        open
        title="Choose an image"
      />,
    );

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith({
        cursor: undefined,
        kind: "image",
        limit: 48,
        search: undefined,
        source: undefined,
      }),
    );
    expect(await screen.findByRole("button", { name: /Product photo/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Manual/ })).not.toBeInTheDocument();
  });

  it("uses a safe default for invalid page sizes", async () => {
    const list = vi.fn().mockResolvedValue({ items: [] });
    render(
      <EnglishPicker
        adapter={{ list, upload: vi.fn() }}
        items={[]}
        pageSize={Number.NaN}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        open
        title="Choose media"
      />,
    );

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 48,
        search: undefined,
        source: undefined,
      }),
    );
  });

  it("exposes the empty state and a labelled close control", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <EnglishPicker
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
