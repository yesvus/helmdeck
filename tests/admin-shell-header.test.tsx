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

  it("expands only the first navigation category on initial render", () => {
    render(
      <AdminShell nav={[
        { label: "Overview", items: [{ label: "Dashboard", href: "/shell" }] },
        { label: "Content", items: [{ label: "Products", href: "/shell/products" }] },
      ]}>
        <div>Page content</div>
      </AdminShell>,
    );

    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Content" })).toHaveAttribute("aria-expanded", "false");
  });

  it("lets the active group collapse without showing the current page in the group header", () => {
    const groupedNav = [{
      label: "Workspace",
      icon: "folder" as const,
      items: [
        { label: "Products", href: "/shell/products", icon: "product" },
        { label: "New product", href: "/shell/products/new", icon: "article" },
      ],
    }];
    const { container } = render(<AdminShell nav={groupedNav}><div>Page content</div></AdminShell>);

    const groupButton = screen.getByRole("button", { name: "Workspace" });
    expect(groupButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(groupButton);

    expect(groupButton).toHaveAttribute("aria-expanded", "false");
    expect(groupButton).not.toHaveTextContent("New product");
    const activeLink = container.querySelector('a[href="/shell/products/new"]');
    expect(activeLink).toHaveAttribute("aria-current", "page");
    expect(activeLink?.closest("[aria-hidden='true']")).toHaveAttribute("inert");
    expect(screen.getByRole("main")).toHaveStyle({ "--admin-sidebar-current": "var(--admin-sidebar-width, 240px)" });

    fireEvent.click(groupButton);
    const expandedActiveLink = container.querySelector('a[href="/shell/products/new"]');
    const expandedInactiveLink = container.querySelector('a[href="/shell/products"]');
    expect(expandedActiveLink).toHaveClass("min-h-8");
    expect(expandedActiveLink).not.toHaveClass("font-bold");
    expect(expandedActiveLink?.querySelector("svg")).not.toBeInTheDocument();
    const expandedGroup = expandedActiveLink?.closest("[aria-hidden='false']");
    expect(expandedGroup).toHaveClass("border-l");
    expect(expandedGroup?.querySelector("span[aria-hidden='true']")).toHaveClass("bg-brand-500", "-left-[10px]");
    expect(expandedInactiveLink).toHaveClass("min-h-8");
    expect(expandedInactiveLink?.querySelector("svg")).not.toBeInTheDocument();
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
