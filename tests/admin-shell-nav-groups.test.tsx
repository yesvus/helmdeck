// SPDX-License-Identifier: MIT
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "../src/shell/admin-shell";

const pathname = vi.hoisted(() => ({ value: "/shell/settings/site" }));

vi.mock("next/navigation.js", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const nav = [
  { label: "Workspace", items: [{ label: "Overview", href: "/shell" }] },
  { label: "Settings", items: [{ label: "Site", href: "/shell/settings/site" }] },
];

function renderShell() {
  return render(
    <AdminShell nav={nav} homeHref="/shell" session={{ email: "ada@example.com" }}>
      <p>Page content</p>
    </AdminShell>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("sidebar navigation group state", () => {
  it("opens the group containing the active route, including a non-first group", () => {
    renderShell();

    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Site" })).toBeInTheDocument();
  });

  it("remembers an explicit collapsed preference across a shell remount", async () => {
    const user = userEvent.setup();
    const first = renderShell();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "false");
    first.unmount();

    renderShell();

    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Site" })).toBeNull();
  });

  it("ignores malformed saved state and still opens the active route group", () => {
    window.localStorage.setItem("yesvus:helmdeck:open-nav-groups:v1", "not-json");

    renderShell();

    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Site" })).toBeInTheDocument();
  });
});
