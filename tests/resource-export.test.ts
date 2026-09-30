// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_RESOURCE_EXPORT_MAX_ROWS,
  AdminResourceExportError,
  adminCsvCell,
  adminCsvText,
  adminResourceExport,
  adminResourceExportResponse,
  type AdminResourceExport,
  type AdminResourceExportFinished,
} from "@yesvus/helmdeck";
import type { AdminResourceQuery } from "@yesvus/helmdeck";
import { createAdminPermissionGuard } from "../src/shell/permission-rule";
import { createAdminResourceActions } from "../src/resources/actions";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { demoCan, exposedResource } from "../fixtures/lib/demo-rules";
import type { AdminSession } from "../src/adapters/index";

/**
 * The file a list's query turns into, and the refusals that stop one being written.
 *
 * The store is a recording one, because the property that matters about an export is not what its
 * file contains but what the store was handed: a file whose contents are right for the wrong query is
 * the same file as a dump of the table, and only the query tells the two apart. So the assertions here
 * read the queries the store was asked with, the way `demo-products-list.test.tsx` reads them for the
 * list, and the file's own contents beside them.
 *
 * The rule is the demo's own `demoCan`, through the guard the package builds, over the actions the
 * package builds. A second rule here would be a rule that could agree with the first today and not
 * tomorrow, and the whole claim of the export half is that a refusal is the same refusal.
 */

type Row = { id: string; [key: string]: unknown };

/** What the store was asked, and what it answered, so the two can be compared afterwards. */
function recorder(pages: Row[][], limit: number) {
  const asked: Array<{ resource: string; query?: AdminResourceQuery }> = [];
  const produced: { rows: number; pages: number } = { rows: 0, pages: 0 };

  const actions = {
    queryPage: async <T>(resource: string, query?: AdminResourceQuery) => {
      asked.push({ resource, query });
      const wanted = query ?? {};
      const window_ = wanted.window ?? { offset: 0, limit };
      const all = pages.flat();
      // A store that serves fewer rows than it was asked for, which is what a host whose own limit is
      // smaller than the contract's does. The count is the whole matched set either way.
      const served = all.slice(window_.offset, window_.offset + Math.min(window_.limit, limit));
      produced.rows += served.length;
      produced.pages += 1;
      return { rows: served as T[], total: all.length };
    },
  };
  return { actions, asked, produced, last: () => asked[asked.length - 1] };
}

function products(rows: Row[]) {
  const columns = [
    { key: "id", header: "ID" },
    { key: "name", header: "Name" },
    { key: "price_cents", header: "Price", format: "money" as const },
  ];
  return { columns, rows };
}

/**
 * The file, whole, and what the walk finished with.
 *
 * Driven by hand rather than with a `for await`, because the finished count is the generator's own
 * return value and a `for await` throws that away. The line endings are normalised so a failure about
 * a row is not a failure about a carriage return.
 */
async function read(file: AdminResourceExport): Promise<{ text: string; finished: AdminResourceExportFinished; chunks: number }> {
  const chunks: string[] = [];
  const rows = file.rows[Symbol.asyncIterator]();
  let step = await rows.next();
  while (!step.done) {
    chunks.push(step.value);
    step = await rows.next();
  }
  return { text: chunks.join("").replace(/\r\n/g, "\n"), finished: step.value, chunks: chunks.length };
}

