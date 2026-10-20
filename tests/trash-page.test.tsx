// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n/provider";
import { AdminTrashPage, type AdminTrashItem } from "../src/trash/page";

const entries: AdminTrashItem[] = [
  { id: "post-1", resource: "Posts", label: "Old article", deletedAt: "2026-10-19T12:00:00.000Z", deletedBy: "Ada" },
  { id: "product-1", resource: "Products", label: "Old product", deletedAt: "2026-10-18T12:00:00.000Z" },
];

describe("AdminTrashPage", () => {
  it("renders the trash details, optimistically removes restored rows, and confirms permanent purge", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const onPurge = vi.fn();
    render(<AdminTrashPage items={entries} onRestore={onRestore} onPurge={onPurge} />);

    expect(screen.getByRole("heading", { name: "Trash" })).toBeInTheDocument();
    expect(screen.getByText("Posts")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Restore" })[0]);
    expect(onRestore).toHaveBeenCalledWith(entries[0]);
    await waitFor(() => expect(screen.queryByText("Old article")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Record restored.");

    await user.click(screen.getByRole("button", { name: "Purge: Old product" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Purge permanently" }));
    await waitFor(() => expect(onPurge).toHaveBeenCalledWith(entries[1]));
  });

  it("supports localized loading, empty, keyboard-accessible selection and bulk actions", async () => {
    const user = userEvent.setup();
    const onRestoreMany = vi.fn();
    const onPurgeMany = vi.fn();
    const { rerender } = render(
      <AdminI18nProvider locale="tr">
        <AdminTrashPage items={[]} loading onRestore={() => {}} onPurge={() => {}} />
      </AdminI18nProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Çöp kutusu yükleniyor.");

    rerender(
      <AdminI18nProvider locale="tr">
        <AdminTrashPage items={[]} onRestore={() => {}} onPurge={() => {}} />
      </AdminI18nProvider>,
    );
    expect(screen.getByText("Çöp kutusu boş")).toBeInTheDocument();

    rerender(
      <AdminI18nProvider locale="tr">
        <AdminTrashPage items={entries} onRestore={() => {}} onPurge={() => {}} onRestoreMany={onRestoreMany} onPurgeMany={onPurgeMany} />
      </AdminI18nProvider>,
    );
    const firstSelection = screen.getByRole("checkbox", { name: "Seç post-1" });
    firstSelection.focus();
    await user.keyboard(" ");
    expect(screen.getByText("1 kayıt seçildi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Seçilenleri geri yükle" }));
    expect(onRestoreMany).toHaveBeenCalledWith([entries[0]]);
    await user.click(screen.getByRole("checkbox", { name: "Seç product-1" }));
    await user.click(screen.getByRole("button", { name: "Seçilenleri kalıcı olarak sil" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("1 kayıt kalıcı olarak silinecek.");
    await user.click(screen.getByRole("button", { name: "Kalıcı olarak sil" }));
    await waitFor(() => expect(onPurgeMany).toHaveBeenCalledWith([entries[1]]));
  });

  it("restores rows and announces a localized error when a host action fails", async () => {
    const user = userEvent.setup();
    render(
      <AdminI18nProvider locale="tr">
        <AdminTrashPage items={entries} onRestore={async () => { throw new Error("failed"); }} onPurge={() => {}} />
      </AdminI18nProvider>,
    );
    await user.click(screen.getAllByRole("button", { name: "Geri yükle" })[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent("İşlem tamamlanamadı.");
    expect(screen.getByText("Old article")).toBeInTheDocument();
  });
});
