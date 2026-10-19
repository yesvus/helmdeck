// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminPermissionsProvider } from "../src/shell/permissions";
import { AdminResourceForm, AdminResourceList, defineAdminResource } from "../src/resources";
import { adminResourceValues } from "../src/resources/registry";
import { createMemoryPersistenceAdapter } from "../src/baseline";
import type { AdminPermissionsAdapter, AdminPersistenceAdapter } from "../src/adapters";

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin/products",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const product = defineAdminResource({
  resource: "products",
  label: "Products",
  columns: [
    { key: "name", header: "Name" },
    { key: "cost", header: "Cost", sortable: true },
  ],
  fields: [
    { name: "name", label: "Name", required: true },
    { name: "cost", label: "Cost", type: "number", readPermission: "products.cost.read" },
  ],
  filters: [{ field: "cost", label: "Cost filter", options: [{ value: "125", label: "125" }] }],
  permissions: { read: "products.read", update: "products.update" },
});

function adapter(role: "editor" | "admin"): AdminPermissionsAdapter {
  return {
    can: vi.fn(async (_permission, context) => context?.field !== "cost" || role === "admin"),
  };
}

function tree(element: React.ReactNode, permissions: AdminPermissionsAdapter) {
  return (
    <AdminI18nProvider locale="en">
      <AdminPermissionsProvider adapter={permissions}>{element}</AdminPermissionsProvider>
    </AdminI18nProvider>
  );
}

describe("field-level resource permissions", () => {
  it("filters list columns and form controls per role", async () => {
    const persistence = createMemoryPersistenceAdapter({
      products: [{ id: "p1", name: "Desk", cost: 125 }],
    });

    const editorList = render(tree(<AdminResourceList definition={product} persistence={persistence} />, adapter("editor")));
    expect(await screen.findByText("Desk")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Cost" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cost filter")).not.toBeInTheDocument();
    editorList.unmount();

    const adminList = render(tree(<AdminResourceList definition={product} persistence={persistence} />, adapter("admin")));
    expect(await screen.findByRole("columnheader", { name: "Cost" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cost" })).toBeInTheDocument();
    expect(screen.getByLabelText("Cost filter")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("125")).toBeInTheDocument();
    adminList.unmount();

    const update = vi.fn(async (_resource: string, _id: string, value: unknown) => ({ id: "p1", ...(value as object) }));
    const formPersistence: AdminPersistenceAdapter = {
      ...persistence,
      update: update as unknown as AdminPersistenceAdapter["update"],
    };
    const editorForm = render(tree(
      <AdminResourceForm definition={product} persistence={formPersistence} id="p1" />,
      adapter("editor"),
    ));
    expect(await screen.findByLabelText("Name")).toHaveValue("Desk");
    expect(screen.queryByLabelText("Cost")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][2]).toMatchObject({ name: "Desk", cost: 125 });
    editorForm.unmount();

    const adminForm = render(tree(<AdminResourceForm definition={product} persistence={persistence} id="p1" />, adapter("admin")));
    expect(await screen.findByLabelText("Cost")).toHaveValue(125);
    adminForm.unmount();
  });

  it("filters restricted fields from form values and revision history", async () => {
    const formData = new FormData();
    formData.set("name", "Desk");
    formData.set("cost", "125");
    expect(adminResourceValues(product, formData, [product.fields[0]!])).toEqual({ name: "Desk" });

    const persistence = createMemoryPersistenceAdapter({
      products: [{ id: "p1", name: "Desk", cost: 125 }],
    });
    const history = {
      revisions: async () => [{
        id: "r1",
        resource: "products",
        recordId: "p1",
        position: 1,
        cause: "Updated",
        restoredFrom: null,
        occurredAt: "2026-10-20T00:00:00.000Z",
        snapshot: { name: "Desk", cost: 125 },
      }],
    };

    render(tree(
      <AdminResourceForm definition={product} persistence={persistence} id="p1" history={history} />,
      adapter("editor"),
    ));
    expect(await screen.findByLabelText("Name")).toHaveValue("Desk");
    await waitFor(() => expect(screen.getByText("Updated")).toBeInTheDocument());
    expect(screen.queryByText("125")).not.toBeInTheDocument();
  });

  it("waits for field checks before allowing a form submission", async () => {
    let resolveFieldPermission!: (allowed: boolean) => void;
    const fieldPermission = new Promise<boolean>((resolve) => {
      resolveFieldPermission = resolve;
    });
    const permissions: AdminPermissionsAdapter = {
      can: vi.fn(async (_permission, context) => context?.field === "cost" ? fieldPermission : true),
    };
    const update = vi.fn(async (_resource: string, _id: string, value: unknown) => ({ id: "p1", ...(value as object) }));
    const persistence: AdminPersistenceAdapter = {
      ...createMemoryPersistenceAdapter({ products: [{ id: "p1", name: "Desk", cost: 125 }] }),
      update: update as unknown as AdminPersistenceAdapter["update"],
    };

    render(tree(<AdminResourceForm definition={product} persistence={persistence} id="p1" />, permissions));
    expect(await screen.findByLabelText("Name")).toHaveValue("Desk");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest("form")!);
    expect(update).not.toHaveBeenCalled();

    resolveFieldPermission(true);
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][2]).toMatchObject({ name: "Desk", cost: 125 });
  });

  it("keeps fields visible when an existing adapter ignores the optional context", async () => {
    const legacyAdapter: AdminPermissionsAdapter = {
      can: async (permission, context?: { resourceId?: string }) => {
        void permission;
        void context;
        return true;
      },
    };
    render(tree(
      <AdminResourceList
        definition={product}
        persistence={createMemoryPersistenceAdapter({ products: [{ id: "p1", name: "Desk", cost: 125 }] })}
      />,
      legacyAdapter,
    ));
    expect(await screen.findByRole("columnheader", { name: "Cost" })).toBeInTheDocument();
  });
});
