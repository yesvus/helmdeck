// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminNotificationCenter } from "../src/shell/admin-notification-center";

describe("AdminNotificationCenter", () => {
  it("renders the notification bell button with unread count in aria-label", () => {
    render(
      <AdminNotificationCenter
        items={[
          { id: "1", title: "Order received", read: false },
          { id: "2", title: "Shipment delayed", read: false },
          { id: "3", title: "Profile updated", read: true },
        ]}
      />,
    );

    const button = screen.getByRole("button", { name: "Notifications, 2 unread" });
    expect(button).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("caps the badge at 99+ when unreadCount exceeds 99", () => {
    render(<AdminNotificationCenter unreadCount={150} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("opens the panel on click and dismisses on Escape, returning focus to button", async () => {
    const user = userEvent.setup();
    render(
      <AdminNotificationCenter
        items={[{ id: "1", title: "New message", read: false }]}
      />,
    );

    const button = screen.getByRole("button", { name: "Notifications, 1 unread" });
    await user.click(button);
    expect(screen.getByText("New message")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("New message")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(button);
  });

  it("calls onMarkRead callback when a notification is clicked", async () => {
    const onMarkRead = vi.fn();
    const notification = { id: "1", title: "Alert", read: false };
    render(
      <AdminNotificationCenter
        items={[notification]}
        onMarkRead={onMarkRead}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(screen.getByText("Alert"));

    expect(onMarkRead).toHaveBeenCalledWith(notification);
  });
});
