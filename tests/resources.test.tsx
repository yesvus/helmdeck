// SPDX-License-Identifier: MIT
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminPermissionsProvider } from "../src/shell/permissions";
import {
  AdminResourceForm,
  AdminResourceList,
  adminResourcePath,
  adminResourceRecordId,
  adminResourceValues,
  defineAdminResource,
} from "../src/resources/index";
import { createMemoryPersistenceAdapter } from "../src/baseline";
import type { AdminPersistenceAdapter } from "../src/adapters/index";

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin/posts",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const posts = defineAdminResource({
  resource: "posts",
  label: "Posts",
  singularLabel: "Post",
  columns: [
    { key: "title", header: "Title" },
    { key: "status", header: "Status" },
  ],
  fields: [
    { name: "title", label: "Title", required: true },
    { name: "body", label: "Body", type: "textarea" },
    { name: "views", label: "Views", type: "number" },
    { name: "published", label: "Published", type: "checkbox" },
  ],
  permissions: {
    read: "posts.read",
    create: "posts.create",
    update: "posts.update",
    delete: "posts.delete",
  },
});

function allowAll() {
  return { can: vi.fn(async () => true) };
}

function wrap(element: React.ReactElement, adapter = allowAll()) {
  return render(
    <AdminI18nProvider locale="en">
      <AdminPermissionsProvider adapter={adapter}>{element}</AdminPermissionsProvider>
    </AdminI18nProvider>,
  );
}

describe("defineAdminResource", () => {
  it("returns the definition unchanged", () => {
    expect(defineAdminResource(posts)).toBe(posts);
  });

  it("refuses a duplicate column, which would render two cells of the same name", () => {
    expect(() =>
      defineAdminResource({
        resource: "posts",
        label: "Posts",
        columns: [{ key: "title", header: "A" }, { key: "title", header: "B" }],
        fields: [],
      }),
    ).toThrow(/title/);
  });

  it("refuses a duplicate field, which would submit one value twice", () => {
    expect(() =>
      defineAdminResource({
        resource: "posts",
        label: "Posts",
        columns: [],
        fields: [{ name: "title", label: "A" }, { name: "title", label: "B" }],
      }),
    ).toThrow(/title/);
  });
});

describe("adminResourcePath", () => {
  it("uses an explicit path when the resource declares one", () => {
    expect(adminResourcePath(defineAdminResource({ resource: "posts", label: "P", columns: [], fields: [], path: "articles" }))).toBe("articles");
  });

  it("derives a route segment from the resource name", () => {
    expect(adminResourcePath(posts)).toBe("posts");
    expect(
      adminResourcePath(defineAdminResource({ resource: "blogPosts", label: "P", columns: [], fields: [] })),
    ).toBe("blog-posts");
    expect(
      adminResourcePath(defineAdminResource({ resource: "blog_posts", label: "P", columns: [], fields: [] })),
    ).toBe("blog-posts");
  });
});

describe("adminResourceRecordId", () => {
  it("accepts a string or a number id", () => {
    expect(adminResourceRecordId("p1")).toBe("p1");
    expect(adminResourceRecordId(7)).toBe("7");
    expect(adminResourceRecordId({ id: "p2" })).toBe("p2");
    expect(adminResourceRecordId({ id: 9 })).toBe("9");
  });

  it("refuses a record it could never address", () => {
    expect(() => adminResourceRecordId({})).toThrow(/id/);
    expect(() => adminResourceRecordId(null)).toThrow(/id/);
    expect(() => adminResourceRecordId("")).toThrow(/id/);
  });
});

