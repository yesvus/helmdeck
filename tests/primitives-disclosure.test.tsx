// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminAccordion, AdminTabs } from "../src/primitives/disclosure";
import { AdminFormSection } from "../src/primitives/field";

describe("AdminTabs", () => {
  const items = [
    { id: "general", label: "General", children: <p>General panel</p> },
    { id: "billing", label: "Billing", children: <p>Billing panel</p> },
    { id: "locked", label: "Locked", children: <p>Locked panel</p>, disabled: true },
  ];

  it("shows the first tab's panel and marks it as selected", () => {
    render(<AdminTabs items={items} label="Settings sections" />);

    expect(screen.getByRole("tablist")).toHaveAttribute("aria-label", "Settings sections");
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Billing" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByText("General panel")).toBeVisible();
    expect(screen.getByText("Billing panel")).not.toBeVisible();
  });

  it("moves between the tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<AdminTabs items={items} onValueChange={onValueChange} />);

    await user.tab();
    expect(screen.getByRole("tab", { name: "General" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(onValueChange).toHaveBeenCalledWith("billing");
    expect(screen.getByRole("tab", { name: "Billing" })).toHaveFocus();
    expect(screen.getByText("Billing panel")).toBeVisible();
    await user.keyboard("{End}");
    expect(onValueChange).toHaveBeenLastCalledWith("billing");
    await user.keyboard("{Home}");
    expect(onValueChange).toHaveBeenLastCalledWith("general");
  });

  it("does not move onto a disabled tab", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<AdminTabs items={items} defaultTabId="billing" onValueChange={onValueChange} />);

    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(onValueChange).toHaveBeenCalledWith("general");
    expect(screen.getByRole("tab", { name: "Locked" })).toBeDisabled();
  });

  it("keeps the panel tied to its tab", () => {
    render(<AdminTabs items={items} />);
    const tab = screen.getByRole("tab", { name: "General" });
    const panel = screen.getByRole("tabpanel");
    expect(tab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
  });
});

describe("AdminAccordion", () => {
  const items = [
    { id: "details", title: "Details", children: <p>Details panel</p> },
    { id: "delivery", title: "Delivery", children: <p>Delivery panel</p> },
  ];

  it("keeps one panel open at a time when it is in single mode", async () => {
    const user = userEvent.setup();
    render(<AdminAccordion items={items} defaultOpenIds={["details"]} />);

    const details = screen.getByText("Details").closest("details")!;
    const delivery = screen.getByText("Delivery").closest("details")!;
    expect(details).toHaveAttribute("open");
    expect(delivery).not.toHaveAttribute("open");

    await user.click(screen.getByText("Delivery"));
    expect(screen.getByText("Delivery").closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Details").closest("details")).not.toHaveAttribute("open");
  });

  it("keeps several panels open at once when it is in multiple mode", async () => {
    const user = userEvent.setup();
    render(<AdminAccordion items={items} type="multiple" defaultOpenIds={["details"]} />);

    await user.click(screen.getByText("Delivery"));
    expect(screen.getByText("Delivery").closest("details")).toHaveAttribute("open");
    expect(screen.getByText("Details").closest("details")).toHaveAttribute("open");
  });

  it("reports which panels are open", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AdminAccordion items={items} onOpenChange={onOpenChange} />);

    await user.click(screen.getByText("Details"));
    expect(onOpenChange).toHaveBeenLastCalledWith(["details"]);
    await user.click(screen.getByText("Delivery"));
    expect(onOpenChange).toHaveBeenLastCalledWith(["delivery"]);
  });

  it("opens and closes from its summary, which is a native disclosure and so takes the keyboard", async () => {
    const user = userEvent.setup();
    render(<AdminAccordion items={items} />);

    const summary = screen.getByText("Details").closest("summary")!;
    // The summary of a native disclosure is what a browser opens with the enter and space keys.
    // jsdom does not implement that activation, so the click stands in for it here.
    await user.click(summary);
    expect(screen.getByText("Details").closest("details")).toHaveAttribute("open");
    await user.click(summary);
    expect(screen.getByText("Details").closest("details")).not.toHaveAttribute("open");
  });
});

describe("AdminFormSection", () => {
  it("renders through the accordion primitive", () => {
    render(<AdminFormSection title="Details" description="What the product is">Panel</AdminFormSection>);

    const details = screen.getByText("Panel").closest("details");
    expect(details).toHaveAttribute("open");
    expect(details).toHaveClass("rounded-admin-card", "bg-zinc-50");
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help: Details" })).toBeInTheDocument();
  });

  it("starts closed when it is asked to", () => {
    render(<AdminFormSection title="Details" defaultOpen={false}>Panel</AdminFormSection>);
    expect(screen.getByText("Panel").closest("details")).not.toHaveAttribute("open");
  });
});
