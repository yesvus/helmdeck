// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "../src/shell/admin-shell";
import type { AdminSearchAdapter } from "../src/adapters/search";

const routerPush = vi.fn();
vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ refresh: vi.fn(), push: routerPush, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn()}),
}));
vi.mock("next/link.js", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

afterEach(() => {
  window.localStorage.clear();
  routerPush.mockClear();
});

const groups = [{ label: "Pages", items: [
  { label: "Dashboard", href: "/admin" },
  { label: "Secret", href: "/admin/secret", roles: ["owner"] },
] }];

function openWith(key: string, modifier: "metaKey" | "ctrlKey") {
  render(<AdminShell nav={groups} session={{ email: "reader@example.com", role: "reader" }}><div>Content</div></AdminShell>);
  fireEvent.keyDown(window, { key, [modifier]: true });
}

describe("AdminShell command palette", () => {
  it("opens with Cmd+K", () => {
    openWith("k", "metaKey");
    expect(screen.getByRole("dialog", { name: "Search admin pages" })).toBeInTheDocument();
  });

  it("opens with Ctrl+K", () => {
    openWith("k", "ctrlKey");
    expect(screen.getByRole("dialog", { name: "Search admin pages" })).toBeInTheDocument();
  });

  it("populates permitted routes and excludes role-filtered routes", async () => {
    openWith("k", "ctrlKey");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Dashboard" } });
    await waitFor(() => expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Secret" } });
    await waitFor(() => expect(screen.queryByText("Secret")).not.toBeInTheDocument());
  });

  it("navigates to a permitted route selected from the palette", async () => {
    openWith("k", "ctrlKey");
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Dashboard" } });
    await waitFor(() => expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(1));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(routerPush).toHaveBeenCalledWith("/admin");
  });

  it("loads record search adapter results", async () => {
    const adapter: AdminSearchAdapter = { search: vi.fn(async () => [{
      resource: "orders", resourceLabel: "Orders", resourceId: "42", label: "Order 42", href: "/orders/42",
    }]) };
    render(<AdminShell nav={[]} recordSearchAdapter={adapter}><div>Content</div></AdminShell>);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await screen.findByRole("dialog", { name: "Search admin pages" });
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "42" } });
    await waitFor(() => expect(adapter.search).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Order 42")).toBeInTheDocument());
    expect(adapter.search).toHaveBeenCalledWith("42", expect.any(AbortSignal));
  });

  it("does not mount when commandPalette is false", () => {
    render(<AdminShell nav={[]} commandPalette={false}><div>Content</div></AdminShell>);
    expect(screen.queryByRole("button", { name: "Search admin pages" })).not.toBeInTheDocument();
  });
});
