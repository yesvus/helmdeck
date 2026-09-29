// SPDX-License-Identifier: MIT
import { configure } from "@testing-library/react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminPermissionsProvider } from "../src/shell/permissions";
import {
  AdminResourceList,
  createAdminResourceActions,
  defineAdminResource,
} from "../src/resources/index";
import {
  AdminResourceQueryError,
  parseAdminResourceQuery,
  type AdminResourceQuery,
} from "../src/adapters/query";
import { createMemoryPersistenceAdapter } from "../src/baseline";
import type { AdminResourceRecord } from "../src/resources/registry";
import type { AdminPermissionsAdapter, AdminPersistenceAdapter } from "../src/adapters/index";

// A term is settled before it is asked for, so a wait here has to outlast the settling as well as
// whatever else the machine is doing.
configure({ asyncUtilTimeout: 5000 });

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

/**
 * A store that answers the query it is given: search, filters, sort and the window, with the
 * count of what matched before the window. It is the host side of the contract written out, so a
 * test asserts against what the list asked rather than against a mock's return value.
 */
function awareStore(records: AdminResourceRecord[]) {
  const asked: Array<{ resource: string; query?: AdminResourceQuery }> = [];

  function matches(row: AdminResourceRecord, query: AdminResourceQuery): boolean {
    if (query.search !== undefined) {
      const term = query.search.toLowerCase();
      const anywhere = Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(term));
      if (!anywhere) return false;
    }
    for (const filter of query.filter ?? []) {
      const value = row[filter.field];
      if (filter.operator === "isNull") {
        if (value !== null && value !== undefined) return false;
        continue;
      }
      if (filter.operator === "eq" && value !== filter.value) return false;
      if (filter.operator === "contains" && !String(value ?? "").toLowerCase().includes(String(filter.value).toLowerCase())) {
        return false;
      }
      if (filter.operator === "gte" && !(Number(value) >= Number(filter.value))) return false;
    }
    return true;
  }

  const adapter: AdminPersistenceAdapter = {
    async read<T>(): Promise<T | null> {
      return null;
    },
    async query<T>(): Promise<T[]> {
      return records as T[];
    },
    async create<T>(): Promise<T> {
      throw new Error("the list does not write");
    },
    async update<T>(): Promise<T> {
      throw new Error("the list does not write");
    },
    async delete(): Promise<void> {
      throw new Error("the list does not write");
    },
    async queryPage<T>(resource: string, query?: AdminResourceQuery) {
      asked.push({ resource, query });
      const wanted = parseAdminResourceQuery(query);
      const found = records.filter((row) => matches(row, wanted));
      const ordered = wanted.sort
        ? [...found].sort((left, right) => {
            const field = wanted.sort?.[0].field ?? "";
            const direction = wanted.sort?.[0].direction === "desc" ? -1 : 1;
            return String(left[field] ?? "").localeCompare(String(right[field] ?? "")) * direction;
          })
        : found;
      const window_ = wanted.window ?? { offset: 0, limit: ordered.length };
      return { rows: ordered.slice(window_.offset, window_.offset + window_.limit) as T[], total: found.length };
    },
  };

  return { adapter, asked, last: () => asked[asked.length - 1]?.query };
}

/**
 * A store that answers with whatever it holds, whatever it is asked. A host whose query does
 * nothing is the case where a view that narrowed its own rows would be caught: it can only render
 * what came back if the narrowing was somebody else's.
 */