describe("the query an export is of", () => {
  it("hands the store the query the list is showing, and the window is its own", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      id: `p${index}`,
      name: `Product ${index}`,
      price_cents: 4900,
    }));
    const store = recorder([rows], 1000);
    const { columns } = products(rows);

    const file = await adminResourceExport({
      actions: store.actions,
      resource: "products",
      columns,
      query: { search: "Padded", filter: [{ field: "status", operator: "eq", value: "live" }], sort: [{ field: "name", direction: "desc" }] },
    });
    const { text, finished } = await read(file);

    // One window, and it is the one the export walked with. The caller's query has no window in it
    // and the file says which one it used, so a caller can see the walk it asked for.
    expect(store.asked).toEqual([
      {
        resource: "products",
        query: {
          search: "Padded",
          filter: [{ field: "status", operator: "eq", value: "live" }],
          sort: [{ field: "name", direction: "desc" }],
          window: { offset: 0, limit: 1000 },
        },
      },
    ]);
    expect(file.query).toEqual({
      search: "Padded",
      filter: [{ field: "status", operator: "eq", value: "live" }],
      sort: [{ field: "name", direction: "desc" }],
    });
    // The store answered with all twenty-five because this store is not the one that would narrow,
    // which is the point: the rows in the file are the rows the store sent for the query it was
    // asked, and nothing here chose them.
    expect(finished).toEqual({ exported: 25, complete: true });
    expect(text.split("\n")[0]).toBe("ID,Name,Price");
    expect(text.split("\n")[1]).toBe("p0,Product 0,$49.00");
  });

  it("drops a window the caller sent, because an export is the whole of a query and not a page of it", async () => {
    // The list a reader is looking at is the filtered set; the page is where they happen to be in it.
    // Exporting page three of six would be a file claiming to be the list and holding forty rows.
    const rows = Array.from({ length: 250 }, (_, index) => ({ id: `p${index}`, name: `Product ${index}` }));
    const store = recorder([rows], 1000);
    const { columns } = products(rows);

    const file = await adminResourceExport({
      actions: store.actions,
      resource: "products",
      columns,
      query: { window: { offset: 2000, limit: 100 } },
    });
    const { finished } = await read(file);

    expect(store.asked[0].query?.window).toEqual({ offset: 0, limit: 1000 });
    expect(finished).toEqual({ exported: 250, complete: true });
  });

  it("is refused a query the store could not be asked, by the reader that refuses a read", async () => {
    const store = recorder([[]], 1000);

    // The guess the query contract exists to close: a paging request sent as a field match.
    await expect(
      adminResourceExport({
        actions: store.actions,
        resource: "products",
        columns: products([]).columns,
        query: { limit: 10 },
      }),
    ).rejects.toThrow(/cannot be used/);
    // Nothing was asked of the store, so a refused export has not read a row to refuse it.
    expect(store.asked).toEqual([]);
  });
});

describe("the count the file is of", () => {
  it("is the count the store gave for the query, and not the length of the rows it sent", async () => {
    // 1,204 records behind a store that serves 10 at a time, so the walk takes 121 windows and the
    // count is 1,204 while no window holds more than ten rows. A count taken from the rows would be
    // ten, and a count taken from the pages would be 121.
    const rows = Array.from({ length: 1204 }, (_, index) => ({ id: `p${index}`, name: `Product ${index}` }));
    const store = recorder([rows], 10);
    const { columns } = products(rows);

    const file = await adminResourceExport({ actions: store.actions, resource: "products", columns });
    const { text, finished } = await read(file);

    expect(file.total).toBe(1204);
    expect(finished).toEqual({ exported: 1204, complete: true });
    expect(store.produced.pages).toBe(121);
    // A header, 1,204 rows, and the empty string after the last line break.
    expect(text.split("\n")).toHaveLength(1206);
  });

  it("says a file is not the whole list when the store stops answering windows", async () => {
    // The store counted 50 and then served nothing, which is what a resource emptied under the walk
    // looks like. The file is a real file of the rows that came, and `complete` is the claim that it
    // is not the whole set, which nothing downstream can work out from the bytes alone.
    let calls = 0;
    const actions = {
      queryPage: async <T>() => {
        calls += 1;
        if (calls === 1) {
          return { rows: [{ id: "a" }, { id: "b" }] as T[], total: 50 };
        }
        return { rows: [] as T[], total: 50 };
      },
    };

    const file = await adminResourceExport({
      actions,
      resource: "products",
      columns: products([]).columns,
    });
    const { text, finished } = await read(file);

    expect(finished).toEqual({ exported: 2, complete: false });
    expect(file.total).toBe(50);
    expect(text).toBe("ID,Name,Price\na,,\nb,,\n");
  });

  it("is refused a query matching more records than one export writes, before a row is read", async () => {
    const asked: string[] = [];
    const actions = {
      queryPage: async <T>(resource: string) => {
        asked.push(resource);
        return { rows: [] as T[], total: ADMIN_RESOURCE_EXPORT_MAX_ROWS + 1 };
      },
    };

    await expect(
      adminResourceExport({ actions, resource: "products", columns: products([]).columns }),
    ).rejects.toThrow(AdminResourceExportError);
    // The count is known from the first window, so the refusal costs one window and not a walk of
    // one. A refusal is refused rather than served with the first fifty thousand rows.
    expect(asked).toEqual(["products"]);
    expect(asked).toHaveLength(1);
  });
});