describe("adminResourceValues", () => {
  it("reads only the declared fields, so a hand-edited request cannot add one", () => {
    const form = new FormData();
    form.set("title", "Hello");
    form.set("role", "admin");

    expect(adminResourceValues(posts, form)).toEqual({ title: "Hello", body: null, views: null, published: false });
  });

  it("parses a number field rather than sending a string", () => {
    const form = new FormData();
    form.set("views", "42");
    expect(adminResourceValues(posts, form).views).toBe(42);
  });

  it("keeps an empty number as null rather than zero", () => {
    const form = new FormData();
    form.set("views", "");
    expect(adminResourceValues(posts, form).views).toBeNull();
  });

  it("reads a checkbox as a boolean", () => {
    const form = new FormData();
    form.set("published", "on");
    expect(adminResourceValues(posts, form).published).toBe(true);
  });

  it("uses a field's own parse when it declares one", () => {
    const definition = defineAdminResource({
      resource: "posts",
      label: "Posts",
      columns: [],
      fields: [
        {
          name: "tags",
          label: "Tags",
          parse: (raw) =>
            String(raw ?? "")
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean),
        },
      ],
    });
    const form = new FormData();
    form.set("tags", "a, b ,c");

    expect(adminResourceValues(definition, form).tags).toEqual(["a", "b", "c"]);
  });
});

describe("AdminResourceList", () => {
  it("renders a row per record, with the declared columns", async () => {
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "First", status: "draft" });
    await db.create("posts", { title: "Second", status: "live" });

    wrap(<AdminResourceList definition={posts} persistence={db} />);

    expect(await screen.findByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("live")).toBeInTheDocument();
  });

  it("shows the empty state rather than a bare table", async () => {
    const db = createMemoryPersistenceAdapter();
    wrap(<AdminResourceList definition={posts} persistence={db} />);

    expect(await screen.findByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("uses a column's own formatter when it declares one", async () => {
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "First", views: 1200 });
    const definition = defineAdminResource({
      ...posts,
      columns: [{ key: "views", header: "Views", format: (value) => `${value} views` }],
    });

    wrap(<AdminResourceList definition={definition} persistence={db} />);
    expect(await screen.findByText("1200 views")).toBeInTheDocument();
  });

  it("offers create only when the resource declares the permission and it is held", async () => {
    const db = createMemoryPersistenceAdapter();
    wrap(<AdminResourceList definition={posts} persistence={db} />);
    expect(await screen.findByRole("link", { name: "New" })).toHaveAttribute("href", "posts/new");

    cleanup();
    const denied = { can: vi.fn(async (permission: string) => permission !== "posts.create") };
    wrap(<AdminResourceList definition={posts} persistence={db} />, denied);
    await waitFor(() => expect(screen.queryByRole("link", { name: "New" })).not.toBeInTheDocument());
  });

  it("offers no create control at all when the resource declares no create permission", async () => {
    const db = createMemoryPersistenceAdapter();
    const definition = defineAdminResource({ ...posts, permissions: { read: "posts.read" } });
    wrap(<AdminResourceList definition={definition} persistence={db} />);

    await waitFor(() => expect(screen.getByText("Nothing here yet.")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "New" })).not.toBeInTheDocument();
  });

  it("links each row to its detail route", async () => {
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "First" });
    wrap(<AdminResourceList definition={posts} persistence={db} />);

    expect(await screen.findByRole("link", { name: "Edit: mem_1" })).toHaveAttribute("href", "posts/mem_1");
  });

  it("deletes a record and drops it from the table", async () => {
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "First" });
    wrap(<AdminResourceList definition={posts} persistence={db} />);

    const remove = await screen.findByRole("button", { name: "Delete: mem_1" });
    remove.click();

    await waitFor(() => expect(screen.queryByText("First")).not.toBeInTheDocument());
    expect(await db.query("posts")).toEqual([]);
  });

  it("offers the delete control only while the delete permission is held", async () => {
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "First" });
    const denied = { can: vi.fn(async (permission: string) => permission !== "posts.delete") };

    wrap(<AdminResourceList definition={posts} persistence={db} />, denied);

    await screen.findByText("First");
    // Awaited, because a guard renders nothing while it is still resolving, so the row text
    // appearing says nothing about whether the controls have been decided yet.
    expect(await screen.findByRole("link", { name: "Edit: mem_1" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete: mem_1" })).not.toBeInTheDocument());
  });

  it("offers the edit control only while the update permission is held", async () => {
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "First" });
    const denied = { can: vi.fn(async (permission: string) => permission !== "posts.update") };

    wrap(<AdminResourceList definition={posts} persistence={db} />, denied);

    await screen.findByText("First");
    expect(await screen.findByRole("button", { name: "Delete: mem_1" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("link", { name: "Edit: mem_1" })).not.toBeInTheDocument());
  });

  it("offers no row controls when the resource declares none of those permissions", async () => {
    // The inner guard would hide them anyway, so this is about not rendering a guard per
    // button for a resource that opted into nothing.
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "First" });
    const ungated = defineAdminResource({ ...posts, permissions: { read: "posts.read" } });
    wrap(<AdminResourceList definition={ungated} persistence={db} />);

    await screen.findByText("First");
    expect(screen.queryByRole("link", { name: "Edit: mem_1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete: mem_1" })).not.toBeInTheDocument();
  });

  it("reports a failed load instead of showing an empty table as if it were empty", async () => {
    const broken: AdminPersistenceAdapter = {
      ...createMemoryPersistenceAdapter(),
      query: vi.fn().mockRejectedValue(new Error("database down")),
    };
    wrap(<AdminResourceList definition={posts} persistence={broken} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("These records could not be loaded.");
    // The empty state would read as "there is nothing here", which is a different claim.
    expect(screen.queryByText("Nothing here yet.")).not.toBeInTheDocument();
  });

  it("leaves out a record it could not address rather than rendering it unlinked", async () => {
    // A row with no usable id cannot be edited or deleted, so listing it would offer controls
    // that cannot work.
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "Addressable" });
    const withOrphan: AdminPersistenceAdapter = {
      ...db,
      async query<T>(resource: string): Promise<T[]> {
        const rows = await db.query<Record<string, unknown>>(resource);
        return [...rows, { title: "Orphan" }] as T[];
      },
    };

    wrap(<AdminResourceList definition={posts} persistence={withOrphan} />);
    expect(await screen.findByText("Addressable")).toBeInTheDocument();
    expect(screen.queryByText("Orphan")).not.toBeInTheDocument();
  });
});