function unthinkingStore(records: AdminResourceRecord[], total = records.length) {
  const asked: Array<AdminResourceQuery | undefined> = [];
  const adapter: AdminPersistenceAdapter = {
    async read<T>(): Promise<T | null> {
      return null;
    },
    async query<T>(): Promise<T[]> {
      return records as T[];
    },
    async create<T>(): Promise<T> {
      throw new Error("the list does not write");
    },
    async update<T>(): Promise<T> {
      throw new Error("the list does not write");
    },
    async delete(): Promise<void> {
      throw new Error("the list does not write");
    },
    async queryPage<T>(_resource: string, query?: AdminResourceQuery) {
      asked.push(query);
      const window_ = parseAdminResourceQuery(query).window ?? { offset: 0, limit: records.length };
      return {
        rows: records.slice(window_.offset, window_.offset + window_.limit) as T[],
        total,
      };
    },
  };
  return { adapter, asked, last: () => asked[asked.length - 1] };
}

const posts = defineAdminResource({
  resource: "posts",
  label: "Posts",
  columns: [
    { key: "title", header: "Title", sortable: true },
    { key: "status", header: "Status" },
  ],
  fields: [{ name: "title", label: "Title", required: true }],
  filters: [
    {
      field: "status",
      label: "Status",
      options: [
        { value: "live", label: "Live" },
        { value: "draft", label: "Draft" },
      ],
    },
  ],
  permissions: { read: "posts.read", update: "posts.update", delete: "posts.delete" },
});

function allowAll(): AdminPermissionsAdapter {
  return { can: vi.fn(async () => true) };
}

/**
 * A store as a host wrote it before the paged form: the same adapter with `queryPage` taken off it.
 *
 * Removing the member rather than writing a fresh object is what makes these cases about the
 * interface's own optionality: the store underneath is the real one, answering exactly the calls it
 * always answered, and the only difference is the one member these cases are about.
 */
function withoutPaging(adapter: AdminPersistenceAdapter): AdminPersistenceAdapter {
  const legacy = { ...adapter };
  delete legacy.queryPage;
  return legacy;
}

function tree(element: React.ReactElement, adapter: AdminPermissionsAdapter = allowAll()) {
  return (
    <AdminI18nProvider locale="en">
      <AdminPermissionsProvider adapter={adapter}>{element}</AdminPermissionsProvider>
    </AdminI18nProvider>
  );
}

function wrap(element: React.ReactElement, adapter: AdminPermissionsAdapter = allowAll()) {
  return render(tree(element, adapter));
}

/** Deletes are confirmed, so a test has to open the confirmation and confirm it. */
async function confirmDelete(name: string) {
  fireEvent.click(await screen.findByRole("button", { name }));
  fireEvent.click(await screen.findByRole("button", { name: /^Delete$/ }));
}

describe("the count the list reports", () => {
  it("is what the adapter answered, not the length of the rows it sent", async () => {
    // A store with 4,003 records, a window of 40, and therefore 101 pages. The last page holds
    // three rows, so a list that reported its own row count would say "of 3" and one that
    // multiplied page by size would say "to 4040".
    const records = Array.from({ length: 4003 }, (_, index) => ({
      id: `p${index}`,
      title: `Post ${index}`,
      status: "live",
    }));
    const store = awareStore(records);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);

    expect(await screen.findByText("Post 0")).toBeInTheDocument();
    expect(store.last()).toEqual({ window: { offset: 0, limit: 40 } });
    // Header row plus the window, which is what "40 rows" has to mean if the count beside it is
    // about 4,003.
    expect(screen.getAllByRole("row")).toHaveLength(41);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 to 40 of 4003");
    expect(screen.getByRole("button", { name: "Page 101" })).toBeInTheDocument();
  });

  it("follows the adapter to the last page, which is short, and still counts the whole store", async () => {
    const records = Array.from({ length: 4003 }, (_, index) => ({
      id: `p${index}`,
      title: `Post ${index}`,
      status: "live",
    }));
    const store = awareStore(records);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);
    await screen.findByText("Post 0");

    fireEvent.click(screen.getByRole("button", { name: "Page 101" }));

    await waitFor(() => expect(store.last()).toEqual({ window: { offset: 4000, limit: 40 } }));
    expect(await screen.findByText("Post 4002")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 4001 to 4003 of 4003");
  });

  it("counts what the query matched rather than what the whole resource holds", async () => {
    // Searching narrows the store, and the count has to narrow with it. A total that ignored the
    // search would offer a hundred pages of results that do not exist.
    const records = Array.from({ length: 120 }, (_, index) => ({
      id: `p${index}`,
      title: index < 3 ? `Winter ${index}` : `Summer ${index}`,
      status: "live",
    }));
    const store = awareStore(records);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);
    await screen.findByText("Summer 3");

    fireEvent.change(await screen.findByLabelText("Search"), { target: { value: "winter" } });

    await waitFor(() => expect(store.last()?.search).toBe("winter"));
    expect(await screen.findByRole("status")).toHaveTextContent("Showing 1 to 3 of 3");
    expect(screen.queryByRole("button", { name: "Page 2" })).not.toBeInTheDocument();
  });
});