describe("a session that may not read the resource", () => {
  const editor: AdminSession = { email: "editor@demo.helmdeck.dev", role: "editor" };
  const owner: AdminSession = { email: "owner@demo.helmdeck.dev", role: "admin" };

  function seam(session: AdminSession | null, rows: Row[]) {
    const persistence = createMemoryPersistenceAdapter();
    for (const row of rows) void persistence.create("orders", row);
    const store = {
      queryPage: vi.fn(persistence.queryPage as never),
    };
    const actions = createAdminResourceActions({
      guard: createAdminPermissionGuard({ rule: demoCan, session: () => session }),
      persistence: { ...persistence, queryPage: store.queryPage as never },
      expose: exposedResource,
    });
    return { actions, store };
  }

  const orders = [
    { id: "o1", customer: "Amber lamp", status: "paid", total_cents: 4900 },
    { id: "o2", customer: "Walnut riser", status: "open", total_cents: 5900 },
  ];

  it("is refused the whole file, and the store is never asked for a row of it", async () => {
    // The call an attacker makes: the same function a list view's export button would call, with the
    // resource the rule reserves for administrators.
    const { actions, store } = seam(editor, orders);

    await expect(
      adminResourceExport({
        actions,
        resource: "orders",
        columns: [
          { key: "customer", header: "Customer" },
          { key: "total_cents", header: "Total", format: "money" },
        ],
      }),
    ).rejects.toThrow(/may not orders.read/);
    expect(store.queryPage).not.toHaveBeenCalled();
  });

  it("is refused by the same rule that refuses a read of one of its rows", async () => {
    const { actions, store } = seam(editor, orders);

    const byRead = await actions.read("orders", "o1").catch((cause: unknown) => cause);
    const byExport = await adminResourceExport({
      actions,
      resource: "orders",
      columns: [{ key: "customer" }],
    }).catch((cause: unknown) => cause);

    // The same class, the same permission, and the same answer whether one row or all of them were
    // asked for. An export refused differently from a read is a second answer to one question.
    expect((byExport as Error).constructor).toBe((byRead as Error).constructor);
    expect((byExport as Error).message).toBe((byRead as Error).message);
    expect((byExport as { permission: string }).permission).toBe("orders.read");
    expect(store.queryPage).not.toHaveBeenCalled();
  });

  it("is refused a resource outside the exposed set before the session is asked about it", async () => {
    const { actions, store } = seam(owner, orders);

    await expect(
      adminResourceExport({ actions, resource: "users", columns: [{ key: "email" }] }),
    ).rejects.toThrow(/not a resource this admin exposes/);
    expect(store.queryPage).not.toHaveBeenCalled();
  });

  it("has no session at all refused as such, rather than as a permission", async () => {
    const { actions } = seam(null, orders);

    await expect(
      adminResourceExport({ actions, resource: "orders", columns: [{ key: "customer" }] }),
    ).rejects.toThrow(/No session/);
  });

  it("is refused a store that cannot count, rather than answered with the whole table", async () => {
    // The actions a host had before the paged query. An export over them would have to walk with
    // `query`, which cannot say how many rows there are, so the rows it wrote would be however many
    // the store felt like returning and the count beside them would be a count of nothing.
    const persistence = createMemoryPersistenceAdapter();
    await persistence.create("posts", { id: "1", title: "One" });
    const legacy = { ...persistence };
    delete legacy.queryPage;
    const actions = createAdminResourceActions({
      guard: createAdminPermissionGuard({ rule: demoCan, session: () => owner }),
      persistence: legacy,
      expose: exposedResource,
    });

    expect(actions.queryPage).toBeUndefined();
    await expect(
      adminResourceExport({ actions, resource: "posts", columns: [{ key: "title" }] }),
    ).rejects.toThrow(/cannot answer a paged query/);
  });
});

