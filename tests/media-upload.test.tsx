// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen } from "@testing-library/react";
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

    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
    expect(screen.queryByText("External media failed.")).not.toBeInTheDocument();
  });

  it("locks upload actions while pending and announces success", async () => {
    const user = userEvent.setup();
    let reportProgress!: (progress: number) => void;
    let finish!: (item: { name: string; path: string; publicUrl: string; source: "uploaded"; kind: "image" }) => void;
    const upload = vi.fn((_file, options) => {
      reportProgress = options?.onProgress ?? (() => {});
      return new Promise((resolve) => { finish = resolve; });
    });
    const onUploaded = vi.fn();
    render(<AdminI18nProvider locale="en"><AdminMediaUpload adapter={{ list: vi.fn(), upload }} onUploaded={onUploaded} /></AdminI18nProvider>);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["image"], "photo.png", { type: "image/png" });
    await user.upload(input, file);
    const uploadButton = screen.getByRole("button", { name: "Upload file" });
    act(() => {
      fireEvent.click(uploadButton);
      fireEvent.click(uploadButton);
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Uploading" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Drop a file here/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    act(() => reportProgress(42.6));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "43");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "43%");
    expect(screen.getByRole("status")).toHaveTextContent("Uploading");
    act(() => reportProgress(-5));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    act(() => reportProgress(130));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "99");
    act(() => reportProgress(Number.NaN));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "99");
    expect(screen.getByRole("status")).toHaveTextContent("Uploading");
    finish({ name: "photo.png", path: "photo.png", publicUrl: "/photo.png", source: "uploaded", kind: "image" });
    expect(await screen.findByRole("status")).toHaveTextContent("Upload complete");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it("shows a concise upload failure and allows retry", async () => {
    const user = userEvent.setup();
    const upload = vi.fn().mockRejectedValueOnce(new Error("Storage endpoint https://private.example failed"))
      .mockResolvedValueOnce({ name: "photo.png", path: "photo.png", publicUrl: "/photo.png", source: "uploaded", kind: "image" });
    render(<AdminI18nProvider locale="en"><AdminMediaUpload adapter={{ list: vi.fn(), upload }} /></AdminI18nProvider>);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["image"], "photo.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Upload file" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
    expect(screen.queryByText(/private\.example/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Upload file" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Upload complete");
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("supports keyboard picking and reflects pointer, focus, and error states", async () => {
    const user = userEvent.setup();
    const upload = vi.fn().mockRejectedValue(new Error("offline"));
    render(<AdminI18nProvider locale="en"><AdminMediaUpload adapter={{ list: vi.fn(), upload }} /></AdminI18nProvider>);
    const dropzone = screen.getByRole("button", { name: /Drop a file here/ });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, "click");

    dropzone.focus();
    expect(dropzone).toHaveFocus();
    fireEvent.dragEnter(dropzone, { dataTransfer: { files: [] } });
    expect(dropzone.className).toContain("border-brand-600");
    fireEvent.dragLeave(dropzone, { dataTransfer: { files: [] } });
    await user.keyboard(" ");
    expect(click).toHaveBeenCalled();

    await user.upload(input, new File(["image"], "photo.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Upload file" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
    expect(dropzone).toHaveAttribute("aria-invalid", "true");
    expect(dropzone.className).toContain("border-red-400");
  });
});