describe("search", () => {
  it("hands the term to the adapter, and renders the answer the adapter gave", async () => {
    // The store answers a search for "snow" with a row that has nothing to do with snow, on
    // purpose. A list that filtered what it fetched would hide it, so rendering it is what says
    // the filtering was the store's.
    const store = unthinkingStore([
      { id: "1", title: "Alpha", status: "live" },
      { id: "2", title: "Bravo", status: "live" },
    ]);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);
    expect(await screen.findByText("Alpha")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "snow" } });

    await waitFor(() => expect(store.last()?.search).toBe("snow"));
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });

  it("asks once for a term, rather than once per keystroke", async () => {
    const store = unthinkingStore([{ id: "1", title: "Alpha", status: "live" }]);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);
    await screen.findByText("Alpha");
    const before = store.asked.length;

    const box = screen.getByLabelText("Search");
    for (const value of ["w", "wi", "win"]) {
      fireEvent.change(box, { target: { value } });
    }

    await waitFor(() => expect(store.last()?.search).toBe("win"));
    expect(store.asked.length).toBe(before + 1);
  });

  it("asks for no search at all once the box is empty again", async () => {
    const store = unthinkingStore([{ id: "1", title: "Alpha", status: "live" }]);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);
    const box = await screen.findByLabelText("Search");
    fireEvent.change(box, { target: { value: "alpha" } });
    await waitFor(() => expect(store.last()?.search).toBe("alpha"));

    fireEvent.change(box, { target: { value: "   " } });

    // Whitespace is what an empty box holds, and a term of it is not a term.
    await waitFor(() => expect(store.last()?.search).toBeUndefined());
  });

  it("says a search found nothing, rather than that the resource is empty", async () => {
    const store = awareStore([{ id: "1", title: "Alpha", status: "live" }]);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);
    await screen.findByText("Alpha");

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "nothing matches this" } });

    expect(await screen.findByText("No records match what you searched for.")).toBeInTheDocument();
    // The empty state claims the resource has no records, which is a different claim.
    expect(screen.queryByText("Nothing here yet.")).not.toBeInTheDocument();
  });
});