describe("AdminResourceForm", () => {
  it("renders a control per declared field, labelled and linked", async () => {
    const db = createMemoryPersistenceAdapter();
    wrap(<AdminResourceForm definition={posts} persistence={db} />);

    expect(await screen.findByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Body").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Views")).toHaveAttribute("type", "number");
    expect(screen.getByLabelText("Published")).toHaveAttribute("type", "checkbox");
  });

  it("creates a record from the submitted form", async () => {
    const db = createMemoryPersistenceAdapter();
    wrap(<AdminResourceForm definition={posts} persistence={db} onSaved={vi.fn()} />);

    const title = await screen.findByLabelText("Title");
    title.setAttribute("value", "Hello");
    screen.getByLabelText("Body").setAttribute("value", "World");
    screen.getByRole("button", { name: "Save" }).click();

    await waitFor(async () => expect(await db.query("posts")).toHaveLength(1));
    expect((await db.query<{ title: string }>("posts"))[0].title).toBe("Hello");
  });

  it("refuses to submit while a required field is empty, and says which", async () => {
    const db = createMemoryPersistenceAdapter();
    wrap(<AdminResourceForm definition={posts} persistence={db} onSaved={vi.fn()} />);

    await screen.findByLabelText("Title");
    screen.getByRole("button", { name: "Save" }).click();

    expect(await screen.findAllByText("This field is required.")).not.toHaveLength(0);
    expect(await db.query("posts")).toEqual([]);
  });

  it("marks the offending control invalid, not just the message", async () => {
    const db = createMemoryPersistenceAdapter();
    wrap(<AdminResourceForm definition={posts} persistence={db} />);

    await screen.findByLabelText("Title");
    screen.getByRole("button", { name: "Save" }).click();

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true"));
  });

  it("loads an existing record into the form", async () => {
    const db = createMemoryPersistenceAdapter();
    const created = await db.create<{ id: string }>("posts", { title: "Existing" });

    wrap(<AdminResourceForm definition={posts} persistence={db} id={created.id} />);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Existing"));
  });

  it("updates rather than creating when given an id", async () => {
    const db = createMemoryPersistenceAdapter();
    const created = await db.create<{ id: string }>("posts", { title: "Before" });
    const onSaved = vi.fn();

    wrap(<AdminResourceForm definition={posts} persistence={db} id={created.id} onSaved={onSaved} />);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Before"));
    screen.getByRole("button", { name: "Save" }).click();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await db.query("posts")).toHaveLength(1);
  });

  it("reports a record that is not there rather than showing a blank form", async () => {
    const db = createMemoryPersistenceAdapter();
    wrap(<AdminResourceForm definition={posts} persistence={db} id="nope" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("That record no longer exists.");
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("reports a failed save rather than appearing to have worked", async () => {
    const db = createMemoryPersistenceAdapter();
    const broken: AdminPersistenceAdapter = {
      ...db,
      create: vi.fn().mockRejectedValue(new Error("write rejected")),
    };
    const onSaved = vi.fn();
    wrap(<AdminResourceForm definition={posts} persistence={broken} onSaved={onSaved} />);

    // Title is required, so an empty submit would stop at validation and never reach the write.
    (await screen.findByLabelText("Title")).setAttribute("value", "Hello");
    screen.getByRole("button", { name: "Save" }).click();

    expect(await screen.findByText("That change could not be saved.")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("refuses to save when the write permission is not held", async () => {
    // Checked in the handler as well as on the button, because a form can be submitted
    // without it, and a persisted write is not something a hidden button can undo.
    const db = createMemoryPersistenceAdapter();
    const denied = { can: vi.fn(async () => false) };
    wrap(<AdminResourceForm definition={posts} persistence={db} />, denied);

    (await screen.findByLabelText("Title")).setAttribute("value", "Hello");
    // No button to click, so the submit is driven directly.
    const form = screen.getByLabelText("Title").closest("form");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(await screen.findByText("You do not have access to this.")).toBeInTheDocument();
    expect(await db.query("posts")).toEqual([]);
  });

  it("offers no save control when the write permission is not held", async () => {
    const db = createMemoryPersistenceAdapter();
    const denied = { can: vi.fn(async () => false) };
    wrap(<AdminResourceForm definition={posts} persistence={db} />, denied);

    await screen.findByLabelText("Title");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("saves when the resource declares no write permission at all", async () => {
    // An undeclared permission means the resource is ungated, matching the list, where an
    // undeclared permission means no control rather than a hidden one.
    const db = createMemoryPersistenceAdapter();
    const open: ReturnType<typeof defineAdminResource> = defineAdminResource({
      resource: "notes",
      label: "Notes",
      columns: [],
      fields: [{ name: "title", label: "Title" }],
    });
    wrap(<AdminResourceForm definition={open} persistence={db} />);

    (await screen.findByLabelText("Title")).setAttribute("value", "Hello");
    screen.getByRole("button", { name: "Save" }).click();
    await waitFor(async () => expect(await db.query("notes")).toHaveLength(1));
  });

  it("uses a field's own control when it declares one", async () => {
    const db = createMemoryPersistenceAdapter();
    const definition = defineAdminResource({
      resource: "posts",
      label: "Posts",
      columns: [],
      fields: [{ name: "cover", label: "Cover", render: () => <p>custom control</p> }],
    });
    wrap(<AdminResourceForm definition={definition} persistence={db} />);

    expect(await screen.findByText("custom control")).toBeInTheDocument();
  });
});
