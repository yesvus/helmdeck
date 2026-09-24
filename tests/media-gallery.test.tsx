// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminMediaGalleryField } from "../src/media/gallery-field";

describe("AdminMediaGalleryField", () => {
  it("preserves pipe characters in restored alt text", () => {
    render(
      <AdminMediaGalleryField
        adapter={{ list: vi.fn().mockResolvedValue({ items: [], total: 0 }), upload: vi.fn() }}
        defaultValue="https://example.com/room.jpg | room | north"
        items={[]}
        label="Gallery"
        name="gallery"
      />,
    );

    expect(screen.getByRole("textbox", { name: "Gallery 1" })).toHaveValue("room | north");
  });
});