describe("sorting", () => {
  it("hands the ordering to the adapter as the column was clicked, and leaves the rows it sent", async () => {
    // The store answers an ascending request with a descending answer on purpose: a view that
    // sorted its own rows would reorder them, and the first row would stop being Zebra.
    const inner = unthinkingStore([
      { id: "1", title: "Mango", status: "live" },
      { id: "2", title: "Zebra", status: "live" },
    ]);
    const asked: Array<AdminResourceQuery | undefined> = [];
    const adapter: AdminPersistenceAdapter = {
      ...inner.adapter,
      async queryPage<T>(resource: string, query?: AdminResourceQuery) {
        asked.push(query);
        const page = await inner.adapter.queryPage?.<T>(resource, query) ?? { rows: [] as T[], total: 0 };
        return { ...page, rows: [...page.rows].reverse() as T[] };
      },
    };

    wrap(<AdminResourceList definition={posts} persistence={adapter} />);
    expect(await screen.findByText("Zebra")).toBeInTheDocument();
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Zebra");

    const header = screen.getByRole("button", { name: /Title/ });
    fireEvent.click(header);
    await waitFor(() => expect(asked[asked.length - 1]?.sort).toEqual([{ field: "title", direction: "asc" }]));

    fireEvent.click(header);
    await waitFor(() =>
      expect(asked[asked.length - 1]?.sort).toEqual([{ field: "title", direction: "desc" }]),
    );

    // Back to the store's own order, which is the third click and the end of the cycle.
    fireEvent.click(header);
    await waitFor(() => expect(asked[asked.length - 1]?.sort).toBeUndefined());
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Zebra");
  });

  it("draws no sort control for a column that does not declare itself sortable", async () => {
    const plain = defineAdminResource({
      resource: "posts",
      label: "Posts",
      columns: [
        { key: "title", header: "Title", sortable: true },
        { key: "status", header: "Status" },
      ],
      fields: [{ name: "title", label: "Title" }],
    });
    const store = awareStore([{ id: "1", title: "Alpha", status: "live" }]);

    wrap(<AdminResourceList definition={plain} persistence={store.adapter} />);
    await screen.findByText("Alpha");

    expect(screen.getByRole("button", { name: /Title/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Status/ })).not.toBeInTheDocument();
  });
});

describe("filters", () => {
  it("hands the chosen value to the adapter, and renders the rows it sent back", async () => {
    // The store's answer includes a draft, which the filter excludes. A list that filtered what it
    // fetched would have dropped it.
    const store = unthinkingStore([
      { id: "1", title: "Live one", status: "live" },
      { id: "2", title: "Draft two", status: "draft" },
    ]);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);
    expect(await screen.findByText("Live one")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "live" } });

    await waitFor(() =>
      expect(store.last()?.filter).toEqual([{ field: "status", operator: "eq", value: "live" }]),
    );
    expect(screen.getByText("Draft two")).toBeInTheDocument();
  });

  it("compares a filter with no options as a term, and reads a declared parse", async () => {
    const priced = defineAdminResource({
      resource: "posts",
      label: "Posts",
      columns: [{ key: "title", header: "Title" }],
      fields: [{ name: "title", label: "Title" }],
      filters: [
        { field: "title", label: "Title contains" },
        {
          field: "views",
          label: "At least",
          operator: "gte",
          parse: (value) => Number(value.replace(/[^0-9]/g, "")) || undefined,
        },
      ],
    });
    const store = awareStore([{ id: "1", title: "Alpha", status: "live", views: 5 }]);

    wrap(<AdminResourceList definition={priced} persistence={store.adapter} />);
    await screen.findByText("Alpha");

    fireEvent.change(screen.getByLabelText("Title contains"), { target: { value: "alp" } });
    await waitFor(() =>
      expect(store.last()?.filter).toEqual([{ field: "title", operator: "contains", value: "alp" }]),
    );

    fireEvent.change(screen.getByLabelText("At least"), { target: { value: "1,200 views" } });
    await waitFor(() =>
      expect(store.last()?.filter).toEqual([
        { field: "title", operator: "contains", value: "alp" },
        { field: "views", operator: "gte", value: 1200 },
      ]),
    );
  });

  it("draws no filter control for a definition that declares no filters", async () => {
    const plain = defineAdminResource({
      resource: "posts",
      label: "Posts",
      columns: [{ key: "title", header: "Title" }],
      fields: [{ name: "title", label: "Title" }],
    });
    const store = awareStore([{ id: "1", title: "Alpha", status: "live" }]);

    wrap(<AdminResourceList definition={plain} persistence={store.adapter} />);
    await screen.findByText("Alpha");

    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
  });
});

