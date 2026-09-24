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

  it("passes multi-kind filters to the adapter", async () => {
    const list = vi.fn().mockResolvedValue({ items: [image] });
    render(
      <EnglishPicker
        adapter={{ list, upload: vi.fn() }}
        allowedKinds={["image", "video"]}
        items={[]}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        open
        title="Choose visual media"
      />,
    );

    await waitFor(() =>
      expect(list).toHaveBeenCalledWith({
        cursor: undefined,
        kinds: ["image", "video"],
        limit: 48,
        search: undefined,
        source: undefined,
      }),
    );
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

  it("announces and marks the chosen item", async () => {
    const user = userEvent.setup();
    render(
      <EnglishPicker
        items={[image]}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        open
        title="Choose media"
      />,
    );

    const card = await screen.findByRole("button", { name: /Product photo/ });
    expect(card).toHaveAttribute("aria-pressed", "false");
    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");
  });

  it("navigates between selected media while keeping the active card clear", async () => {
    const user = userEvent.setup();
    const second = { ...image, name: "Second photo", path: "media/second.webp", publicUrl: "/media/second.webp" };
    const onSelect = vi.fn();
    render(<EnglishPicker items={[image, second]} onClose={vi.fn()} onSelect={onSelect} open title="Choose media" />);
    await user.click(await screen.findByRole("button", { name: /Product photo/ }));
    await user.click(screen.getByRole("button", { name: "Next media" }));
    expect(screen.getByRole("button", { name: /Second photo/ })).toHaveAttribute("aria-pressed", "true");
    expect(onSelect).toHaveBeenLastCalledWith(second);
  });

  it("uses localized labels for upload dismissal and media navigation", async () => {
    const user = userEvent.setup();
    const second = { ...image, name: "Second photo", path: "media/second.webp", publicUrl: "/media/second.webp" };
    render(<AdminI18nProvider locale="tr"><AdminMediaPicker adapter={{ list: vi.fn().mockResolvedValue({ items: [image, second] }), upload: vi.fn() }} items={[image, second]} onClose={vi.fn()} onSelect={vi.fn()} open title="Medya seçiniz" /></AdminI18nProvider>);
    await user.click(await screen.findByRole("button", { name: "Yeni medya ekleyiniz" }));
    expect(screen.getByRole("button", { name: "Medya ekleme panelini kapatınız" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Medya ekleme panelini kapatınız" }));
    await user.click(screen.getByRole("button", { name: /Product photo/ }));
    expect(screen.getByRole("button", { name: "Önceki medya" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Sonraki medya" }));
    expect(screen.getByRole("button", { name: /Second photo/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("clears the selected state when reopened", async () => {
    const user = userEvent.setup();
    const props = {
      items: [image],
      onClose: vi.fn(),
      onSelect: vi.fn(),
      title: "Choose media",
    };
    const { rerender } = render(<EnglishPicker {...props} open />);

    const card = await screen.findByRole("button", { name: /Product photo/ });
    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");

    rerender(<EnglishPicker {...props} open={false} />);
    rerender(<EnglishPicker {...props} open />);

    expect(await screen.findByRole("button", { name: /Product photo/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("offers a retry after an adapter error", async () => {
    const user = userEvent.setup();
    const list = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [image] });
    render(
      <EnglishPicker
        adapter={{ list, upload: vi.fn() }}
        items={[]}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        open
        title="Choose media"
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Media could not be loaded.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /Product photo/ })).toBeInTheDocument();
  });
});
