// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
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
    render(<AdminShell nav={nav}><div>Page content</div></AdminShell>);

    expect(screen.getByRole("banner")).toHaveClass("min-h-[var(--admin-header-height)]");
    expect(screen.getByRole("heading", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByText("Yeni", { selector: '[aria-current="page"]' })).toBeInTheDocument();
  });

  it("shows a page header when the shell topbar is disabled", () => {
    render(
      <AdminShell nav={nav} showTopbar={false}>
        <AdminPageHeader title="New product" action={<button>Save</button>} />
      </AdminShell>,
    );

    const heading = screen.getByRole("heading", { name: "New product" });
    expect(heading.parentElement?.parentElement).toHaveClass("min-h-[var(--admin-header-height)]");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
