// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminDataTable, AdminTableEmptyState, useAdminDataTable } from "../src/primitives/data-table";
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

  it("toggles row selection internally and reports it when the caller holds none", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        selectedKeys={undefined}
        selectable
        onSelectionChange={onSelectionChange}
        selectionLabel="Select"
        selectAllLabel="Select all"
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select b" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["b"]));
    // A second click returns the row to unselected rather than adding a duplicate key.
    await user.click(screen.getByRole("checkbox", { name: "Select b" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set());
  });

  it("renders the caller's selection state instead of an internal one", () => {
    const onSelectionChange = vi.fn();
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        selection={{ selectedKeys: new Set(["a"]), onSelectionChange, label: "Select", selectAllLabel: "Select all" }}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Select a" })).toBeChecked();
  });

  it("offers a reload button that calls the caller's reload", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn(async () => undefined);
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        showReloadButton
        onReload={onReload}
        reloadLabel="Refresh"
      />,
    );

    const reload = screen.getByRole("button", { name: "Refresh" });
    await user.click(reload);
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("gives each column a filter input when the caller asks for column filters", async () => {
    const user = userEvent.setup();
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        columnFilters
      />,
    );

    await user.type(screen.getByRole("searchbox", { name: "Product filter" }), "Grinder");
    expect(screen.getByRole("cell", { name: "Grinder" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Espresso machine" })).not.toBeInTheDocument();
  });

  it("honours a server-provided page count instead of counting the rows", () => {
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        serverSide
        total={40}
        pageCount={4}
        pageSize={4}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    // The rows alone fill one page, so a fourth page button only appears when the caller's
    // page count, not the row count, drives the pager.
    expect(screen.getByRole("button", { name: "Page 4" })).toBeInTheDocument();
  });

  it("drops the card border when the caller asks for a flat layout", () => {
    const { rerender } = render(
      <AdminDataTable<Row> columns={columns} rows={rows} getKey={(row) => row.id} />,
    );
    const card = screen.getByRole("table").closest("div");
    expect(card).toHaveClass("rounded-admin-card");

    rerender(
      <AdminDataTable<Row> columns={columns} rows={rows} getKey={(row) => row.id} variant="flat" />,
    );
    expect(screen.getByRole("table").closest("div")).not.toHaveClass("rounded-admin-card");
  });

  it("falls back to bare empty text and renders a contextual empty state when given one", () => {
    const { rerender } = render(
      <AdminDataTable<Row> columns={columns} rows={[]} getKey={(row) => row.id} />,
    );
    expect(screen.getByText("No results.")).toBeInTheDocument();

    rerender(
      <AdminDataTable<Row>
        columns={columns}
        rows={[]}
        getKey={(row) => row.id}
        empty={<AdminTableEmptyState icon={<span data-testid="empty-icon" />} title="Nothing here" description="Add rows to begin" action={<button type="button">Add</button>} />}
      />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Add rows to begin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});
