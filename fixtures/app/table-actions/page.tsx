"use client";

import { useState } from "react";
import { AdminTable, AdminTableBulkActions, AdminTableRowActions, Button, useAdminTableSelection } from "@yesvus/helmdeck";
import { Frame } from "../../components/frame";

const rows = [
  { id: "north", name: "Northstar", status: "Active" },
  { id: "harbor", name: "Harbor", status: "Draft" },
  { id: "summit", name: "Summit", status: "Archived" },
];

export default function TableActionsPage() {
  const { selectedKeys, setSelectedKeys } = useAdminTableSelection<string>();
  const [message, setMessage] = useState("Choose rows to enable bulk actions.");
  const selection = {
    selectedKeys,
    onSelectionChange: (keys: Set<string | number>) => setSelectedKeys(new Set([...keys].map(String))),
    label: "Select row",
    selectAllLabel: "Select all rows",
  };

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-10">
      <h1 className="text-2xl font-bold">Table actions and selection</h1>
      <Frame title="Bulk actions">
        <AdminTableBulkActions selectedCount={selectedKeys.size} selectedCountLabel={(count) => `${count} selected`}>
          <Button size="sm" onClick={() => setMessage(`Published ${selectedKeys.size} records.`)}>Publish</Button>
          <Button size="sm" variant="outline" onClick={() => setMessage(`Host confirmation required before deleting ${selectedKeys.size} records.`)}>Delete selected</Button>
        </AdminTableBulkActions>
        <p aria-live="polite" className="mt-2 text-sm text-zinc-600">{message}</p>
      </Frame>
      <Frame title="Responsive row actions">
        <AdminTable
          caption="Example records with selectable rows and responsive actions"
          rows={rows}
          getKey={(row) => row.id}
          selection={selection}
          columns={[
            { key: "name", header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
            { key: "status", header: "Status", cell: (row) => row.status },
            {
              key: "actions",
              header: "Actions",
              className: "min-w-48",
              cell: (row) => (
                <AdminTableRowActions label={`Actions for ${row.name}`} destructive={<Button size="sm" variant="destructive">Delete</Button>}>
                  <Button size="sm" variant="outline">Edit</Button>
                  <Button size="sm" variant="secondary">Open</Button>
                </AdminTableRowActions>
              ),
            },
          ]}
        />
      </Frame>
    </main>
  );
}
