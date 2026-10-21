// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminCommandPalette } from "../src/primitives/command-palette";

const commands = [
  { id: "new", label: "New product", onRun: vi.fn() },
  { id: "settings", label: "Settings", description: "The workspace settings", onRun: vi.fn() },
];

describe("AdminCommandPalette", () => {
  it("opens on the keyboard shortcut", async () => {
    const user = userEvent.setup();
    render(<AdminCommandPalette commands={commands} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("dialog", { name: "Commands" })).toBeInTheDocument();
  });

  it("filters the commands as the reader types", async () => {
    const user = userEvent.setup();
    render(<AdminCommandPalette commands={commands} />);

    await user.click(screen.getByRole("button", { name: "Commands" }));
    await user.type(screen.getByRole("combobox", { name: "Commands" }), "sett");
    expect(await screen.findByRole("option", { name: /Settings/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /New product/ })).not.toBeInTheDocument();
  });

  it("runs the command the reader chooses", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(<AdminCommandPalette commands={[{ id: "new", label: "New product", onRun }]} />);

    await user.click(screen.getByRole("button", { name: "Commands" }));
    await user.type(screen.getByRole("combobox", { name: "Commands" }), "new");
    await screen.findByRole("option", { name: /New product/ });
    await user.keyboard("{Enter}");
    expect(onRun).toHaveBeenCalled();
  });

  it("shows the records the host loads beside the commands", async () => {
    const user = userEvent.setup();
    render(
      <AdminCommandPalette
        commands={commands}
        loadRecords={async (term) => (term ? [{ id: "r1", label: "Order 4412", href: "/orders/4412" }] : [])}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Commands" }));
    await user.type(screen.getByRole("combobox", { name: "Commands" }), "4412");
    expect(await screen.findByRole("option", { name: /Order 4412/ })).toBeInTheDocument();
  });

  it("adds nothing the host did not give it", async () => {
    const user = userEvent.setup();
    render(<AdminCommandPalette commands={[{ id: "new", label: "New product", onRun: vi.fn() }]} />);

    await user.click(screen.getByRole("button", { name: "Commands" }));
    await user.type(screen.getByRole("combobox", { name: "Commands" }), "zzz");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });
});
