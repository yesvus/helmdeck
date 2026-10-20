// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminUserManagementPage } from "../src/users/page";
import { AdminI18nProvider } from "../src/i18n/provider";

const users = [
  {
    id: "user-1",
    email: "editor@example.test",
    name: "Aylin Editor",
    role: "editor",
    disabled: false,
    createdAt: "2026-10-01T12:00:00.000Z",
    lastActivityAt: "2026-10-20T12:00:00.000Z",
    recentActivity: [
      {
        action: "update",
        resource: "posts",
        resourceId: "post-1",
        occurredAt: "2026-10-20T12:00:00.000Z",
        actor: { email: "editor@example.test", role: "editor" },
        metadata: { fields: ["title"] },
      },
    ],
    sessions: [
      { id: "session-1", accountId: "user-1", email: "editor@example.test", expiresAt: 1_800_000_000, current: false, disabled: false },
      { id: "session-2", accountId: "user-1", email: "editor@example.test", expiresAt: 1_800_000_000, current: true, disabled: false },
    ],
  },
  { id: "user-2", email: "admin@example.test", role: "admin", disabled: true },
];

describe("AdminUserManagementPage", () => {
  it("shows user history and sends host-owned access and password operations", async () => {
    const user = userEvent.setup();
    const onSetRole = vi.fn().mockResolvedValue(undefined);
    const onSetDisabled = vi.fn().mockResolvedValue(undefined);
    const onResetPassword = vi.fn().mockResolvedValue(undefined);
    const onEndSession = vi.fn().mockResolvedValue(undefined);
    const onUpdated = vi.fn();

    render(
      <AdminI18nProvider locale="tr">
        <AdminUserManagementPage
          users={users}
          roles={["admin", "editor"]}
          onSetRole={onSetRole}
          onSetDisabled={onSetDisabled}
          onResetPassword={onResetPassword}
          onEndSession={onEndSession}
          onUpdated={onUpdated}
        />
      </AdminI18nProvider>,
    );

    expect(screen.getByText(/Son etkinlik:/)).toBeInTheDocument();
    expect(screen.getByText("Son işlemler")).toBeInTheDocument();
    expect(screen.getAllByText("update")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Oturumu sonlandır" })).toBeInTheDocument();
    expect(screen.getByText(/Bu oturum/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hesabı devre dışı bırak" }));
    expect(screen.getByText("Bu hesabı devre dışı bırakmak etkin oturumları sonlandırır.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Devre dışı bırakmayı onayla" }));
    expect(onSetDisabled).toHaveBeenCalledWith("user-1", true);

    await user.click(screen.getByRole("button", { name: "Parola sıfırlama gönder" }));
    expect(onResetPassword).toHaveBeenCalledWith("user-1");
    await user.click(screen.getByRole("button", { name: "Oturumu sonlandır" }));
    expect(onEndSession).toHaveBeenCalledWith("session-1");
    expect(onUpdated).toHaveBeenCalledTimes(3);
  });

  it("renders a host's role vocabulary and supports clearing the assigned role", async () => {
    const user = userEvent.setup();
    const onSetRole = vi.fn().mockResolvedValue(undefined);
    render(<AdminUserManagementPage users={users.slice(0, 1)} roles={["admin", "editor"]} onSetRole={onSetRole} />);

    await user.selectOptions(screen.getByLabelText("Role"), "");
    await user.click(screen.getByRole("button", { name: "Save role" }));
    expect(onSetRole).toHaveBeenCalledWith("user-1", "");
  });

  it("renders an empty state when no accounts are available", () => {
    render(<AdminUserManagementPage users={[]} roles={[]} />);
    expect(screen.getByText("No accounts to manage.")).toBeInTheDocument();
  });
});
