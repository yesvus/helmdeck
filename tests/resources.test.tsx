// SPDX-License-Identifier: MIT
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminPermissionsProvider } from "../src/shell/permissions";
import {
  absentRequired,
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

// Every prop is forwarded. A mock that kept only href and children would drop the aria-label
// and leave these links with no accessible name, which reads as a missing control.
vi.mock("next/link.js", () => ({
  default: ({
    children,
    href,
    ...rest
  }: { children: React.ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
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

/** Deleting is confirmed, so a test has to open the confirmation and confirm it. */
async function confirmDelete(name: string) {
  fireEvent.click(await screen.findByRole("button", { name }));
  fireEvent.click(await screen.findByRole("button", { name: /^Delete$/ }));
}

function tree(element: React.ReactElement, adapter = allowAll()) {
  return (
    <AdminI18nProvider locale="en">
      <AdminPermissionsProvider adapter={adapter}>{element}</AdminPermissionsProvider>
    </AdminI18nProvider>
  );
}

function wrap(element: React.ReactElement, adapter = allowAll()) {
  return render(tree(element, adapter));
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

  it("refuses an empty id on the object branch too", () => {
    // The scalar path already rejected "", so accepting it on the object path built a route
    // ending in a slash and addressed nothing.
    expect(() => adminResourceRecordId({ id: "" })).toThrow(/id/);
    expect(() => adminResourceRecordId({ id: Number.NaN })).toThrow(/id/);
  });

  it("refuses a record it could never address", () => {
    expect(() => adminResourceRecordId({})).toThrow(/id/);
    expect(() => adminResourceRecordId(null)).toThrow(/id/);
    expect(() => adminResourceRecordId("")).toThrow(/id/);
  });
});

describe("adminResourceValues", () => {
  it("does not let a non-finite number satisfy a required field", () => {
    // Number("abc") is NaN, which is neither null nor empty, so it passed the required check
    // and reached the adapter as an invalid value.
    const counted = defineAdminResource({
      resource: "posts",
      label: "Posts",
      columns: [],
      fields: [{ name: "views", label: "Views", type: "number", required: true }],
    });
    const form = new FormData();
    form.set("views", "abc");
    expect(absentRequired(counted, adminResourceValues(counted, form))).toEqual(["views"]);

    form.set("views", "Infinity");
    expect(absentRequired(counted, adminResourceValues(counted, form))).toEqual(["views"]);

    form.set("views", "0");
    expect(absentRequired(counted, adminResourceValues(counted, form))).toEqual([]);
  });

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

  it("decides each row by its own id, so per-record rules can hide a row's controls", async () => {
    // AdminPermissionsAdapter.can takes a resourceId for exactly this, and the generated views
    // were asking once for the whole resource, so a host allowing edits only on their own
    // records would have seen an edit control on every row.
    // create() assigns its own id, so the rows are written directly.
    const rows = [{ id: "mine", title: "Mine" }, { id: "theirs", title: "Theirs" }];
    const db: AdminPersistenceAdapter = { ...createMemoryPersistenceAdapter(), query: async () => rows };
    // Read is granted: the read check passes no id, so denying it here would empty the list
    // and make every row assertion below pass for the wrong reason.
    const perRecord = {
      can: vi.fn(async (permission: string, context?: { resourceId?: string }) => {
        if (permission === "posts.read") return true;
        return permission === "posts.update" ? context?.resourceId === "mine" : true;
      }),
    };

    wrap(<AdminResourceList definition={posts} persistence={db} />, perRecord);

    expect(await screen.findByRole("link", { name: "Edit: mine" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("link", { name: "Edit: theirs" })).not.toBeInTheDocument());
    expect(perRecord.can).toHaveBeenCalledWith("posts.update", { resourceId: "theirs" });
  });

  it("clears a stale error once a later operation succeeds", async () => {
    // titiz's finding: a failed load or delete left its message up for ever, so a retry that
    // worked still showed the old failure.
    let failNext = true;
    const base = createMemoryPersistenceAdapter();
    const flaky: AdminPersistenceAdapter = {
      ...base,
      query: vi.fn(async (resource: string) => {
        if (failNext) {
          failNext = false;
          throw new Error("database down");
        }
        return base.query(resource);
      }),
    };
    const { rerender } = wrap(<AdminResourceList definition={posts} persistence={flaky} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("These records could not be loaded.");

    // A retry is a new adapter, which is what changes the effect's dependencies. Calling the
    // old one directly would resolve nothing and re-render nothing.
    await base.create("posts", { title: "Recovered" });
    const recovered: AdminPersistenceAdapter = { ...base, query: vi.fn((r: string) => base.query(r)) };
    rerender(tree(<AdminResourceList definition={posts} persistence={recovered} />));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(await screen.findByText("Recovered")).toBeInTheDocument();
  });

  it("asks before deleting, because a delete cannot be undone from here", async () => {
    // One stray click on a permanent delete destroys a record with no way back from the UI.
    const base = createMemoryPersistenceAdapter();
    const created = await base.create<{ id: string }>("posts", { title: "Precious" });
    const db: AdminPersistenceAdapter = { ...base, delete: vi.fn((r: string, id: string) => base.delete(r, id)) };
    wrap(<AdminResourceList definition={posts} persistence={db} />);

    fireEvent.click(await screen.findByRole("button", { name: `Delete: ${created.id}` }));
    // The dialog is open and nothing has been written.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(db.delete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    await waitFor(() => expect(db.delete).toHaveBeenCalledWith("posts", created.id));
  });

  it("clears a stale delete error once a later delete succeeds", async () => {
    const base = createMemoryPersistenceAdapter();
    const first = await base.create<{ id: string }>("posts", { title: "One" });
    const second = await base.create<{ id: string }>("posts", { title: "Two" });
    let failNext = true;
    const flaky: AdminPersistenceAdapter = {
      ...base,
      delete: vi.fn(async (resource: string, id: string) => {
        if (failNext) {
          failNext = false;
          throw new Error("delete rejected");
        }
        return base.delete(resource, id);
      }),
    };
    wrap(<AdminResourceList definition={posts} persistence={flaky} />);

    await confirmDelete(`Delete: ${first.id}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("That record could not be deleted.");

    await confirmDelete(`Delete: ${second.id}`);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
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

    await confirmDelete("Delete: mem_1");

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

  it("never queries when the read permission is refused", async () => {
    // Gating the rendered rows would still have queried, so a denied visitor would have had
    // the records in the response even though nothing was drawn.
    const base = createMemoryPersistenceAdapter();
    await base.create("posts", { title: "Secret" });
    const query = vi.fn((resource: string) => base.query(resource));
    const denied = { can: vi.fn(async (permission: string) => permission !== "posts.read") };

    wrap(<AdminResourceList definition={posts} persistence={{ ...base, query }} />, denied);

    expect(await screen.findByText("You do not have access to this.")).toBeInTheDocument();
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
  });

  it("shows the previous resource's rows to nobody while the next one loads", async () => {
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "From posts" });
    let release: (rows: unknown[]) => void = () => {};
    const query = vi.fn(async (resource: string) =>
      resource === "pages"
        ? new Promise((resolve) => { release = resolve; })
        : db.query(resource),
    );
    const { rerender } = wrap(
      <AdminResourceList definition={posts} persistence={{ ...db, query: query as never }} />,
    );
    await screen.findByText("From posts");

    const pages = defineAdminResource({ ...posts, resource: "pages" });
    rerender(tree(<AdminResourceList definition={pages} persistence={{ ...db, query: query as never }} />));

    // The other resource's records are gone, not carried over under the new heading.
    expect(screen.queryByText("From posts")).not.toBeInTheDocument();
    // Released inside act, so the resulting state update is flushed rather than landing after
    // the test has finished.
    await act(async () => {
      release([]);
    });
  });

  it("encodes a record id that would otherwise reshape the detail route", async () => {
    // create() assigns its own id, so a hand-written row is the only way to get an awkward one.
    const db = createMemoryPersistenceAdapter();
    const awkward: AdminPersistenceAdapter = {
      ...db,
      query: async () => [{ id: "a/b?c#d", title: "Awkward" }],
    };
    wrap(<AdminResourceList definition={posts} persistence={awkward} />);

    const link = await screen.findByRole("link", { name: "Edit: a/b?c#d" });
    expect(link).toHaveAttribute("href", "posts/a%2Fb%3Fc%23d");
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => expect(await db.query("posts")).toHaveLength(1));
    expect((await db.query<{ title: string }>("posts"))[0].title).toBe("Hello");
  });

  it("refuses to submit while a required field is empty, and says which", async () => {
    const db = createMemoryPersistenceAdapter();
    wrap(<AdminResourceForm definition={posts} persistence={db} onSaved={vi.fn()} />);

    await screen.findByLabelText("Title");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Exactly one: `not.toHaveLength(0)` would also pass if the message were duplicated.
    expect(await screen.findAllByText("This field is required.")).toHaveLength(1);
    expect(await db.query("posts")).toEqual([]);
  });

  it("marks the offending control invalid, not just the message", async () => {
    const db = createMemoryPersistenceAdapter();
    wrap(<AdminResourceForm definition={posts} persistence={db} />);

    await screen.findByLabelText("Title");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await db.query("posts")).toHaveLength(1);
  });

  it("announces loading rather than claiming the record does not exist", async () => {
    // titiz's finding: the first version answered "not found" from the first paint, before the
    // read had a chance to say anything. That is a claim nothing supports yet.
    // The promise exists before the first render, so the resolver is valid immediately: the
    // effect does not call read until the read permission has resolved.
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => { release = resolve; });
    const slow: AdminPersistenceAdapter = { ...createMemoryPersistenceAdapter(), read: vi.fn(() => pending) };
    wrap(<AdminResourceForm definition={posts} persistence={slow} id="p1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("That record no longer exists.")).not.toBeInTheDocument();

    release({ id: "p1", title: "Eventually" });
    expect(await screen.findByLabelText("Title")).toHaveValue("Eventually");
  });

  it("clears a field's error once the visitor fixes it, without another submit", async () => {
    // titiz's finding: the invalid set was written on submit and never revised, so a corrected
    // field stayed marked and the form looked broken after being fixed.
    const db = createMemoryPersistenceAdapter();
    wrap(<AdminResourceForm definition={posts} persistence={db} />);

    const title = await screen.findByLabelText("Title");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(title).toHaveAttribute("aria-invalid", "true"));

    title.setAttribute("value", "Hello");
    fireEvent.input(title);
    await waitFor(() => expect(title).not.toHaveAttribute("aria-invalid"));
  });

  it("goes back to loading when the id changes, rather than showing the previous record", async () => {
    // The stored read is keyed by the id it came from, so a new one cannot briefly display the
    // old record's values or claim the new one does not exist.
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "First" });
    await db.create("posts", { title: "Second" });
    const { rerender } = wrap(<AdminResourceForm definition={posts} persistence={db} id="mem_1" />);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("First"));

    rerender(tree(<AdminResourceForm definition={posts} persistence={db} id="mem_2" />));

    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    expect(screen.queryByText("That record no longer exists.")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Second"));
  });

  it("does not carry one resource's record over to another with the same id", async () => {
    // The same id on a different resource is a different record, and the previous one's
    // values would be saved into this one.
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { id: "shared", title: "A post" });
    const other = defineAdminResource({ ...posts, resource: "pages" });
    const withBoth: AdminPersistenceAdapter = {
      ...db,
      read: vi.fn(async (resource: string) =>
        resource === "posts" ? { id: "shared", title: "A post" } : { id: "shared", title: "A page" },
      ),
    };
    const { rerender } = wrap(
      <AdminResourceForm definition={posts} persistence={withBoth} id="shared" />,
    );
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("A post"));

    rerender(tree(<AdminResourceForm definition={other} persistence={withBoth} id="shared" />));

    // Back to loading, never showing the post's title on the page form.
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("A page"));
  });

  it("reports a record that is not there rather than showing a blank form", async () => {
    const db = createMemoryPersistenceAdapter();
    wrap(<AdminResourceForm definition={posts} persistence={db} id="nope" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("That record no longer exists.");
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("reports a failed read instead of loading for ever", async () => {
    // titiz's finding: the catch set the message but never settled the keyed read state, so
    // the loading branch kept winning and the failure was never shown at all.
    const base = createMemoryPersistenceAdapter();
    const existing = await base.create<{ id: string }>("posts", { title: "Before" });
    const broken: AdminPersistenceAdapter = {
      ...base,
      read: vi.fn().mockRejectedValue(new Error("database down")),
    };
    wrap(<AdminResourceForm definition={posts} persistence={broken} id={existing.id} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("These records could not be loaded.");
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.queryByText("That record no longer exists.")).not.toBeInTheDocument();
  });

  it("clears a save error once a later read of the same record succeeds", async () => {
    const base = createMemoryPersistenceAdapter();
    const existing = await base.create<{ id: string }>("posts", { title: "Before" });
    let failNext = true;
    const flaky: AdminPersistenceAdapter = {
      ...base,
      update: vi.fn(async (resource: string, id: string, value: unknown) => {
        if (failNext) {
          failNext = false;
          throw new Error("write rejected");
        }
        return base.update(resource, id, value);
      }),
    };
    const { rerender } = wrap(<AdminResourceForm definition={posts} persistence={flaky} id={existing.id} />);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Before"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("That change could not be saved.")).toBeInTheDocument();

    rerender(tree(<AdminResourceForm definition={posts} persistence={base} id={existing.id} />));
    await waitFor(() => expect(screen.queryByText("That change could not be saved.")).not.toBeInTheDocument());
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("That change could not be saved.")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("refuses to save when the write permission is not held", async () => {
    // Checked in the handler as well as on the button, because a form can be submitted
    // without it, and a persisted write is not something a hidden button can undo.
    const db = createMemoryPersistenceAdapter();
    const existing = await db.create<{ id: string }>("posts", { title: "Before" });
    // Read is granted, so the form renders; only the write is refused.
    const denied = { can: vi.fn(async (permission: string) => permission !== "posts.update") };
    wrap(<AdminResourceForm definition={posts} persistence={db} id={existing.id} />, denied);
    (await screen.findByLabelText("Title")).setAttribute("value", "Hello");
    // No button to click, so the submit is driven directly.
    const form = screen.getByLabelText("Title").closest("form");
    await act(async () => {
      if (form) fireEvent.submit(form);
    });

    expect(await screen.findByText("You do not have access to this.")).toBeInTheDocument();
    // The record is untouched, which is the point of refusing before the write.
    expect(await db.query("posts")).toEqual([{ id: existing.id, title: "Before" }]);
  });

  it("offers no save control when the write permission is not held", async () => {
    const db = createMemoryPersistenceAdapter();
    const denied = { can: vi.fn(async (permission: string) => permission !== "posts.create") };
    wrap(<AdminResourceForm definition={posts} persistence={db} />, denied);

    await screen.findByLabelText("Title");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("offers no save at all when the resource declares no write permission", async () => {
    // This test used to assert the opposite, and it was wrong. The list and the form meant
    // opposite things by an undeclared permission: no New control on the list, a working Save
    // here. One rule now, and it is the fail-closed one the rest of the slice follows.
    const db = createMemoryPersistenceAdapter();
    const open = defineAdminResource({
      resource: "notes",
      label: "Notes",
      columns: [],
      fields: [{ name: "title", label: "Title" }],
    });
    wrap(<AdminResourceForm definition={open} persistence={db} />);

    await screen.findByLabelText("Title");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();

    const form = screen.getByLabelText("Title").closest("form");
    if (form) fireEvent.submit(form);
    expect(await db.query("notes")).toEqual([]);
  });

  it("refuses an early submit when no write permission is declared", async () => {
    const db = createMemoryPersistenceAdapter();
    const open = defineAdminResource({
      resource: "notes",
      label: "Notes",
      columns: [],
      fields: [{ name: "title", label: "Title" }],
    });
    wrap(<AdminResourceForm definition={open} persistence={db} />);

    (await screen.findByLabelText("Title")).setAttribute("value", "Hello");
    const form = screen.getByLabelText("Title").closest("form");
    if (form) fireEvent.submit(form);

    expect(await db.query("notes")).toEqual([]);
  });

  it("still allows a new record when the read permission is refused", async () => {
    // Creating needs create permission and reads nothing, so a read refusal must not lock a
    // visitor out of a form they are allowed to fill in.
    const db = createMemoryPersistenceAdapter();
    const denied = { can: vi.fn(async (permission: string) => permission !== "posts.read") };

    wrap(<AdminResourceForm definition={posts} persistence={db} />, denied);

    (await screen.findByLabelText("Title")).setAttribute("value", "Hello");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => expect(await db.query("posts")).toHaveLength(1));
  });

  it("never reads a record when the read permission is refused", async () => {
    const base = createMemoryPersistenceAdapter();
    const existing = await base.create<{ id: string }>("posts", { title: "Secret" });
    const read = vi.fn((resource: string, id: string) => base.read(resource, id));
    const denied = { can: vi.fn(async (permission: string) => permission !== "posts.read") };

    wrap(<AdminResourceForm definition={posts} persistence={{ ...base, read }} id={existing.id} />, denied);

    expect(await screen.findByText("You do not have access to this.")).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("does not refuse an early submit while the permission is still being checked", async () => {
    // Pressing Enter on a focused field is the ordinary way to submit early, and answering
    // "no access" for a permission that has not been decided yet is a guess.
    const db = createMemoryPersistenceAdapter();
    let allow: (value: boolean) => void = () => {};
    const pending = new Promise<boolean>((resolve) => { allow = resolve; });
    const slow = { can: vi.fn(() => pending) };
    wrap(<AdminResourceForm definition={posts} persistence={db} />, slow);

    const title = await screen.findByLabelText("Title");
    title.setAttribute("value", "Hello");
    const form = title.closest("form");
    if (form) fireEvent.submit(form);

    // No refusal while it is still checking.
    expect(screen.queryByText("You do not have access to this.")).not.toBeInTheDocument();

    allow(true);
    await waitFor(async () => expect(await db.query("posts")).toHaveLength(1));
  });

  it("decides the form's write by the record being edited, not the resource", async () => {
    const base = createMemoryPersistenceAdapter();
    const existing = await base.create<{ id: string }>("posts", { title: "Theirs" });
    // Read granted, write decided by the record. Denying read here would stop the form
    // rendering at all, and the absent Save button would prove nothing.
    const perRecord = {
      can: vi.fn(async (permission: string, context?: { resourceId?: string }) => {
        if (permission === "posts.read") return true;
        return context?.resourceId === "mine";
      }),
    };
    wrap(<AdminResourceForm definition={posts} persistence={base} id={existing.id} />, perRecord);

    // The form is on screen, so the absent Save is a refusal rather than an empty page.
    await screen.findByLabelText("Title");
    await waitFor(() => expect(perRecord.can).toHaveBeenCalledWith("posts.update", { resourceId: existing.id }));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
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
