// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminDataTable, useAdminDataTable } from "../src/primitives/data-table";
import type { AdminDataTableColumn } from "../src/primitives/data-table";

type Row = { id: string; name: string; quantity: number };

const rows: Row[] = [
  { id: "a", name: "Espresso machine", quantity: 3 },
  { id: "b", name: "Grinder", quantity: 12 },
  { id: "c", name: "Water filter", quantity: 30 },
  { id: "d", name: "Milk pitcher", quantity: 7 },
];

const columns: AdminDataTableColumn<Row>[] = [
  { key: "name", header: "Product", cell: (row) => row.name, value: (row) => row.name, sortable: true },
  { key: "quantity", header: "In stock", cell: (row) => row.quantity, value: (row) => row.quantity, sortable: true, align: "right" },
];

function Harness({ initialSort = null }: { initialSort?: { key: string; direction: "asc" | "desc" } | null }) {
  const controls = useAdminDataTable<Row>({ rows, columns, initialSort, pageSize: 2 });
  return (
    <div>
      <p data-testid="total">{controls.total}</p>
      <p data-testid="page">{controls.page}</p>
      <ul>
        {controls.rows.map((row) => <li key={row.id}>{row.name}</li>)}
      </ul>
      <button type="button" onClick={() => controls.toggleSort("name")}>Sort by name</button>
      <input aria-label="Search" value={controls.state.search} onChange={(event) => controls.setSearch(event.target.value)} />
      <input aria-label="Stock" value={controls.state.filters.find((filter) => filter.key === "quantity")?.value ?? ""} onChange={(event) => controls.setFilter("quantity", event.target.value)} />
    </div>
  );
}

describe("useAdminDataTable", () => {
  it("sorts, filters, searches and paginates the rows", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByTestId("total")).toHaveTextContent("4");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Sort by name" }));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Espresso machine");
    await user.click(screen.getByRole("button", { name: "Sort by name" }));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Water filter");
    await user.click(screen.getByRole("button", { name: "Sort by name" }));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Espresso machine");
  });

  it("searches over the columns that carry a value", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("textbox", { name: "Search" }), "grind");
    expect(screen.getByTestId("total")).toHaveTextContent("1");
    expect(screen.getByRole("listitem")).toHaveTextContent("Grinder");
  });

  it("filters on a column's value", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("textbox", { name: "Stock" }), "3");
    expect(screen.getByTestId("total")).toHaveTextContent("1");
    expect(screen.getByRole("listitem")).toHaveTextContent("Espresso machine");
  });
});

describe("AdminDataTable", () => {
  it("renders the header, the toolbar and the body", () => {
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        caption="Products"
        filters={[{ key: "quantity", label: "In stock at least" }]}
      />,
    );

    expect(screen.getByRole("table", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Product/ })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "In stock at least" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Grinder" })).toBeInTheDocument();
  });

  it("sorts from the header and says which way the column is sorted", async () => {
    const user = userEvent.setup();
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        pageSize={10}
      />,
    );

    const header = screen.getByRole("button", { name: /Product/ });
    expect(header).toHaveAttribute("aria-pressed", "false");
    await user.click(header);
    expect(header).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Espresso machine");
  });

  it("shows the pager when there is more than one page", () => {
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        pageSize={2}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
  });

  it("leaves the cell rendering to the caller's columns", () => {
    const onSelect = vi.fn();
    render(
      <AdminDataTable<Row>
        columns={[
          {
            key: "name",
            header: "Product",
            cell: (row) => <button type="button" onClick={() => onSelect(row.id)}>{row.name}</button>,
            value: (row) => row.name,
          },
        ]}
        rows={rows}
        getKey={(row) => row.id}
      />,
    );

    expect(screen.getByRole("button", { name: "Grinder" })).toBeInTheDocument();
  });
});
