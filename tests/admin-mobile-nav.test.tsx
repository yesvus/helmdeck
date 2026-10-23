// SPDX-License-Identifier: MIT
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "../src/shell/admin-shell";

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/shell",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("mobile navigation session actions", () => {
  it("reaches the profile, the site and the sign-out action from the more sheet", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <AdminShell
        nav={[
          { label: "Workspace", items: [{ label: "Overview", href: "/shell", mobilePrimary: true }] },
          { label: "Settings", items: [{ label: "Site", href: "/shell/settings/site" }] },
        ]}
        homeHref="/shell"
        session={{ email: "ada@example.com" }}
        onLogout={onLogout}
      >
        <p>Page content</p>
      </AdminShell>,
    );

    await user.click(screen.getByText("More"));
    const sheet = screen.getByText("More").closest("details")!;

    expect(within(sheet).getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/shell/profile");
    expect(within(sheet).getByRole("link", { name: "View site" })).toHaveAttribute("href", "/");

    const signOut = within(sheet).getByRole("button", { name: "Sign out" });
    await user.click(signOut);

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(signOut.closest("details")).not.toHaveAttribute("open");
  });

  it("shows the sheet for a host that marks no secondary item either", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <AdminShell
        nav={[{ label: "Workspace", items: [{ label: "Overview", href: "/shell", mobilePrimary: true }] }]}
        homeHref="/shell"
        session={{ email: "ada@example.com" }}
        onLogout={onLogout}
      >
        <p>Page content</p>
      </AdminShell>,
    );

    await user.click(screen.getByText("More"));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("stays out of the way when a host marks no primary item", () => {
    render(
      <AdminShell
        nav={[{ label: "Workspace", items: [{ label: "Overview", href: "/shell" }] }]}
        homeHref="/shell"
        session={{ email: "ada@example.com" }}
        onLogout={vi.fn()}
      >
        <p>Page content</p>
      </AdminShell>,
    );

    expect(screen.queryByText("More")).not.toBeInTheDocument();
  });

  it("shows no bar when there is neither a destination nor a session", () => {
    render(
      <AdminShell nav={[]} homeHref="/shell">
        <p>Page content</p>
      </AdminShell>,
    );

    expect(screen.queryByText("More")).not.toBeInTheDocument();
  });
});
