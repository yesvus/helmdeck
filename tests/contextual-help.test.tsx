// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdminContextualHelp } from "../src/primitives/contextual-help";

describe("AdminContextualHelp", () => {
  it("exposes a labelled description on keyboard focus and dismisses with Escape", async () => {
    const user = userEvent.setup();
    render(<AdminContextualHelp label="About activity">Recent customer activity</AdminContextualHelp>);
    const trigger = screen.getByRole("button", { name: "About activity" });
    expect(trigger).toHaveAttribute("aria-describedby");
    await user.tab();
    const tooltip = screen.getByRole("tooltip");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(tooltip).toHaveTextContent("Recent customer activity");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger).toHaveClass("focus-visible:outline-2");
  });

  it("opens from touch activation", async () => {
    const user = userEvent.setup();
    render(<AdminContextualHelp label="About metrics">Metric definitions</AdminContextualHelp>);
    const trigger = screen.getByRole("button", { name: "About metrics" });
    await user.click(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Metric definitions");
    await user.click(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