describe("a file large enough to matter", () => {
  it("reads a window at a time rather than the whole set, which a counter shows rather than a promise", async () => {
    // Four windows of 250, and the assertion is about the order of two events rather than about the
    // file: the number of rows the store has produced at the moment the first chunk is in the caller's
    // hand. An implementation that collected the whole set before writing anything would have produced
    // 1,000 rows by then, and this is what fails instead of passing.
    const rows = Array.from({ length: 1000 }, (_, index) => ({ id: `p${index}`, name: `Product ${index}` }));
    const store = recorder([rows], 250);
    const { columns } = products(rows);
    const producedWhen: number[] = [];

    const file = await adminResourceExport({ actions: store.actions, resource: "products", columns });
    const chunks = file.rows[Symbol.asyncIterator]();
    for (let step = await chunks.next(); !step.done; step = await chunks.next()) {
      producedWhen.push(store.produced.rows);
    }

    // The first chunk is the header, and the store has been asked for one window and no more. The
    // second window is not asked for until the first has been handed out row by row, which is what a
    // walk that gathered the set first would not do.
    expect(producedWhen[0]).toBe(250);
    expect(Math.max(...producedWhen.slice(0, 251))).toBe(250);
    expect(producedWhen[251]).toBe(500);
    expect(Math.max(...producedWhen)).toBe(1000);
    expect(producedWhen[producedWhen.length - 1]).toBe(1000);
    expect(producedWhen).toHaveLength(1001);
  });
});

describe("the cells the file holds", () => {
  it("quotes what would end a cell early, and marks what a spreadsheet would run", () => {
    // Each row is a value and the cell it must come out as. A value of `null` is the empty cell, which
    // is what a null and an absent field both look like in a file, and a number is left as a number so
    // a column of them can still be summed.
    const cells: Array<[unknown, string]> = [
      ["plain", "plain"],
      ["with,comma", '"with,comma"'],
      ['with"quote', '"with""quote"'],
      ["with\nnewline", '"with\nnewline"'],
      ["with\r\ncrlf", '"with\r\ncrlf"'],
      ["", ""],
      [null, ""],
      [undefined, ""],
      [0, "0"],
      [false, "false"],
      [4900, "4900"],
      [-3.5, "-3.5"],
      ["=cmd", "'=cmd"],
      ["+1+1", "'+1+1"],
      ["@SUM(1+1)", "'@SUM(1+1)"],
      [" =1+1", "' =1+1"],
      ["\t=1", "'\t=1"],
      ['=HYPERLINK("http://evil","Statement")', '"\'=HYPERLINK(""http://evil"",""Statement"")"'],
      ["'tis the season", "''tis the season"],
      ["'=1+1", "''=1+1"],
      [{ slug: "one" }, '"{""slug"":""one""}"'],
      [[1, 2], '"[1,2]"'],
      [new Date("2026-09-30T10:00:00.000Z"), "2026-09-30T10:00:00.000Z"],
    ];

    for (const [value, expected] of cells) {
      expect(adminCsvCell(value), JSON.stringify(value) ?? "undefined").toBe(expected);
    }
  });

  it("reads a marked cell back as the value it was written from", () => {
    // The mark is a way of writing, not a change to the value, so each of these comes back as itself.
    // The apostrophe cases are the pair that cannot both be handled by one rule: a value of `'=1+1`
    // begins with the mark and is not a formula, and a reader that checked the formula first would
    // strip the wrong apostrophe.
    //
    // Values whose own characters make the cell quoted are not here, because a cell read back is its
    // unquoted text: the round trip through a whole file, quoting and all, is the importer's test.
    const values = [
      "=cmd",
      "+1+1",
      "-1-1",
      "@x",
      " =1+1",
      "'tis",
      "'=1+1",
      "''quoted",
      "-3.5",
      "007",
      "",
    ];

    for (const value of values) {
      expect(adminCsvText(adminCsvCell(value)), value).toBe(value);
    }
  });

  it("leaves a cell another writer wrote alone unless it carries a mark this one would have put there", () => {
    // A foreign file is not a file this writer made, so its apostrophes are its own business. The one
    // case that cannot be told apart is a foreign cell holding a marked formula, which reads as the
    // formula: a host with a file full of them has a file this format cannot express.
    expect(adminCsvText("O'Brien")).toBe("O'Brien");
    expect(adminCsvText("'tis")).toBe("'tis");
    expect(adminCsvText("'=cmd")).toBe("=cmd");
  });
});

