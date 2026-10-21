// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdminDataTable } from "../src/primitives/data-table";
import type { AdminDataTableColumn } from "../src/primitives/data-table";

type Row = { id: string; name: string; team: string; quantity: number };

const rows: Row[] = [
  { id: "a", name: "Espresso machine", team: "Kitchen", quantity: 3 },
  { id: "b", name: "Grinder", team: "Kitchen", quantity: 12 },
  { id: "c", name: "Water filter", team: "Plumbing", quantity: 30 },
];

const columns: AdminDataTableColumn<Row>[] = [
  { key: "name", header: "Product", cell: (row) => row.name, value: (row) => row.name },
  { key: "team", header: "Team", cell: (row) => row.team, value: (row) => row.team },
  { key: "quantity", header: "In stock", cell: (row) => row.quantity, value: (row) => row.quantity },
];

describe("the row features", () => {
  it("expands a row into a detail across the table", async () => {
    const user = userEvent.setup();
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        expandable={(row) => <p>{`The detail of ${row.name}`}</p>}
        expandLabel="Show the detail"
        collapseLabel="Hide the detail"
      />,
    );

    const toggle = screen.getAllByRole("button", { name: "Show the detail" })[0]!;
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByText("The detail of Espresso machine")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Hide the detail" })[0]).toHaveAttribute("aria-expanded", "true");
  });

  it("groups the rows and heads each group", () => {
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        groupBy="team"
        groupHeader={(value) => `The ${value} team`}
      />,
    );

    expect(screen.getByText("The Kitchen team")).toBeInTheDocument();
    expect(screen.getByText("The Plumbing team")).toBeInTheDocument();
  });

  it("adds a subtotal to a group", () => {
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        groupBy="team"
        groupHeader={(value) => `The ${value} team`}
        subtotal={(group) => `${group.length} products`}
      />,
    );

    expect(screen.getByText("2 products")).toBeInTheDocument();
    expect(screen.getByText("1 products")).toBeInTheDocument();
  });
});
