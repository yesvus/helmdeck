// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminDataTable, useAdminDataTable } from "../src/primitives/data-table";
import type { AdminDataTableColumn, AdminDataTableState } from "../src/primitives/data-table";

type Row = { id: string; name: string; quantity: number };

const rows: Row[] = [
  { id: "a", name: "Espresso machine", quantity: 3 },
  { id: "b", name: "Grinder", quantity: 12 },
];

const columns: AdminDataTableColumn<Row>[] = [
  { key: "name", header: "Product", cell: (row) => row.name, value: (row) => row.name },
  { key: "quantity", header: "In stock", cell: (row) => row.quantity, value: (row) => row.quantity },
];

function Controlled() {
  const [state, setState] = useState<AdminDataTableState | undefined>(undefined);
  const controls = useAdminDataTable<Row>({ rows, columns, state, onStateChange: setState });
  return (
    <div>
      <p data-testid="visible">{controls.visibleColumns.map((column) => column.key).join(",")}</p>
      <p data-testid="pinned">{controls.state.columns?.quantity?.pinned ?? "none"}</p>
    </div>
  );
}

describe("the column settings", () => {
  it("hides and shows a column", async () => {
    const user = userEvent.setup();
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        columnSettings
      />,
    );

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("checkbox", { name: "Show In stock" }));
    expect(screen.queryByRole("columnheader", { name: /In stock/ })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Product/ })).toBeInTheDocument();
  });

  it("pins a column to an edge and the table honours it", async () => {
    const user = userEvent.setup();
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        columnSettings
      />,
    );

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(screen.getByRole("button", { name: "Pin In stock" }));
    expect(screen.getByRole("columnheader", { name: /In stock/ })).toHaveClass("sticky");
  });

  it("reads the column state back so the host can hold it", () => {
    render(<Controlled />);

    expect(screen.getByTestId("visible")).toHaveTextContent("name,quantity");
    expect(screen.getByTestId("pinned")).toHaveTextContent("none");
  });

  it("restores the column state the host gave it", () => {
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        initialColumns={{
          name: { visible: true, order: 0 },
          quantity: { visible: false, order: 1 },
        }}
      />,
    );

    expect(screen.queryByRole("columnheader", { name: /In stock/ })).not.toBeInTheDocument();
  });

  it("resizes a column with the keyboard on the handle", async () => {
    const user = userEvent.setup();
    const onStateChange = vi.fn();
    render(
      <AdminDataTable<Row>
        columns={columns}
        rows={rows}
        getKey={(row) => row.id}
        columnSettings
        onStateChange={onStateChange}
      />,
    );

    const handle = screen.getByRole("separator", { name: "Resize Product" });
    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(onStateChange).toHaveBeenCalled();
    const next = onStateChange.mock.calls.at(-1)?.[0] as AdminDataTableState;
    expect(next.columns?.name?.size).toBeGreaterThan(0);
  });

});
