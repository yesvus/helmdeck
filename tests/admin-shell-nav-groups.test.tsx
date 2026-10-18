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

function renderShell(groups = nav) {
  return render(
    <AdminShell nav={groups} homeHref="/shell" session={{ email: "ada@example.com" }}>
      <p>Page content</p>
    </AdminShell>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  pathname.value = "/shell/settings/site";
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

  it.each(["null", "[]", JSON.stringify({ Settings: "false" })])(
    "ignores saved state with an invalid shape: %s",
    (saved) => {
      window.localStorage.setItem("yesvus:helmdeck:open-nav-groups:v1", saved);

      renderShell();

      expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("link", { name: "Site" })).toBeInTheDocument();
    },
  );

  it("does not persist default closed groups as explicit preferences", () => {
    pathname.value = "/shell";
    renderShell();

    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-expanded", "false");
    expect(JSON.parse(window.localStorage.getItem("yesvus:helmdeck:open-nav-groups:v1") ?? "null")).toEqual({});
    pathname.value = "/shell/settings/site";
  });

  it("lets a newly visible group collapse on its first click", async () => {
    const user = userEvent.setup();
    const view = renderShell();
    view.rerender(
      <AdminShell
        nav={[...nav, { label: "Reports", items: [{ label: "Monthly", href: "/shell/reports" }] }]}
        homeHref="/shell"
        session={{ email: "ada@example.com" }}
      >
        <p>Page content</p>
      </AdminShell>,
    );

    const reports = screen.getByRole("button", { name: "Reports" });
    expect(reports).toHaveAttribute("aria-expanded", "true");
    await user.click(reports);
    expect(reports).toHaveAttribute("aria-expanded", "false");
  });

  it("remembers sidebar width collapsed preference across remounts", async () => {
    const user = userEvent.setup();
    const view = renderShell();

    const collapseButton = screen.getByRole("button", { name: /collapse sidebar/i });
    await user.click(collapseButton);

    expect(window.localStorage.getItem("yesvus:helmdeck:sidebar-collapsed:v1")).toBe("true");
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();

    view.unmount();
    renderShell();

    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
  });
});
