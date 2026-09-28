// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminPagination } from "../src/primitives/pagination";

function renderPagination(ui: React.ReactElement) {
  return render(<AdminI18nProvider locale="en">{ui}</AdminI18nProvider>);
}

describe("AdminPagination", () => {
  it("renders nothing when there is only one page or zero pages", () => {
    const { container: single } = renderPagination(
      <AdminPagination page={1} pageCount={1} onPageChange={vi.fn()} />,
    );
    expect(single).toBeEmptyDOMElement();

    const { container: zero } = renderPagination(
      <AdminPagination page={1} pageCount={0} onPageChange={vi.fn()} />,
    );
    expect(zero).toBeEmptyDOMElement();
  });

  it("renders all pages when pageCount is 7 or less", () => {
    const onPageChange = vi.fn();
    renderPagination(<AdminPagination page={3} pageCount={5} onPageChange={onPageChange} />);

    for (let i = 1; i <= 5; i += 1) {
      expect(screen.getByRole("button", { name: `Page ${i}` })).toBeInTheDocument();
    }
    expect(screen.queryByText("More pages")).not.toBeInTheDocument();

    const currentButton = screen.getByRole("button", { name: "Page 3" });
    expect(currentButton).toHaveAttribute("aria-current", "page");
  });

  it("disables previous button on the first page and next button on the last page", () => {
    const onPageChange = vi.fn();
    const { rerender } = renderPagination(
      <AdminPagination page={1} pageCount={10} onPageChange={onPageChange} />,
    );

    const prevButton = screen.getByRole("button", { name: "Previous" });
    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(prevButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    rerender(
      <AdminI18nProvider locale="en">
        <AdminPagination page={10} pageCount={10} onPageChange={onPageChange} />
      </AdminI18nProvider>,
    );
    expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("invokes onPageChange when clicking navigation or page buttons", () => {
    const onPageChange = vi.fn();
    renderPagination(<AdminPagination page={3} pageCount={5} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);

    fireEvent.click(screen.getByRole("button", { name: "Page 5" }));
    expect(onPageChange).toHaveBeenLastCalledWith(5);
  });

  it("renders accessible ellipsis with audible screen-reader text", () => {
    renderPagination(<AdminPagination page={5} pageCount={10} onPageChange={vi.fn()} />);

    const moreAnnouncements = screen.getAllByText("More pages");
    expect(moreAnnouncements.length).toBeGreaterThanOrEqual(1);

    for (const more of moreAnnouncements) {
      const item = more.closest("li");
      expect(item).not.toHaveAttribute("aria-hidden");
      expect(more).toHaveClass("sr-only");
    }
  });
});
