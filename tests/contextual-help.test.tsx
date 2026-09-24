// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdminContextualHelp } from "../src/primitives/contextual-help";
import { AdminField, AdminFormSection } from "../src/primitives/field";
import { AdminFormCard } from "../src/primitives/layout";
import { AdminInput } from "../src/primitives/input";

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

  it("does not toggle disclosure parents when activated inside their summaries", async () => {
    const user = userEvent.setup();
    render(
      <>
        <AdminFormSection title="Details" description="Section guidance">
          Section content
        </AdminFormSection>
        <AdminFormCard title="Identity" subtitle="Card guidance" collapsible>
          Card content
        </AdminFormCard>
      </>,
    );

    const sectionDetails = screen.getByText("Section content").closest("details");
    const cardDetails = screen.getByText("Card content").closest("details");
    expect(sectionDetails).toHaveAttribute("open");
    expect(cardDetails).toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Help: Details" }));
    await user.click(screen.getByRole("button", { name: "Help: Identity" }));
    expect(sectionDetails).toHaveAttribute("open");
    expect(cardDetails).toHaveAttribute("open");
  });

  it("does not activate an implicit field label when its help trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <AdminField label="Name" hint="Shown in listings.">
        <AdminInput />
      </AdminField>,
    );
    const trigger = screen.getByRole("button", { name: "Help: Name" });
    const input = screen.getByRole("textbox");
    await user.click(trigger);
    expect(trigger).toHaveFocus();
    expect(input).not.toHaveFocus();
    expect(screen.getByRole("tooltip")).toBeVisible();
  });

  it("keeps the tooltip open while the pointer moves onto its content", async () => {
    const user = userEvent.setup();
    render(<AdminContextualHelp label="About activity">Recent customer activity</AdminContextualHelp>);
    const trigger = screen.getByRole("button", { name: "About activity" });
    await user.hover(trigger);
    const tooltip = screen.getByRole("tooltip");
    await user.hover(tooltip);
    expect(tooltip).toBeVisible();
    expect(tooltip).toHaveClass("before:h-2");
  });
});