describe("paging", () => {
  it("calls the pagination primitive, and asks the store for the page that was chosen", async () => {
    const records = Array.from({ length: 95 }, (_, index) => ({ id: `p${index}`, title: `Post ${index}` }));
    const store = awareStore(records);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);
    await screen.findByText("Post 0");

    // The primitive's own landmark, which is what says it is mounted rather than reimplemented.
    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(within(nav).getByRole("button", { name: "Page 3" })).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole("button", { name: "Page 2" }));

    await waitFor(() => expect(store.last()).toEqual({ window: { offset: 40, limit: 40 } }));
    expect(await screen.findByText("Post 40")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 41 to 80 of 95");
  });

  it("offers no pagination when the whole result fits on one page", async () => {
    const store = awareStore([{ id: "1", title: "Alpha" }]);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);
    await screen.findByText("Alpha");

    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("returns to the first page when the list is narrowed", async () => {
    const records = Array.from({ length: 95 }, (_, index) => ({
      id: `p${index}`,
      title: index === 90 ? "Winter coat" : `Post ${index}`,
    }));
    const store = awareStore(records);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);
    await screen.findByText("Post 0");
    fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
    await waitFor(() => expect(store.last()?.window).toEqual({ offset: 80, limit: 40 }));

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "winter" } });

    // One result, so the page that was 3 is gone, and the first page is the only one there is.
    await waitFor(() => expect(store.last()?.window).toEqual({ offset: 0, limit: 40 }));
    expect(await screen.findByText("Winter coat")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 to 1 of 1");
  });

  it("counts the delete it just made, rather than the count it was given", async () => {
    const records = Array.from({ length: 41 }, (_, index) => ({ id: `p${index}`, title: `Post ${index}` }));
    const store = awareStore(records);
    const writable: AdminPersistenceAdapter = {
      ...store.adapter,
      async queryPage<T>(resource: string, query?: AdminResourceQuery) {
        return store.adapter.queryPage?.<T>(resource, query) ?? { rows: [] as T[], total: 0 };
      },
      async delete(resource: string, id: string) {
        const index = records.findIndex((row) => row.id === id);
        if (index >= 0) records.splice(index, 1);
      },
    };

    wrap(<AdminResourceList definition={posts} persistence={writable} />);
    await screen.findByText("Post 0");
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(store.last()?.window).toEqual({ offset: 40, limit: 40 }));
    expect(screen.getByRole("status")).toHaveTextContent("Showing 41 to 41 of 41");

    await confirmDelete("Delete: p40");

    // The page that held the only row it had has nothing left to show, so it asks again from the
    // page there is rather than reporting an empty resource.
    await waitFor(() => expect(store.last()?.window).toEqual({ offset: 0, limit: 40 }));
    expect(await screen.findByText("Post 0")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 to 40 of 40");
  });

  it("takes the page size from the host, and asks for that many rows", async () => {
    const records = Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, title: `Post ${index}` }));
    const store = awareStore(records);

    wrap(<AdminResourceList definition={posts} persistence={store.adapter} pageSize={10} />);
    await screen.findByText("Post 0");

    expect(store.last()).toEqual({ window: { offset: 0, limit: 10 } });
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 to 10 of 30");
  });
});

