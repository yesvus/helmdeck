// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminMediaUpload } from "../src/media/upload";

describe("AdminMediaUpload", () => {
  it("shows external media submission errors", async () => {
    const user = userEvent.setup();
    const adapter = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      upload: vi.fn(),
      addExternal: vi.fn().mockRejectedValue(new Error("External media failed.")),
    };

    render(
      <AdminI18nProvider locale="en">
        <AdminMediaUpload adapter={adapter} allowExternal />
      </AdminI18nProvider>,
    );
    await user.click(screen.getByRole("button", { name: "External link" }));
    await user.type(screen.getByLabelText("Media URL"), "https://example.com/video");
    await user.click(screen.getByRole("button", { name: "Add link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("External media failed.");
  });
});
