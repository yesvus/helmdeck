import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminTable, AdminTableActionButton, AdminTableBulkActions, AdminTableRowActions, Button, useAdminTableSelection } from "../src/primitives/index.js";

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

  it("renders consistently sized labeled actions for each variant", () => {
    render(
      <div>
        <AdminTableActionButton label="Edit" icon={<svg />} variant="primary" />
        <AdminTableActionButton label="Open" icon={<svg />} variant="secondary" actionSize="comfortable" />
        <AdminTableActionButton label="Delete" icon={<svg />} variant="destructive" />
      </div>,
    );
    expect(screen.getByRole("button", { name: "Edit" })).toHaveClass("h-8", "px-3");
    expect(screen.getByRole("button", { name: "Open" })).toHaveClass("h-9", "px-4", "border-zinc-200");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("bg-admin-danger-action");
  });

  it("provides an accessible label and tooltip for icon-only actions", () => {
    render(<AdminTableActionButton label="Open record" icon={<svg />} iconOnly />);
    expect(screen.getByRole("button", { name: "Open record" })).toHaveAttribute("aria-describedby");
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Open record");
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