describe("a host whose adapter does not answer the query", () => {
  it("is still an adapter, without a cast", async () => {
    // The compatibility claim, checked by naming the type rather than by a comment. This is the
    // shape in every adapter written before the query contract, and a narrowing of the interface
    // would stop this compiling rather than stop it working.
    const legacy = {
      read: async <T,>(): Promise<T | null> => null,
      query: async <T,>(): Promise<T[]> => [],
      create: async <T,>(): Promise<T> => {
        throw new Error("the list does not write");
      },
      update: async <T,>(): Promise<T> => {
        throw new Error("the list does not write");
      },
      delete: async (): Promise<void> => undefined,
    };
    const asAdapter: AdminPersistenceAdapter = legacy;

    expect(asAdapter.queryPage).toBeUndefined();
    expect(await asAdapter.query("posts")).toEqual([]);
  });

  it("renders the rows it was given, and asks for them with no query at all", async () => {
    // A store written before the paged form: five methods, a one-argument query that reads every
    // key it is given as a field to match exactly. This is the shape in every adapter and every
    // test in the repository, and it is the memory adapter's own shape with its paged call
    // removed, so the two differ in one member rather than in kind.
    const base = createMemoryPersistenceAdapter();
    await base.create("posts", { title: "Alpha", status: "live" });
    await base.create("posts", { title: "Bravo", status: "draft" });
    const asked = vi.fn((resource: string) => base.query<AdminResourceRecord>(resource));
    const legacy: AdminPersistenceAdapter = {
      read: (resource, id) => base.read(resource, id),
      query: asked as unknown as AdminPersistenceAdapter["query"],
      create: (resource, value) => base.create(resource, value),
      update: (resource, id, value) => base.update(resource, id, value),
      delete: (resource, id) => base.delete(resource, id),
    };

    wrap(<AdminResourceList definition={posts} persistence={legacy} />);

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    // One argument. A query object handed to an adapter that reads its keys as field matches
    // would filter every row away, so the legacy path sends nothing.
    expect(asked).toHaveBeenCalledWith("posts");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("draws no control that would have done nothing, even for a definition that declares them", async () => {
    // The definition declares a sortable column and a filter, so the absence below is the
    // adapter's answer and not the definition's silence.
    const base = createMemoryPersistenceAdapter();
    await base.create("posts", { title: "Alpha", status: "live" });
    const legacy = withoutPaging(base);

    wrap(<AdminResourceList definition={posts} persistence={legacy} />);

    await screen.findByText("Alpha");
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Title/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
    // And no count, because an adapter that said nothing about how many records there are has
    // not earned a claim about the size of the list.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the empty state, because an adapter that returns nothing says the resource is empty", async () => {
    wrap(
      <AdminResourceList
        definition={posts}
        persistence={withoutPaging(createMemoryPersistenceAdapter())}
      />,
    );

    expect(await screen.findByText("Nothing here yet.")).toBeInTheDocument();
  });
  it("starts the next resource from nothing chosen", async () => {
    // A term chosen for one resource is a term the other resource was never asked about, and the
    // count of the first one says nothing about the second.
    const store = awareStore([
      { id: "1", title: "Alpha", status: "live" },
      { id: "2", title: "Page about Alpha", status: "live" },
    ]);
    const pages = defineAdminResource({ ...posts, resource: "pages", label: "Pages" });

    const { rerender } = wrap(<AdminResourceList definition={posts} persistence={store.adapter} />);
    await screen.findByText("Alpha");
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "alpha" } });
    await waitFor(() => expect(store.last()?.search).toBe("alpha"));

    rerender(tree(<AdminResourceList definition={pages} persistence={store.adapter} />));

    await waitFor(() => expect(screen.getByLabelText("Search")).toHaveValue(""));
    const asked = store.asked[store.asked.length - 1];
    expect(asked.resource).toBe("pages");
    expect(asked.query?.search).toBeUndefined();
  });
});

