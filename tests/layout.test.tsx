// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LayoutGrid } from "lucide-react";
import { AdminSectionCard, AdminSurfaceCard } from "../src/primitives/layout";

describe("admin card primitives", () => {
  it("separates a section heading and supporting description from its content", () => {
    render(
      <AdminSectionCard icon={LayoutGrid} title="Overview" description="Review the current activity">
        <p>Primary content</p>
      </AdminSectionCard>,
    );

    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getAllByText("Review the current activity")).toHaveLength(2);
    expect(screen.getByText("Primary content")).toBeInTheDocument();
  });

  it("uses the shared semantic card surface and radius", () => {
    const { container } = render(<AdminSurfaceCard>Content</AdminSurfaceCard>);

    expect(container.firstElementChild).toHaveClass("rounded-admin-card", "border-admin-border", "bg-admin-surface");
  });
});
