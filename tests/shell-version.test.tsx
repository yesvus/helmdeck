// SPDX-License-Identifier: MIT
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminI18nProvider, HELMDECK_VERSION, type AdminSession } from "@yesvus/helmdeck";
import { ShellClient } from "../fixtures/app/(helmdeck)/shell/shell-client";
import { sampleNav } from "../fixtures/nav";

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/shell",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("../fixtures/app/(helmdeck)/shell/sign-out-action", () => ({ signOutAction: vi.fn() }));
vi.mock("../fixtures/lib/demo-permissions", () => ({
  demoPermissionsAdapter: () => ({ can: () => true }),
}));

const session: AdminSession = { email: "ada@example.com", name: "Ada Lovelace", role: "admin" };

function renderShell() {
  return render(
    <AdminI18nProvider locale="en">
      <ShellClient nav={sampleNav} session={session} accent="#b45309" siteName="Northstar Supply">
        <p>Page content</p>
      </ShellClient>
    </AdminI18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("the shell keeps version metadata out of navigation", () => {
  it("does not put the package version in the sidebar", () => {
    renderShell();

    const sidebar = within(screen.getByRole("complementary"));
    expect(sidebar.queryByText(`v${HELMDECK_VERSION}`)).toBeNull();
    expect(sidebar.getByRole("navigation")).toBeInTheDocument();
  });

  it("keeps navigation and the content region intact", () => {
    renderShell();

    const sidebar = within(screen.getByRole("complementary"));
    expect(sidebar.getAllByRole("link").length).toBeGreaterThan(1);
    expect(screen.getByRole("region", { name: /\S/ })).toHaveTextContent("Page content");
  });
});
