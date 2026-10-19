// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminSelect } from "../src/primitives/select";
import {
  AdminSkeleton,
  AdminContentSkeleton,
  AdminLoadingState,
  AdminTableSkeleton,
  AdminFormSkeleton,
  AdminCardGridSkeleton,
  AdminDashboardSkeleton,
} from "../src/primitives/skeleton";
import { AdminStatusPill } from "../src/primitives/status-pill";

describe("AdminSkeleton", () => {
  it("defaults to the semantic admin-skeleton token", () => {
    const { container } = render(<AdminSkeleton data-testid="skeleton" />);
    const el = container.firstElementChild;
    expect(el).toHaveClass("bg-admin-skeleton", "animate-pulse", "rounded-md");
  });

  it("keeps placeholders hidden from assistive technology even when callers pass attributes", () => {
    const { getByTestId } = render(<AdminSkeleton data-testid="skeleton" aria-hidden={false} />);
    expect(getByTestId("skeleton")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders AdminContentSkeleton placeholders", () => {
    const { container } = render(<AdminContentSkeleton />);
    const placeholders = container.querySelectorAll(".animate-pulse");
    expect(placeholders.length).toBeGreaterThan(5);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("provides an accessible loading announcement around decorative placeholders", () => {
    render(
      <AdminLoadingState label="Loading products">
        <AdminTableSkeleton rowCount={2} columnCount={3} />
      </AdminLoadingState>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading products");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveClass("space-y-6");
    expect(screen.getByRole("status").firstElementChild).toHaveClass("sr-only");
    expect(screen.getByRole("status").lastElementChild).toHaveAttribute("aria-hidden", "true");
    const table = screen.getByRole("status").lastElementChild;
    expect(table?.querySelectorAll(".animate-pulse")).toHaveLength(9);
    expect(table?.firstElementChild?.firstElementChild).toHaveClass("max-w-40");
    expect(table?.lastElementChild?.firstElementChild?.firstElementChild).toHaveClass("max-w-40");
  });

  it("bounds invalid skeleton counts before rendering placeholders", () => {
    const { container } = render(<AdminTableSkeleton rowCount={Number.POSITIVE_INFINITY} columnCount={1.5} />);
    const table = container.firstElementChild;

    expect(table?.children[0]?.children).toHaveLength(1);
    expect(table?.children[1]?.children).toHaveLength(5);

    const bounded = render(<AdminTableSkeleton rowCount={25} columnCount={-3} />).container.firstElementChild;
    expect(bounded?.children[0]?.children).toHaveLength(0);
    expect(bounded?.children[1]?.children).toHaveLength(20);
  });

  it("renders shared form, card-grid, and dashboard shapes", () => {
    const { container } = render(
      <>
        <AdminFormSkeleton fieldCount={2} />
        <AdminCardGridSkeleton cardCount={3} />
        <AdminDashboardSkeleton />
      </>,
    );

    expect(container.children).toHaveLength(3);
    expect(Array.from(container.children, (element) => element.getAttribute("aria-hidden"))).toEqual([
      "true",
      "true",
      "true",
    ]);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(20);
  });
});

describe("AdminStatusPill", () => {
  it("renders with default neutral tone and label", () => {
    render(<AdminStatusPill label="Pending" />);
    const pill = screen.getByText("Pending");
    expect(pill).toHaveAttribute("data-tone", "neutral");
    expect(pill).toHaveClass("bg-zinc-100", "rounded-full");
  });

  it("applies requested tone classes", () => {
    const { rerender } = render(<AdminStatusPill tone="success" label="Active" />);
    expect(screen.getByText("Active")).toHaveAttribute("data-tone", "success");
    expect(screen.getByText("Active")).toHaveClass("bg-emerald-100");

    rerender(<AdminStatusPill tone="warning" label="Review" />);
    expect(screen.getByText("Review")).toHaveAttribute("data-tone", "warning");
    expect(screen.getByText("Review")).toHaveClass("bg-amber-100");

    rerender(<AdminStatusPill tone="error" label="Failed" />);
    expect(screen.getByText("Failed")).toHaveAttribute("data-tone", "error");
    expect(screen.getByText("Failed")).toHaveClass("bg-red-100");
  });
});

describe("AdminSelect", () => {
  it("forwards attributes and renders options with the shared input styling", () => {
    render(
      <AdminSelect aria-label="Role selector" defaultValue="admin">
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </AdminSelect>,
    );

    const select = screen.getByRole("combobox", { name: "Role selector" });
    expect(select).toHaveValue("admin");
    expect(select).toHaveClass("border-zinc-300", "rounded-lg");
  });
});
