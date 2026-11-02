// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineAdminPlugin } from "../src/admin/plugin";
import type { AdminNavGroup } from "../src/adapters/nav";
import { AdminPermissionsProvider } from "../src/shell/permissions";
import { useAdminPermittedNav } from "../src/shell/permitted-nav";

const widget = (id: string) => ({ id, title: id, sizes: ["sm"] as const, render: () => null });

describe("defineAdminPlugin", () => {
  it("composes contributions in declaration order", () => {
    const first = defineAdminPlugin({ id: "first", navGroups: [{ label: "Content", items: [{ href: "/a", label: "A" }] }], widgets: [widget("a")] });
    const second = defineAdminPlugin({ navGroups: [{ label: "Reports", items: [{ href: "/b", label: "B" }] }], widgets: [widget("b")] });
    const composed = defineAdminPlugin([first, second]);

    expect(composed.navGroups.map(({ label }) => label)).toEqual(["Content", "Reports"]);
    expect(composed.widgets.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(composed.settingsGroups).toEqual([]);
    expect(composed.paletteEntries).toEqual([]);
  });

  it("refuses duplicate IDs across contribution types", () => {
    expect(() => defineAdminPlugin([
      { widgets: [widget("same")] },
      { widgets: [widget("same")] },
    ])).toThrow(/widgets.*same/);
    expect(() => defineAdminPlugin([
      { paletteEntries: [{ id: "same", label: "A", onRun: vi.fn() }] },
      { paletteEntries: [{ id: "same", label: "B", onRun: vi.fn() }] },
    ])).toThrow(/palette entries.*same/);
  });

  it("passes plugin navigation through the host permission hook", async () => {
    const groups: AdminNavGroup[] = defineAdminPlugin({ navGroups: [{
      label: "Plugin",
      items: [
        { href: "/allowed", label: "Allowed", permission: "plugin.read" },
        { href: "/denied", label: "Denied", permission: "plugin.write" },
      ],
    }] }).navGroups;
    function Probe() {
      const { groups: permitted } = useAdminPermittedNav(groups);
      return createElement("div", null, ...permitted.flatMap((group) => group.items).map((item) => createElement("span", { key: item.href }, item.label)));
    }
    render(createElement(AdminPermissionsProvider, { adapter: { can: async (permission) => permission === "plugin.read" }, children: createElement(Probe) }));

    expect(await screen.findByText("Allowed")).toBeInTheDocument();
    expect(screen.queryByText("Denied")).not.toBeInTheDocument();
  });
});
