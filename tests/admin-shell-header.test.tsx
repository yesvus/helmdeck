// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminShell } from "../src/shell/admin-shell";
import { AdminPageHeader } from "../src/shell/admin-page-header";
import { AdminShellProvider } from "../src/shell/context";
import type { AdminShellContextValue } from "../src/shell/context";

vi.mock("next/navigation", () => ({ usePathname: () => "/shell/products/new" }));

const shellValue = { currentPageTitle: "Catalog", nav: [] } as AdminShellContextValue;
const nav = [{
  label: "Workspace",
  items: [
    { label: "Dashboard", href: "/shell" },
    { label: "Products", href: "/shell/products" },
  ],
}];

describe("persistent shell page context", () => {
  it("keeps the shell title and leaves page headers with actions only", () => {
    render(
      <AdminShellProvider value={shellValue}>
        <AdminPageHeader title="Duplicate catalog title" action={<button>Save</button>} />
      </AdminShellProvider>,
    );

    expect(screen.queryByRole("heading", { name: "Duplicate catalog title" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("uses the matched navigation label and shared header height", () => {
    const contentScrollRef = vi.fn();
    render(<AdminShell nav={nav} contentScrollRef={contentScrollRef}><div>Page content</div></AdminShell>);

    expect(screen.getByRole("main")).toHaveClass("h-[100dvh]", "overflow-hidden");
    expect(screen.getByRole("banner")).toHaveClass("min-h-[var(--admin-header-height)]");
    expect(screen.getByRole("banner")).toHaveClass("shrink-0");
    const scrollRegion = screen.getByRole("region", { name: "Products" });
    expect(scrollRegion).toHaveAttribute("tabindex", "0");
    expect(contentScrollRef).toHaveBeenCalledWith(scrollRegion);
    expect(screen.getByText("Page content").closest(".overflow-y-auto")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
    );
    expect(screen.getByRole("heading", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByText("Yeni", { selector: '[aria-current="page"]' })).toBeInTheDocument();
  });

  it("lets the active navigation group collapse while keeping its destination identified", () => {
    const groupedNav = [{
      label: "Workspace",
      icon: "folder" as const,
      items: [
        { label: "Products", href: "/shell/products" },
        { label: "New product", href: "/shell/products/new" },
      ],
    }];
    const { container } = render(<AdminShell nav={groupedNav}><div>Page content</div></AdminShell>);

    const groupButton = screen.getByRole("button", { name: "Workspace" });
    expect(groupButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(groupButton);

    expect(groupButton).toHaveAttribute("aria-expanded", "false");
    expect(groupButton).toHaveTextContent("New product");
    const activeLink = container.querySelector('a[href="/shell/products/new"]');
    expect(activeLink).toHaveAttribute("aria-current", "page");
    expect(activeLink?.parentElement).toHaveClass("hidden");
    expect(screen.getByRole("main")).toHaveStyle({ "--admin-sidebar-current": "var(--admin-sidebar-width, 240px)" });
  });

  it("shows a page header when the shell topbar is disabled", () => {
    render(
      <AdminShell nav={nav} showTopbar={false}>
        <AdminPageHeader title="New product" action={<button>Save</button>} />
      </AdminShell>,
    );

    const heading = screen.getByRole("heading", { name: "New product" });
    expect(heading.parentElement?.parentElement).toHaveClass("min-h-[var(--admin-header-height)]");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.getByText("New product").closest(".overflow-y-auto")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
