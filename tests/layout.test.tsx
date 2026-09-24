// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LayoutGrid } from "lucide-react";
import { AdminSectionCard, AdminSurfaceCard } from "../src/primitives/layout";

describe("admin card primitives", () => {
  it("exposes section descriptions through contextual help only", () => {
    render(
      <AdminSectionCard icon={LayoutGrid} title="Overview" description="Review the current activity">
        <p>Primary content</p>
      </AdminSectionCard>,
    );

    expect(screen.getByRole("heading", { name: /^Overview/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help: Overview" })).toBeInTheDocument();
    expect(screen.getAllByText("Review the current activity")).toHaveLength(1);
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Review the current activity");
    expect(screen.getByText("Primary content")).toBeInTheDocument();
  });

  it("uses the shared semantic card surface and radius", () => {
    const { container } = render(<AdminSurfaceCard>Content</AdminSurfaceCard>);

    expect(container.firstElementChild).toHaveClass("rounded-admin-card", "border-admin-border", "bg-admin-surface");
  });
});