describe("the columns the file has", () => {
  it("prints a value the row does not hold as an empty cell, whatever the format says", async () => {
    const actions = {
      queryPage: async <T>() => ({ rows: [{ id: "p1", name: "Lamp" }] as T[], total: 1 }),
    };

    const file = await adminResourceExport({
      actions,
      resource: "products",
      columns: [
        { key: "name", header: "Name" },
        { key: "price_cents", header: "Price", format: "money" },
        { key: "note" },
      ],
    });
    const { text } = await read(file);

    // A dash in a numeric column is a column no one can sum, and an unnamed column is a header the
    // reader has to decode, so both say what the row actually holds.
    expect(text).toBe("Name,Price,note\nLamp,,\n");
  });

  it("asks the host's own formatters before the two it ships", async () => {
    const actions = {
      queryPage: async <T>() => ({ rows: [{ id: "p1", total: 4900 }] as T[], total: 1 }),
    };
    const formatters = { money: (value: unknown) => `EUR ${(value as number) / 100}` };

    const file = await adminResourceExport({
      actions,
      resource: "orders",
      columns: [{ key: "total", header: "Total", format: "money" }],
      formatters,
    });

    expect((await read(file)).text).toBe("Total\nEUR 49\n");
  });

  it("refuses a format nothing answers, before the store is asked", async () => {
    const asked = vi.fn();
    const actions = { queryPage: asked as never };

    await expect(
      adminResourceExport({
        actions,
        resource: "orders",
        columns: [{ key: "total", format: { name: "dollars" } }],
      }),
    ).rejects.toThrow(/nothing answers/);
    expect(asked).not.toHaveBeenCalled();
  });

  it("refuses a column that is not a top-level field, and one that names no field at all", async () => {
    const actions = { queryPage: (async () => ({ rows: [], total: 0 })) as never };

    await expect(
      adminResourceExport({
        actions,
        resource: "products",
        columns: [{ key: "meta.slug" }],
      }),
    ).rejects.toThrow(/nested path/);
    await expect(
      adminResourceExport({ actions, resource: "products", columns: [] }),
    ).rejects.toThrow(/no columns/);
  });
});

describe("the response a route hands back", () => {
  it("carries the file, the type and the name", async () => {
    const actions = {
      queryPage: async <T>() => ({ rows: [{ id: "p1", name: "Amber lamp" }] as T[], total: 1 }),
    };

    const response = await adminResourceExportResponse({
      actions,
      resource: "products",
      filename: "orders-2026-09-30.csv",
      columns: [{ key: "id" }, { key: "name" }],
    });

    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="orders-2026-09-30.csv"');
    expect(await response.text()).toBe("id,name\r\np1,Amber lamp\r\n");
  });

  it("strips a name that would write a second header, because a filename is a string the caller chose", async () => {
    const actions = {
      queryPage: async <T>() => ({ rows: [] as T[], total: 0 }),
    };

    const response = await adminResourceExportResponse({
      actions,
      resource: "products",
      filename: 'a"\r\nx-injected: 1\r\n.csv',
      columns: [{ key: "id" }],
    });

    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toBe('attachment; filename="a-x-injected-1-.csv"');
    // A response whose headers are read as a set rather than as a string would show the injected one
    // as a header of its own, which is what a name carrying a newline is for.
    expect([...response.headers.keys()].filter((name) => name === "x-injected")).toEqual([]);
  });
});
