// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n/provider.js";
import { AdminMediaField } from "../src/media/field.js";
import { AdminMediaGalleryField } from "../src/media/gallery-field.js";
import { AdminMediaLightbox } from "../src/media/lightbox.js";
import { defaultAdminMediaLabels } from "../src/media/labels.js";

const images = [
  { src: "/media/one.webp", alt: "One" },
  { src: "/media/two.webp", alt: "Two" },
];

function English({ children }: { children: ReactNode }) {
  return <AdminI18nProvider locale="en">{children}</AdminI18nProvider>;
}

describe("AdminMediaLightbox", () => {
  it("navigates with controls and arrow keys, and closes accessibly", () => {
    const onClose = vi.fn();
    const onIndexChange = vi.fn();
    render(
      <English>
        <AdminMediaLightbox
          images={images}
          index={0}
          labels={defaultAdminMediaLabels}
          onClose={onClose}
          onIndexChange={onIndexChange}
          open
          title="Product gallery"
        />
      </English>,
    );

    const dialog = screen.getByRole("dialog", { name: "Product gallery" });
    expect(screen.getByRole("img", { name: "One" })).toHaveAttribute("src", images[0].src);
    fireEvent.click(screen.getByRole("button", { name: "Next media" }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenNthCalledWith(2, 1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("opens from an image field preview while the replace action stays separate", () => {
    const item = {
      name: "Product photo",
      path: "media/product.webp",
      publicUrl: "/media/product.webp",
      source: "uploaded" as const,
      kind: "image" as const,
    };
    render(
      <English>
        <AdminMediaField items={[item]} defaultValue={item.publicUrl} label="Cover" name="cover" />
      </English>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview image: Product photo" }));
    expect(screen.getByRole("dialog", { name: "Product photo" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Product photo" })).toHaveAttribute("src", item.publicUrl);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
  });

  it("opens a gallery image and navigates across the image entries", () => {
    render(
      <English>
        <AdminMediaGalleryField
          defaultValue={"/media/one.webp | One\n/media/two.webp | Two"}
          items={[]}
          label="Gallery"
          name="gallery"
        />
      </English>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview image: One" }));
    expect(screen.getByRole("dialog", { name: "Gallery" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "One" })).toHaveAttribute("src", images[0].src);
    fireEvent.click(screen.getByRole("button", { name: "Next media" }));
    expect(screen.getByRole("img", { name: "Two" })).toHaveAttribute("src", images[1].src);
  });

  it("opens the corresponding entry when gallery URLs repeat", () => {
    render(
      <English>
        <AdminMediaGalleryField
          defaultValue={"/media/one.webp | First\n/media/one.webp | Second"}
          items={[]}
          label="Gallery"
          name="gallery"
        />
      </English>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview image: Second" }));
    expect(screen.getByRole("img", { name: "Second" })).toHaveAttribute("src", images[0].src);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });
});
