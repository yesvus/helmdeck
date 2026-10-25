// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "../src/shell/admin-shell";

const mockRefresh = vi.fn();
vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ refresh: mockRefresh }),
}));

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

const nav = [{ label: "Workspace", items: [{ label: "Dashboard", href: "/admin" }] }];

describe("top bar reload button", () => {
  it("does not render reload button by default", () => {
    render(<AdminShell nav={nav}><div>Content</div></AdminShell>);
    expect(screen.queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
  });

  it("renders reload button and triggers router.refresh when clicked", async () => {
    render(<AdminShell nav={nav} showReloadButton={true}><div>Content</div></AdminShell>);
    const button = screen.getByRole("button", { name: "Reload" });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("calls host onReload callback and disables while reloading", async () => {
    let finishReload!: () => void;
    const onReload = vi.fn(() => new Promise<void>((resolve) => { finishReload = resolve; }));

    render(<AdminShell nav={nav} showReloadButton={true} onReload={onReload}><div>Content</div></AdminShell>);
    const button = screen.getByRole("button", { name: "Reload" });

    fireEvent.click(button);
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    finishReload();
    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "false");
    });
  });
});
