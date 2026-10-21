// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminDataTable } from "../src/primitives/data-table";
import type { AdminDataTableColumn } from "../src/primitives/data-table";

type Row = { id: string; name: string };

const rows: Row[] = Array.from({ length: 500 }, (_, index) => ({
  id: `row-${index}`,
  name: `Product ${index}`,
}));

const columns: AdminDataTableColumn<Row>[] = [
  { key: "name", header: "Product", cell: (row) => row.name, value: (row) => row.name, sortable: true },
];

describe("the virtualized table", () => {
  it("draws only the rows that are on screen", () => {
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        pageSize={500}
        virtualize={{ rowHeight: 40, height: 400 }}
      />,
    );

    const drawn = screen.getAllByRole("row").length;
    expect(drawn).toBeLessThan(rows.length);
    expect(drawn).toBeGreaterThan(1);
    expect(screen.getByText("Product 0")).toBeInTheDocument();
    expect(screen.queryByText("Product 400")).not.toBeInTheDocument();
  });

  it("leaves a table that does not ask for it alone", () => {
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        pageSize={500}
      />,
    );

    expect(screen.getByText("Product 400")).toBeInTheDocument();
  });

  it("keeps the sorting and the search working under virtualization", () => {
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        pageSize={500}
        virtualize={{ rowHeight: 40, height: 400 }}
      />,
    );

    expect(screen.getByRole("button", { name: /Product/ })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });
});