describe("the query the seam accepts", () => {
  const good: Array<[string, unknown, AdminResourceQuery]> = [
    ["nothing at all", undefined, {}],
    ["nothing but null", null, {}],
    ["a term", { search: "winter" }, { search: "winter" }],
    ["a term with room around it", { search: "  winter  " }, { search: "winter" }],
    ["a term that is only room", { search: "   " }, {}],
    ["a comparison", { filter: [{ field: "status", operator: "eq", value: "live" }] }, {
      filter: [{ field: "status", operator: "eq", value: "live" }],
    }],
    ["a list to match", { filter: [{ field: "id", operator: "in", value: ["a", 2, true] }] }, {
      filter: [{ field: "id", operator: "in", value: ["a", 2, true] }],
    }],
    ["a comparison with no value", { filter: [{ field: "cover", operator: "isNull" }] }, {
      filter: [{ field: "cover", operator: "isNull" }],
    }],
    ["a nested field", { filter: [{ field: "meta.slug", operator: "eq", value: "a" }] }, {
      filter: [{ field: "meta.slug", operator: "eq", value: "a" }],
    }],
    ["an ordering", { sort: [{ field: "title", direction: "desc" }] }, {
      sort: [{ field: "title", direction: "desc" }],
    }],
    ["a window", { window: { offset: 40, limit: 40 } }, { window: { offset: 40, limit: 40 } }],
  ];

  for (const [what, input, expected] of good) {
    it(`reads ${what}`, () => {
      expect(parseAdminResourceQuery(input)).toEqual(expected);
    });
  }

  const bad: Array<[string, unknown]> = [
    ["a part that is not part of a query", { limit: 10 }],
    ["the field matches an older adapter read", { published: true }],
    ["a term that is not a string", { search: 42 }],
    ["a term longer than any search box", { search: "x".repeat(201) }],
    ["a filter that is not a list", { filter: { field: "status", operator: "eq", value: "live" } }],
    ["a comparison that is not one", { filter: [{ field: "status", operator: "like", value: "a" }] }],
    ["a comparison with nothing to compare to", { filter: [{ field: "status", operator: "eq" }] }],
    ["a comparison that takes no value, given one", { filter: [{ field: "cover", operator: "isNull", value: 1 }] }],
    ["an empty list to match", { filter: [{ field: "id", operator: "in", value: [] }] }],
    ["a value no store can compare", { filter: [{ field: "views", operator: "eq", value: Number.NaN }] }],
    ["a list against something that is not a list", { filter: [{ field: "id", operator: "eq", value: ["a"] }] }],
    ["the same comparison twice", {
      filter: [
        { field: "status", operator: "eq", value: "live" },
        { field: "status", operator: "eq", value: "draft" },
      ],
    }],
    ["a field that is not one", { filter: [{ field: "status; DROP TABLE posts--", operator: "eq", value: "a" }] }],
    ["an ordering that is not an ordering", { sort: [{ field: "title", direction: "sideways" }] }],
    ["an ordering with no direction", { sort: [{ field: "title" }] }],
    ["one field ordered twice", {
      sort: [
        { field: "title", direction: "asc" },
        { field: "title", direction: "desc" },
      ],
    }],
    ["a field that is not one, in an ordering", { sort: [{ field: "title--", direction: "asc" }] }],
    ["a window that is not a window", { window: 40 }],
    ["an offset before the first record", { window: { offset: -1, limit: 10 } }],
    ["an offset that is not a whole record", { window: { offset: 0.5, limit: 10 } }],
    ["a window of no rows at all", { window: { offset: 0, limit: 0 } }],
    ["a window larger than the contract allows", { window: { offset: 0, limit: 1001 } }],
    ["a window with a part it does not have", { window: { offset: 0, limit: 10, cursor: "x" } }],
    ["something that is not a query", "limit=10"],
    ["a list of queries", [{ search: "winter" }]],
  ];

  for (const [what, input] of bad) {
    it(`refuses ${what}`, () => {
      expect(() => parseAdminResourceQuery(input)).toThrow(AdminResourceQueryError);
    });
  }

  it("refuses an empty filter list and an empty ordering as nothing asked for", () => {
    // Both mean the same as leaving them out, and a normalised query is what a host can compare
    // or log without first asking which of the two shapes arrived.
    expect(parseAdminResourceQuery({ filter: [], sort: [] })).toEqual({});
  });
});

