// SPDX-License-Identifier: MIT
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * The shell pieces read the pathname, the same way the breadcrumbs test does, because the catalogue
 * is a page inside the app router and a test of it is not.
 */
const { pathname, searchParams } = vi.hoisted(() => ({
  pathname: vi.fn<() => string>(() => "/catalog"),
  searchParams: vi.fn<() => URLSearchParams>(() => new URLSearchParams()),
}));
vi.mock("next/navigation.js", () => ({ usePathname: pathname, useSearchParams: searchParams }));

import CatalogPage from "../fixtures/app/catalog/page";
import { catalogPreviews } from "../fixtures/app/catalog/previews";
import { componentCatalog } from "../fixtures/lib/demo-catalog";

/**
 * The page renders the whole package, previews included, so a single render costs seconds rather
 * than milliseconds. A test that let the default budget expire would look like a broken preview.
 */
const BUDGET = 60_000;

const resultCount = () => document.getElementById("catalog-result-count")?.textContent ?? "";

describe("the catalogue page", () => {
  it(
    "renders every component it says it can render, so a preview that stops working is a failure",
    () => {
      const { container } = render(<CatalogPage />);
      const rendered = [...container.querySelectorAll("[data-catalog-preview]")]
        .map((node) => node.getAttribute("data-catalog-preview") ?? "")
        .sort();
      const promised = componentCatalog.filter((entry) => entry.renderable).map((entry) => entry.name).sort();
      expect(rendered).toEqual(promised);
      expect(promised.length).toBeGreaterThan(40);
    },
    BUDGET,
  );

  it(
    "has a preview for every renderable entry and none for the rest, keyed by the export's own name",
    () => {
      const promised = componentCatalog.filter((entry) => entry.renderable).map((entry) => entry.name);
      expect(Object.keys(catalogPreviews).sort()).toEqual([...promised].sort());
      expect(promised.length).toBeLessThan(componentCatalog.length);
    },
    BUDGET,
  );

  it(
    "explains a component it cannot render rather than showing a broken example",
    () => {
      render(<CatalogPage />);
      const entry = componentCatalog.find((item) => item.name === "AdminShell");
      expect(entry?.renderable).toBe(false);
      const card = screen.getByRole("heading", { name: "AdminShell" }).closest("article");
      expect(card).not.toBeNull();
      expect(within(card!).getByText("Not shown here.")).toBeInTheDocument();
      expect(card!.textContent).toContain(entry?.hostNote ?? "");
    },
    BUDGET,
  );

  it(
    "groups the catalogue, with a heading for each category holding entries",
    () => {
      render(<CatalogPage />);
      expect(screen.getByRole("heading", { name: "Actions and buttons" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Internationalisation" })).toBeInTheDocument();
    },
    BUDGET,
  );

  it(
    "narrows the list as a person types, rather than leaving every entry on the page",
    async () => {
      const user = userEvent.setup();
      render(<CatalogPage />);
      const total = componentCatalog.length;
      expect(resultCount()).toMatch(new RegExp(`^Showing ${total} of ${total} exports`));

      await user.type(screen.getByRole("searchbox"), "pagination");

      expect(screen.getByRole("heading", { name: "AdminPagination" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "AdminTable" })).not.toBeInTheDocument();
      expect(Number(resultCount().split(" ")[1])).toBeLessThan(total);
    },
    BUDGET,
  );

  it(
    "finds an entry by a word in its description, not only by its name",
    async () => {
      const user = userEvent.setup();
      render(<CatalogPage />);
      await user.type(screen.getByRole("searchbox"), "shimmering");
      expect(screen.getByRole("heading", { name: "AdminSkeleton" })).toBeInTheDocument();
    },
    BUDGET,
  );

  it(
    "says so when nothing matches, and offers a way back to the whole catalogue",
    async () => {
      const user = userEvent.setup();
      render(<CatalogPage />);
      await user.type(screen.getByRole("searchbox"), "zzzznothing");

      expect(screen.getByText("Nothing in the package matches that.")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Button" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Show everything" }));
      expect(screen.getByRole("heading", { name: "Button" })).toBeInTheDocument();
    },
    BUDGET,
  );

  it(
    "filters by category, and a query inside that category narrows it further",
    async () => {
      const user = userEvent.setup();
      render(<CatalogPage />);
      const mediaChip = screen.getByRole("button", { name: /^Media/ });
      expect(mediaChip).toHaveAttribute("aria-pressed", "false");

      await user.click(mediaChip);
      expect(screen.getByRole("heading", { name: "AdminMediaPlaceholder" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Button" })).not.toBeInTheDocument();
      expect(mediaChip).toHaveAttribute("aria-pressed", "true");

      await user.type(screen.getByRole("searchbox"), "placeholder");
      expect(screen.getByRole("heading", { name: "AdminMediaPlaceholder" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "AdminMediaUpload" })).not.toBeInTheDocument();
    },
    BUDGET,
  );
});
