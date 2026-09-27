// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminSelect } from "../src/primitives/select";
import { AdminSkeleton, AdminContentSkeleton } from "../src/primitives/skeleton";
import { AdminStatusPill } from "../src/primitives/status-pill";

describe("AdminSkeleton", () => {
  it("defaults to the semantic admin-skeleton token", () => {
    const { container } = render(<AdminSkeleton data-testid="skeleton" />);
    const el = container.firstElementChild;
    expect(el).toHaveClass("bg-admin-skeleton", "animate-pulse", "rounded-md");
  });

  it("renders AdminContentSkeleton placeholders", () => {
    const { container } = render(<AdminContentSkeleton />);
    const placeholders = container.querySelectorAll(".animate-pulse");
    expect(placeholders.length).toBeGreaterThan(5);
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
