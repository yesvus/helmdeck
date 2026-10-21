// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AdminAvatar,
  AdminBadge,
  AdminBreadcrumb,
  AdminProgress,
  AdminSeparator,
} from "../src/primitives/display";

describe("AdminBadge", () => {
  it("renders its content with the tone it was given", () => {
    render(<AdminBadge tone="warning">Review</AdminBadge>);
    const badge = screen.getByText("Review");
    expect(badge).toHaveAttribute("data-tone", "warning");
    expect(badge).toHaveClass("rounded-md", "text-xs");
  });
});

describe("AdminAvatar", () => {
  it("falls back to initials when there is no picture", () => {
    render(<AdminAvatar name="Ada Lovelace" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("takes the initials from a single word", () => {
    render(<AdminAvatar name="Prince" />);
    expect(screen.getByText("PR")).toBeInTheDocument();
  });

  it("shows the picture when there is one", () => {
    const { container } = render(<AdminAvatar name="Ada Lovelace" src="/ada.png" />);
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "/ada.png");
    expect(image).toHaveAttribute("alt", "");
  });

  it("falls back to initials when the picture does not load", () => {
    const { container } = render(<AdminAvatar name="Ada Lovelace" src="/missing.png" />);
    fireEvent.error(container.querySelector("img")!);
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("reads out the alternative text when there is no picture to show", () => {
    const { container } = render(<AdminAvatar name="Ada Lovelace" alt="Ada Lovelace" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Ada Lovelace")).toHaveClass("sr-only");
    expect(screen.getByText("AL")).toHaveAttribute("aria-hidden", "true");
  });

  it("tries a new source after an earlier one failed", () => {
    const { container, rerender } = render(<AdminAvatar name="Ada Lovelace" src="/missing.png" />);
    fireEvent.error(container.querySelector("img")!);
    expect(screen.getByText("AL")).toBeInTheDocument();

    rerender(<AdminAvatar name="Ada Lovelace" src="/ada.png" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/ada.png");
  });
});

describe("AdminProgress", () => {
  it("keeps a number that is not finite out of its values", () => {
    render(<AdminProgress value={Number.NaN} max={Number.POSITIVE_INFINITY} label="Import progress" />);
    const bar = screen.getByRole("progressbar", { name: "Import progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "0%");
  });
  it("reads its value out to assistive technology", () => {
    render(<AdminProgress value={40} label="Import progress" />);
    const bar = screen.getByRole("progressbar", { name: "Import progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "40%");
  });

  it("keeps the value inside its bounds", () => {
    render(<AdminProgress value={140} max={100} label="Import progress" />);
    const bar = screen.getByRole("progressbar", { name: "Import progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "100%");
  });
});

describe("AdminSeparator", () => {
  it("says that it is a separator and which way it runs", () => {
    const { rerender } = render(<AdminSeparator />);
    expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
    rerender(<AdminSeparator orientation="vertical" />);
    expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
  });
});

describe("AdminBreadcrumb", () => {
  it("marks the current page and links the rest", () => {
    render(
      <AdminBreadcrumb
        items={[
          { label: "Products", href: "/shell/products" },
          { label: "Drafts" },
        ]}
      />,
    );

    expect(screen.getByRole("navigation")).toHaveAttribute("aria-label", "Breadcrumb");
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("href", "/shell/products");
    expect(screen.getByText("Drafts")).toHaveAttribute("aria-current", "page");
  });

  it("hides a trail of one item when it is asked to", () => {
    const { container } = render(<AdminBreadcrumb items={[{ label: "Dashboard" }]} hideSingle />);
    expect(container.querySelector(".sr-only")).toHaveTextContent("Dashboard");
    expect(screen.getByText("Dashboard")).toHaveAttribute("aria-current", "page");
  });

  it("marks the item the caller names as the current one", () => {
    render(
      <AdminBreadcrumb
        items={[
          { label: "Products", current: true },
          { label: "Drafts" },
        ]}
      />,
    );
    expect(screen.getByText("Products")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Drafts")).not.toHaveAttribute("aria-current");
  });
});
