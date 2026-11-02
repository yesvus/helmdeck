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
    const first = defineAdminPlugin({ id: "first", navGroups: [{ label: "Content", items: [{ href: "/a", label: "A" }] }], widgets: [widget("a")], settingsGroups: [{ key: "general", title: "General", settings: [{ key: "site-name", label: "Site name", type: "text" }] }], paletteEntries: [{ id: "open-a", label: "Open A", onRun: vi.fn() }] });
    const second = defineAdminPlugin({ navGroups: [{ label: "Reports", items: [{ href: "/b", label: "B" }] }], widgets: [widget("b")], settingsGroups: [{ key: "reports", title: "Reports", settings: [{ key: "report-email", label: "Report email", type: "text" }] }], paletteEntries: [{ id: "open-b", label: "Open B", onRun: vi.fn() }] });
    const composed = defineAdminPlugin([first, second]);

    expect(composed.navGroups.map(({ label }) => label)).toEqual(["Content", "Reports"]);
    expect(composed.widgets.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(composed.settingsGroups.map(({ key }) => key)).toEqual(["general", "reports"]);
    expect(composed.settingsGroups.flatMap(({ settings }) => settings.map(({ key }) => key))).toEqual(["site-name", "report-email"]);
    expect(composed.paletteEntries.map(({ id }) => id)).toEqual(["open-a", "open-b"]);
  });

  it("refuses duplicate IDs across contribution types", () => {
    expect(() => defineAdminPlugin([{ navGroups: [{ id: "same", label: "A", items: [] }] }, { navGroups: [{ id: "same", label: "B", items: [] }] }])).toThrow(/nav groups.*same/);
    expect(() => defineAdminPlugin([{ navGroups: [{ label: "same", items: [] }] }, { navGroups: [{ id: "same", label: "Other", items: [] }] }])).toThrow(/nav groups.*same/);
    expect(() => defineAdminPlugin([{ settingsGroups: [{ key: "same", title: "A", settings: [] }] }, { settingsGroups: [{ key: "same", title: "B", settings: [] }] }])).toThrow(/settings groups.*same/);
    expect(() => defineAdminPlugin([{ settingsGroups: [{ key: "a", title: "A", settings: [{ key: "same", label: "One", type: "text" }] }] }, { settingsGroups: [{ key: "b", title: "B", settings: [{ key: "same", label: "Two", type: "text" }] }] }])).toThrow(/settings.*same/);
    expect(() => defineAdminPlugin([
      { widgets: [widget("same")] },
      { widgets: [widget("same")] },
    ])).toThrow(/widgets.*same/);
    expect(() => defineAdminPlugin([
      { paletteEntries: [{ id: "same", label: "A", onRun: vi.fn() }] },
      { paletteEntries: [{ id: "same", label: "B", onRun: vi.fn() }] },
    ])).toThrow(/palette entries.*same/);
  });

  it("rejects malformed optional collections and settings entries", () => {
    expect(() => defineAdminPlugin({ navGroups: {} } as never)).toThrow(/navGroups.*array/);
    expect(() => defineAdminPlugin({ navGroups: [{ label: "  ", items: [] }] })).toThrow(/non-empty id or label/);
    expect(() => defineAdminPlugin({ settingsGroups: [{ key: "broken", title: "Broken", settings: {} }] } as never)).toThrow(/settings array/);
    expect(() => defineAdminPlugin({ settingsGroups: [{ key: "broken", title: "Broken", settings: [null] }] } as never)).toThrow(/without a key/);
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
