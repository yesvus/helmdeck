import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminTable, AdminTableBulkActions, AdminTableRowActions, Button, useAdminTableSelection } from "../src/primitives/index.js";

type Row = { id: number; name: string };

function SelectableTable({ onSelectionChange = vi.fn() }: { onSelectionChange?: (keys: Set<string | number>) => void }) {
  const rows: Row[] = [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }];
  return (
    <AdminTable
      rows={rows}
      getKey={(row) => row.id}
      selection={{ selectedKeys: new Set([1]), onSelectionChange, label: "Select", selectAllLabel: "Select all" }}
      columns={[{ key: "name", header: "Name", cell: (row) => row.name }]}
    />
  );
}

describe("table action primitives", () => {
  it("supports selecting individual rows and all visible rows", () => {
    const onSelectionChange = vi.fn();
    render(<SelectableTable onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 2" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set([1, 2]));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set([1, 2]));
  });

  it("disables select-all when the table has no rows", () => {
    render(
      <AdminTable
        rows={[] as Row[]}
        getKey={(row) => row.id}
        selection={{ selectedKeys: new Set(), onSelectionChange: vi.fn(), label: "Select", selectAllLabel: "Select all" }}
        columns={[{ key: "name", header: "Name", cell: (row) => row.name }]}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Select all" })).toBeDisabled();
  });

  it("announces selected count and leaves bulk behavior with the host", () => {
    const action = vi.fn();
    render(
      <AdminTableBulkActions selectedCount={2} selectedCountLabel={(count) => `${count} selected`}>
        <Button onClick={action}>Archive</Button>
      </AdminTableBulkActions>,
    );
    expect(screen.getByText("2 selected")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(action).toHaveBeenCalledOnce();
  });

  it("keeps destructive actions in a separately spaced group", () => {
    render(<AdminTableRowActions label="Record actions" destructive={<Button>Delete</Button>}><Button>Edit</Button></AdminTableRowActions>);
    expect(screen.getByRole("group", { name: "Record actions" })).toHaveTextContent("EditDelete");
  });

  it("provides a controlled selection hook", () => {
    function Harness() {
      const selection = useAdminTableSelection(["first"]);
      return <output>{selection.selectedKeys.size}</output>;
    }
    render(<Harness />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
