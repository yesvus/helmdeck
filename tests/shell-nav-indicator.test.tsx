// SPDX-License-Identifier: MIT
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminNavLink } from "../src/shell/admin-nav";
import { AdminProfileMenu } from "../src/shell/admin-profile-menu";

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/shell",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

afterEach(() => {
  cleanup();
});

describe("shell nav indicator stacking", () => {
  it("layers the profile menu popup above the nav indicator when open", async () => {
    const user = userEvent.setup();
    render(<AdminProfileMenu email="ada@example.com" profileHref="/shell/profile" />);

    await user.click(screen.getByRole("button"));

    const popup = screen.getByRole("link", { name: "Profile" }).parentElement;
    expect(popup).toHaveClass("z-20");
  });

  it("keeps the active indicator span at z-10", () => {
    const { container } = render(
      <AdminI18nProvider>
        <AdminNavLink item={{ label: "Dashboard", href: "/shell" }} hideIcon activeIndicator />
      </AdminI18nProvider>,
    );

    const indicator = container.querySelector("span[aria-hidden='true']");
    expect(indicator).toHaveClass("z-10");
  });
});