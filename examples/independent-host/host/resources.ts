import { defineAdminResource } from "../lib/engine/resources/registry";

export const projectsResource = defineAdminResource({
  resource: "projects",
  path: "/admin/projects",
  label: "Projects",
  singularLabel: "Project",
  columns: [
    { key: "name", header: "Project" },
    { key: "status", header: "Status" },
    { key: "owner", header: "Owner" },
  ],
  fields: [
    { name: "name", label: "Project name", required: true },
    { name: "status", label: "Status", required: true },
    { name: "owner", label: "Owner", required: true },
  ],
  permissions: { read: "records:read", create: "records:write", update: "records:write" },
});

export const ordersResource = defineAdminResource({
  resource: "orders",
  path: "/admin/orders",
  label: "Orders",
  singularLabel: "Order",
  columns: [
    { key: "reference", header: "Order" },
    { key: "customer", header: "Customer" },
    { key: "status", header: "Status" },
  ],
  fields: [
    { name: "reference", label: "Order reference", required: true },
    { name: "customer", label: "Customer", required: true },
    { name: "status", label: "Status", required: true },
  ],
  permissions: { read: "records:read", create: "records:write", update: "records:write" },
});