describe("the seam the browser's query crosses", () => {
  function seam() {
    const asked: Array<AdminResourceQuery | undefined> = [];
    const before = vi.fn();
    const base = createMemoryPersistenceAdapter();
    const persistence: AdminPersistenceAdapter = {
      ...base,
      async queryPage<T>(_resource: string, query?: AdminResourceQuery) {
        asked.push(query);
        return { rows: [] as T[], total: 0 };
      },
    };
    const guard = vi.fn(async () => undefined);
    const actions = createAdminResourceActions({
      guard: guard as never,
      persistence,
      before,
    });
    return { actions, asked, before, guard };
  }

  it("refuses a query it cannot read, and never reaches the store with it", async () => {
    const { actions, asked, before } = seam();

    await expect(actions.queryPage?.("posts", { limit: 10 } as never)).rejects.toThrow(
      AdminResourceQueryError,
    );

    expect(asked).toEqual([]);
    // Preparing a store for a request that was never going to be a question is work a refusal
    // should not have paid for.
    expect(before).not.toHaveBeenCalled();
  });

  it("refuses before it asks about the session, because the answer would be about the request", async () => {
    const { actions, guard } = seam();

    await expect(actions.queryPage?.("posts", { window: { offset: 0, limit: 0 } } as never)).rejects.toThrow(
      AdminResourceQueryError,
    );

    expect(guard).not.toHaveBeenCalled();
  });

  it("refuses a query the visitor could not have typed, as readily as one they could", async () => {
    const { actions, asked } = seam();

    // The guess this contract exists to close: a paging request sent through the key a store
    // would read as a column name.
    await expect(
      actions.queryPage?.("posts", {
        window: { offset: 0, limit: 10 },
        sort: [{ field: "title", direction: "asc" }],
        notAQueryPart: true,
      } as never),
    ).rejects.toThrow(AdminResourceQueryError);
    expect(asked).toEqual([]);
  });

  it("asks the session the collection question, as the list view does", async () => {
    const { actions, guard, asked } = seam();

    const answer = await actions.queryPage?.("posts", { window: { offset: 40, limit: 40 } });

    expect(answer).toEqual({ rows: [], total: 0 });
    expect(guard).toHaveBeenCalledWith("posts.read", undefined);
    expect(asked).toEqual([{ window: { offset: 40, limit: 40 } }]);
  });

  it("does not offer a paged query the host's adapter cannot answer", async () => {
    // Otherwise every list mounted on these actions would see a store that can count, because the
    // actions said so rather than the adapter. The in-memory adapter with its paged call removed
    // is the shape every host wrote before the query contract, so the absence below is the one a
    // real host meets rather than one arranged for the test.
    const actions = createAdminResourceActions({
      guard: (async () => undefined) as never,
      persistence: withoutPaging(createMemoryPersistenceAdapter()),
    });

    expect(actions.queryPage).toBeUndefined();
    expect(typeof actions.query).toBe("function");
  });

  it("offers the paged query where the host's adapter has one", async () => {
    const { actions } = seam();

    expect(typeof actions.queryPage).toBe("function");
  });
});

describe("what a definition may declare", () => {
  it("refuses a filter on something that is not a field", () => {
    // Found through a refused request from a browser, the author would learn the name came from
    // somewhere and not that the definition was the place to fix it.
    expect(() =>
      defineAdminResource({
        resource: "posts",
        label: "Posts",
        columns: [],
        fields: [],
        filters: [{ field: "status; DROP TABLE posts--", label: "Status" }],
      }),
    ).toThrow(/field/);
  });

  it("refuses two filters on one field, whose second comparison is the one a store drops", () => {
    expect(() =>
      defineAdminResource({
        resource: "posts",
        label: "Posts",
        columns: [],
        fields: [],
        filters: [
          { field: "status", label: "Status" },
          { field: "status", label: "Status again" },
        ],
      }),
    ).toThrow(/status/);
  });

  it("refuses a filter with no options, which no visitor could choose", () => {
    expect(() =>
      defineAdminResource({
        resource: "posts",
        label: "Posts",
        columns: [],
        fields: [],
        filters: [{ field: "status", label: "Status", options: [] }],
      }),
    ).toThrow(/status/);
  });
});
