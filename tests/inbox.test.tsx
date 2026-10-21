// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminInboxList, AdminInboxMessage } from "../src/inbox/views";
import { AdminI18nProvider } from "../src/i18n/provider";
import type { AdminInboxItem, AdminInboxMessageData } from "../src/inbox/views";

const unread: AdminInboxMessageData = {
  id: "msg-1",
  sender: "Ada Lovelace <ada@example.com>",
  subject: "A question",
  preview: "Could you help me?",
  body: "Could you help me with the product?",
  receivedAt: "2026-10-20T10:00:00.000Z",
  status: "unread",
};

const read: AdminInboxItem = { ...unread, id: "msg-3", status: "read" };
const archived: AdminInboxItem = { ...unread, id: "msg-2", status: "archived" };

describe("AdminInboxList", () => {
  it("shows statuses and invokes host callbacks for open, read, and archive", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onMarkRead = vi.fn();
    const onArchive = vi.fn();
    render(
      <AdminInboxList
        messages={[unread, read, archived]}
        onOpen={onOpen}
        onMarkRead={onMarkRead}
        onArchive={onArchive}
      />,
    );

    expect(screen.getByText("Unread")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "A question" })[0]);
    await user.click(screen.getByRole("button", { name: "Mark as read" }));
    const archiveButtons = screen.getAllByRole("button", { name: "Archive" });
    expect(archiveButtons).toHaveLength(2);
    await user.click(archiveButtons[0]);

    expect(onOpen).toHaveBeenCalledWith(unread);
    expect(onMarkRead).toHaveBeenCalledWith(unread);
    expect(onArchive).toHaveBeenCalledWith(unread);
  });

  it("renders localized Turkish empty, loading, and pagination states", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(
      <AdminI18nProvider locale="tr">
        <AdminInboxList messages={[]} page={1} pageCount={3} onPageChange={onPageChange} />
      </AdminI18nProvider>,
    );
    expect(screen.getByText("Henüz mesaj yok")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sonraki" }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    rerender(
      <AdminI18nProvider locale="tr">
        <AdminInboxList messages={[]} loading />
      </AdminI18nProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Mesajlar yükleniyor.");
  });

  it("reports a rejected host action", async () => {
    const user = userEvent.setup();
    render(<AdminInboxList messages={[unread]} onMarkRead={async () => { throw new Error("failed"); }} />);
    await user.click(screen.getByRole("button", { name: "Mark as read" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This message could not be updated.");
  });
});

describe("AdminInboxMessage", () => {
  it("shows the message and offers localized status actions", async () => {
    const user = userEvent.setup();
    const onMarkRead = vi.fn();
    const onArchive = vi.fn();
    render(
      <AdminI18nProvider locale="tr">
        <AdminInboxMessage message={unread} onMarkRead={onMarkRead} onArchive={onArchive} />
      </AdminI18nProvider>,
    );

    expect(screen.getByText(unread.body)).toBeInTheDocument();
    expect(screen.getByText("Okunmadı")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Okundu olarak işaretle" }));
    await user.click(screen.getByRole("button", { name: "Arşivle" }));
    expect(onMarkRead).toHaveBeenCalledWith(unread);
    expect(onArchive).toHaveBeenCalledWith(unread);
  });
});
