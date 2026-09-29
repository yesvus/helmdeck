// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { createSqlitePersistenceAdapter } from "../src/baseline/sqlite";
import { adminResourceQuery } from "../src/adapters/query";
import type { AdminPersistenceAdapter } from "../src/adapters/index";

/**
 * The paged form of the query, asked of both stores this repository ships.
 *
 * The two are asked the same questions through the same code, because a property one of them
 * answers and the other does not is a store a host has to choose between rather than a list that
 * works. Every assertion names the store it is about, because a failure in a loop that runs both is
 * a failure whose cause is otherwise invisible.
 *
 * A file-backed database rather than a recorded client, for the same reason the rest of the SQLite
 * tests use one: a fake client can only confirm the strings it was handed, and what matters here is
 * which rows the statements select.
 */
type Row = { id: string; [key: string]: unknown };

const temporary: string[] = [];

afterEach(() => {
  while (temporary.length > 0) rmSync(temporary.pop()!, { force: true, recursive: true });
});

async function seeded(
  records: Row[],
  options: { resource?: string; url?: string } = {},
): Promise<Array<[string, AdminPersistenceAdapter]>> {
  const resource = options.resource ?? "products";
  const url = options.url ?? (() => {
    const directory = mkdtempSync(join(tmpdir(), "helmdeck-query-"));
    temporary.push(directory);
    return join(directory, "store.db");
  })();
  const memory = createMemoryPersistenceAdapter();
  const sqlite = createSqlitePersistenceAdapter({ url });
  for (const record of records) {
    await memory.create(resource, record);
    await sqlite.create(resource, record);
  }
  return [
    ["the in-memory adapter", memory as AdminPersistenceAdapter],
    ["the SQLite adapter", sqlite],
  ];
}

async function inBothStores(
  records: Row[],
  body: (name: string, store: AdminPersistenceAdapter) => Promise<void>,
  options?: { resource?: string; url?: string },
): Promise<void> {
  for (const [name, store] of await seeded(records, options)) {
    await body(name, store);
  }
}

/** A catalogue with the shapes a comparison has to tell apart: text, numbers, booleans, nulls. */
function catalogue(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${String(index).padStart(4, "0")}`,
    name: `Product ${index}`,
    // Two values, so an ordering on this field ties and a page boundary has to be decided by
    // something other than the ordering itself.
    shelf: `A${index % 2}`,
    price_cents: index * 100,
    in_stock: index % 3 !== 0,
    discontinued: index % 7 === 0,
    note: index % 5 === 0 ? null : `note ${index}`,
    meta: { slug: `product-${index % 3}` },
  }));
}

describe("the count a page carries", () => {
  // Four thousand and three, because 4,003 is the number that cannot be mistaken for the page: a
  // store of 4,040 would make a count taken from a window of 40 look right.
  const records = catalogue(4003);

  it("is what the query matched, not the length of the rows it sent", async () => {
    await inBothStores(
      records,
      async (name, store) => {
        const page = await store.queryPage<Row>("products", { window: { offset: 0, limit: 40 } });

        expect(page.rows.length, name).toBe(40);
        expect(page.total, name).toBe(4003);
      },
      { url: "file::memory:" },
    );
  });

  it("stays the whole count on the last page, which is short", async () => {
    // The failure a single page cannot see: 4,003 is 100 full pages and 3 rows, so a count taken
    // after the window says 3 here and 40 on every page before it.
    await inBothStores(
      records,
      async (name, store) => {
        const page = await store.queryPage<Row>("products", { window: { offset: 4000, limit: 40 } });

        expect(page.rows.map((row) => row.id), name).toEqual(["p4000", "p4001", "p4002"]);
        expect(page.total, name).toBe(4003);
      },
      { url: "file::memory:" },
    );
  });

  it("is what the filter matched, not what the table holds", async () => {
    // The easy case to pass by accident is the one with no filter, so the store here holds 4,003
    // rows and the filter keeps 1,143 of them, and the count has to be the smaller number.
    await inBothStores(
      catalogue(300),
      async (name, store) => {
        const matched = await store.queryPage<Row>("products", {
          filter: [{ field: "discontinued", operator: "eq", value: true }],
          window: { offset: 0, limit: 40 },
        });

        expect(matched.total, name).toBe(43);
        expect(matched.rows.length, name).toBe(40);
        expect(matched.rows.every((row) => row.discontinued === true), name).toBe(true);

        // And the store still holds the 300 it was seeded with, so the count is not a count of the
        // table by another name.
        expect(await store.query("products"), name).toHaveLength(300);
      },
      { url: "file::memory:" },
    );
  });

  it("is zero when the filter matches nothing, which is an answer rather than a failure", async () => {
    await inBothStores(catalogue(20), async (name, store) => {
      const page = await store.queryPage<Row>("products", {
        filter: [{ field: "name", operator: "eq", value: "A product nobody stocks" }],
      });

      expect(page.rows, name).toEqual([]);
      expect(page.total, name).toBe(0);
    });
  });

  it("counts what the search matched, so a narrowed list is not offered the whole store", async () => {
    await inBothStores(catalogue(60), async (name, store) => {
      const page = await store.queryPage<Row>("products", {
        search: "Product 3",
        window: { offset: 0, limit: 40 },
      });

      // 3, and the ten rows from 30 to 39 whose names begin with it. Sixty in the store, so a
      // count that ignored the term would be ten times what the list is showing.
      expect(page.total, name).toBe(11);
      expect(page.rows.map((row) => row.id), name).toEqual([
        "p0003",
        "p0030",
        "p0031",
        "p0032",
        "p0033",
        "p0034",
        "p0035",
        "p0036",
        "p0037",
        "p0038",
        "p0039",
      ]);
    });
  });
});

describe("the search the store does", () => {
  it("reaches values the caller never asked to display", async () => {
    // The search reads the record, not the columns a list happens to draw, so a term in a field no
    // table shows still finds the record. A view that filtered what it fetched could not do this.
    const records: Row[] = [
      { id: "a", name: "Amber lamp", warehouse: "aisle 12" },
      { id: "b", name: "Ash desk", warehouse: "aisle 4" },
    ];

    await inBothStores(records, async (name, store) => {
      const page = await store.queryPage<Row>("products", { search: "aisle 12" });

      expect(page.rows.map((row) => row.id), name).toEqual(["a"]);
      expect(page.total, name).toBe(1);
    });
  });

  it("folds case, because a term typed in a box is not a case-sensitive thing", async () => {
    const records: Row[] = [
      { id: "a", name: "Amber lamp" },
      { id: "b", name: "Brass light" },
    ];

    await inBothStores(records, async (name, store) => {
      expect((await store.queryPage<Row>("products", { search: "AMBER" })).rows.map((row) => row.id), name).toEqual(["a"]);
      expect((await store.queryPage<Row>("products", { search: "lIgHt" })).rows.map((row) => row.id), name).toEqual(["b"]);
    });
  });

  it("takes a term literally, so a wildcard is a character and not a pattern", async () => {
    // A term holding a pattern's own characters is a term. A search that handed it to a pattern
    // match would answer with every row and count them all, which looks like a working search box.
    const records: Row[] = [
      { id: "a", name: "100% cotton" },
      { id: "b", name: "50% wool" },
      { id: "c", name: "linen" },
    ];

    await inBothStores(records, async (name, store) => {
      const percent = await store.queryPage<Row>("products", { search: "0%" });
      expect(percent.rows.map((row) => row.id), name).toEqual(["a", "b"]);
      expect(percent.total, name).toBe(2);

      const quote = await store.queryPage<Row>("products", { search: "50% wool'" });
      expect(quote.total, name).toBe(1);

      // A quote in the term is a quote, so the statement it reaches is not broken by it.
      const broken = await store.queryPage<Row>("products", { search: "' OR 1=1 --" });
      expect(broken.total, name).toBe(0);
    });
  });

  it("reads a boolean as the word a person would search for", async () => {
    const records: Row[] = [
      { id: "a", name: "Live", published: true },
      { id: "b", name: "Draft", published: false },
    ];

    await inBothStores(records, async (name, store) => {
      expect((await store.queryPage<Row>("products", { search: "true" })).rows.map((row) => row.id), name).toEqual(["a"]);
      expect((await store.queryPage<Row>("products", { search: "false" })).rows.map((row) => row.id), name).toEqual(["b"]);
    });
  });

  it("does not match a record the term is absent from, even when the term is one character", async () => {
    await inBothStores(catalogue(10), async (name, store) => {
      expect((await store.queryPage<Row>("products", { search: "0" })).total, name).toBeGreaterThan(0);
      expect((await store.queryPage<Row>("products", { search: "nothing here at all" })).total, name).toBe(0);
    });
  });
});

describe("the ordering the store applies", () => {
  it("settles a tie on the id, so paging through it neither repeats a row nor drops one", async () => {
    // Every row ties on `shelf`, so the ordering alone says nothing about which row is the tenth.
    // Paging the whole store and collecting what came back is the only way to see a tie broken
    // differently on each page, which is how a row goes missing without any page looking wrong.
    const records = catalogue(97);

    await inBothStores(
      records,
      async (name, store) => {
        const collected: string[] = [];
        for (let page = 0; page < 3; page += 1) {
          const answer = await store.queryPage<Row>("products", {
            sort: [{ field: "shelf", direction: "asc" }],
            window: { offset: page * 40, limit: 40 },
          });
          expect(answer.total, name).toBe(97);
          collected.push(...answer.rows.map((row) => row.id));
        }

        expect(collected.length, name).toBe(97);
        expect(new Set(collected).size, name).toBe(97);
        // The two shelves, in order, with the last page holding the seventeen that are left.
        expect(collected.slice(0, 2), name).toEqual(["p0000", "p0002"]);
        expect(collected[collected.length - 1], name).toBe("p0096");
      },
      { url: "file::memory:" },
    );
  });

  it("keeps the tiebreak out of the direction that was asked for", async () => {
    // Descending reverses what the caller ordered by and nothing else, so two rows tied on the
    // sorted field are still read in id order rather than reversed with everything else.
    const records: Row[] = [
      { id: "b", shelf: "A" },
      { id: "a", shelf: "A" },
      { id: "c", shelf: "A" },
    ];

    await inBothStores(records, async (name, store) => {
      const descending = await store.queryPage<Row>("products", {
        sort: [{ field: "shelf", direction: "desc" }],
      });

      expect(descending.rows.map((row) => row.id), name).toEqual(["a", "b", "c"]);
    });
  });

  it("orders by a second field when the first leaves rows tied", async () => {
    const records: Row[] = [
      { id: "a", shelf: "B", name: "second" },
      { id: "b", shelf: "A", name: "second" },
      { id: "c", shelf: "A", name: "first" },
      { id: "d", shelf: "B", name: "first" },
    ];

    await inBothStores(records, async (name, store) => {
      const ordered = await store.queryPage<Row>("products", {
        sort: [
          { field: "shelf", direction: "asc" },
          { field: "name", direction: "desc" },
        ],
      });

      expect(ordered.rows.map((row) => row.id), name).toEqual(["b", "c", "a", "d"]);
    });
  });

  it("reads nothing first, then numbers, then text, as a store's own order does", async () => {
    // The order of storage classes rather than the order a string comparison would produce: a
    // number is below a text value however the two would compare as text, and a null is below
    // both. The two stores have to agree on this, or the same records page differently.
    const records: Row[] = [
      { id: "a", rank: "text" },
      { id: "b", rank: 2 },
      { id: "c", rank: null },
      { id: "d", rank: 10 },
      { id: "e" },
    ];

    await inBothStores(records, async (name, store) => {
      const ordered = await store.queryPage<Row>("products", { sort: [{ field: "rank", direction: "asc" }] });

      expect(ordered.rows.map((row) => row.id), name).toEqual(["c", "e", "d", "b", "a"]);
      expect(ordered.total, name).toBe(5);
    });
  });

  it("leaves the store's own order in place when nothing is asked for", async () => {
    const records = catalogue(5);

    await inBothStores(
      records,
      async (name, store) => {
        const ordered = await store.queryPage<Row>("products");
        expect(ordered.rows.map((row) => row.id), name).toEqual(["p0000", "p0001", "p0002", "p0003", "p0004"]);
        expect(ordered.total, name).toBe(5);
      },
      { url: "file::memory:" },
    );
  });
});

describe("the four parts of a query at once", () => {
  it("compose into one answer rather than four answers", async () => {
    // Search, filter, sort and window together, over a store big enough for each of them to be
    // able to hide a part that was dropped: a term that matches 1,000 rows, a filter that keeps a
    // third of those, an ordering and a window inside what is left.
    const records = catalogue(1000);

    await inBothStores(
      records,
      async (name, store) => {
        const page = await store.queryPage<Row>(
          "products",
          adminResourceQuery()
            .search("product 1")
            .where("in_stock", "eq", true)
            .sort("price_cents", "desc")
            .window(20, 10)
            .build(),
        );

        // Every row named has the term in it, is in stock, and sits inside the window of the
        // prices the term left, in descending order.
        expect(page.total, name).toBe(111);
        expect(page.rows, name).toHaveLength(10);
        expect(page.rows.every((row) => row.in_stock === true), name).toBe(true);
        const prices = page.rows.map((row) => row.price_cents as number);
        expect(prices, name).toEqual([...prices].sort((left, right) => right - left));

        // The window is inside the matched set and not inside the store: the same query with no
        // window answers every one of them, so the ten above are the twenty-first through the
        // thirtieth of 111 rather than of 1,000.
        const all = await store.queryPage<Row>("products", {
          search: "product 1",
          filter: [{ field: "in_stock", operator: "eq", value: true }],
        });
        expect(all.total, name).toBe(111);
        expect(all.rows.map((row) => row.id), name).toEqual(page.rows.map((row) => row.id));
        expect(all.rows.slice(0, 20).map((row) => row.id), name).not.toContain(page.rows[0].id);
      },
      { url: "file::memory:" },
    );
  });

  it("asks for a window with no search, no filter and no ordering, and counts the whole store", async () => {
    await inBothStores(catalogue(45), async (name, store) => {
      const page = await store.queryPage<Row>("products", { window: { offset: 40, limit: 40 } });

      expect(page.rows, name).toHaveLength(5);
      expect(page.total, name).toBe(45);
    });
  });

  it("answers a window that reaches past the last record as no rows and the whole count", async () => {
    // What a list needs to know when a page is out of date: not an empty resource, but a count
    // that says there is something and a window that is past the end of it.
    await inBothStores(catalogue(12), async (name, store) => {
      const page = await store.queryPage<Row>("products", { window: { offset: 400, limit: 40 } });

      expect(page.rows, name).toEqual([]);
      expect(page.total, name).toBe(12);
    });
  });

  it("refuses a query it cannot read, rather than answering part of it", async () => {
    await inBothStores(catalogue(3), async (name, store) => {
      await expect(store.queryPage("products", { limit: 10 } as never), name).rejects.toThrow(
        /cannot be used/,
      );
      // Reaching the store at all would be the failure, so nothing was created by the refusal.
      expect(await store.query("products"), name).toHaveLength(3);
    });
  });
});

describe("the two stores answering the same question", () => {
  const records: Row[] = [
    { id: "r1", status: "live", views: 10, title: "Alpha", published: true, note: null, meta: { slug: "one" } },
    { id: "r2", status: "draft", views: 20, title: "beta", published: false, note: "second", meta: { slug: "two" } },
    { id: "r3", status: "live", views: 30, title: "Gamma", published: true, note: "third", meta: { slug: "one" } },
    { id: "r4", status: "archived", views: 40, title: "delta", published: false, meta: { slug: "three" } },
    { id: "r5", status: "live", views: 50, title: "Epsilon", published: true, note: null, meta: { slug: "one" } },
  ];

  const queries: Array<[string, Parameters<AdminPersistenceAdapter["queryPage"]>[1]]> = [
    ["nothing asked for", undefined],
    ["a term", { search: "alpha" }],
    ["a term in a nested value's own resource", { search: "second" }],
    ["a term nothing holds", { search: "no such thing" }],
    ["equality", { filter: [{ field: "status", operator: "eq", value: "live" }] }],
    ["inequality, including the rows with no such field", { filter: [{ field: "note", operator: "ne", value: null }] }],
    ["greater than", { filter: [{ field: "views", operator: "gt", value: 20 }] }],
    ["greater than or equal", { filter: [{ field: "views", operator: "gte", value: 30 }] }],
    ["less than", { filter: [{ field: "views", operator: "lt", value: 30 }] }],
    ["less than or equal", { filter: [{ field: "views", operator: "lte", value: 20 }] }],
    ["a list to match", { filter: [{ field: "status", operator: "in", value: ["draft", "archived"] }] }],
    ["a list including null", { filter: [{ field: "note", operator: "in", value: [null, "third"] }] }],
    ["a term inside a value", { filter: [{ field: "title", operator: "contains", value: "TA" }] }],
    ["a term inside a boolean", { filter: [{ field: "published", operator: "contains", value: "true" }] }],
    ["null", { filter: [{ field: "note", operator: "isNull" }] }],
    ["not null", { filter: [{ field: "note", operator: "notNull" }] }],
    ["a field some records do not have", { filter: [{ field: "note", operator: "notNull" }] }],
    ["a nested field", { filter: [{ field: "meta.slug", operator: "eq", value: "one" }] }],
    ["two comparisons at once", {
      filter: [
        { field: "status", operator: "eq", value: "live" },
        { field: "views", operator: "gte", value: 30 },
      ],
    }],
    ["an ordering ascending", { sort: [{ field: "views", direction: "asc" }] }],
    ["an ordering descending", { sort: [{ field: "views", direction: "desc" }] }],
    ["an ordering on text", { sort: [{ field: "title", direction: "asc" }] }],
    ["an ordering on a field some records lack", { sort: [{ field: "note", direction: "asc" }] }],
    ["two orderings", {
      sort: [
        { field: "status", direction: "asc" },
        { field: "views", direction: "desc" },
      ],
    }],
    ["a window", { window: { offset: 2, limit: 2 } }],
    ["a window past the end", { window: { offset: 40, limit: 10 } }],
    ["all four", {
      search: "a",
      filter: [{ field: "status", operator: "ne", value: "archived" }],
      sort: [{ field: "title", direction: "desc" }],
      window: { offset: 1, limit: 2 },
    }],
  ];

  for (const [what, query] of queries) {
    it(`answer the same rows in the same order with the same total to ${what}`, async () => {
      // Each store is asked on its own, and the two answers are compared rather than checked
      // against a list written out here: a filter one store applies and the other does not shows
      // up as a disagreement, which is the bug this is here for.
      const [memory, sqlite] = await seeded(records);
      const [, memoryStore] = memory;
      const [, sqliteStore] = sqlite;

      const fromMemory = await memoryStore.queryPage<Row>("products", query);
      const fromSqlite = await sqliteStore.queryPage<Row>("products", query);

      // The sets are compared first, so a failure says which of the two stores answered wrongly
      // rather than only that they differ.
      expect([...fromSqlite.rows].sort(byId), what).toEqual([...fromMemory.rows].sort(byId));
      expect(fromSqlite.total, what).toBe(fromMemory.total);
      expect(fromSqlite.rows.map(byId), what).toEqual(fromMemory.rows.map(byId));
    });
  }

  it("are not both empty, or a pair of stores that answer nothing would pass every case above", async () => {
    const [[, memoryStore], [, sqliteStore]] = await seeded(records);
    const page = await memoryStore.queryPage<Row>("products", { sort: [{ field: "views", direction: "desc" }] });

    expect(page.total).toBe(5);
    expect(page.rows.map(byId)).toEqual(["r5", "r4", "r3", "r2", "r1"]);
    expect((await sqliteStore.queryPage<Row>("products")).rows.map(byId)).toEqual([
      "r1",
      "r2",
      "r3",
      "r4",
      "r5",
    ]);
  });

  it("agree about a search over a document's nested values, which neither store walks into", async () => {
    // Stated rather than left to be discovered: the search reads the top level of a record, so a
    // term only in a nested value finds nothing in either store, and finds nothing for the same
    // reason.
    const [[, memoryStore], [, sqliteStore]] = await seeded(records);

    const memoryPage = await memoryStore.queryPage<Row>("products", { search: "one" });
    const sqlitePage = await sqliteStore.queryPage<Row>("products", { search: "one" });

    expect(memoryPage.total).toBe(0);
    expect(sqlitePage.total).toBe(memoryPage.total);
  });
});

function byId(row: Row): string {
  return row.id;
}

describe("the query the older form reads", () => {
  const records: Row[] = [
    { id: "r1", status: "live", views: 10, published: true, note: null },
    { id: "r2", status: "draft", views: 20, published: false, note: "second" },
    { id: "r3", status: "live", views: 30, published: true },
  ];

  it("still reads a map of exact values, in both stores", async () => {
    await inBothStores(records, async (name, store) => {
      const live = await store.query<Row>("products", { status: "live" });
      expect(live.map(byId), name).toEqual(["r1", "r3"]);

      expect(await store.query<Row>("products", { status: "live", views: 10 }), name).toHaveLength(1);
      expect(await store.query<Row>("products", { status: "nope" }), name).toEqual([]);
      expect(await store.query<Row>("products"), name).toHaveLength(3);
    });
  });

  it("still tells a boolean from a number and a number from its own text", async () => {
    // The exactness the older reading rests on, and the one several call sites depend on: a record
    // storing `true` is not a record storing `1`.
    await inBothStores(
      [
        { id: "flag", published: true },
        { id: "one", published: 1 },
        { id: "text", published: "1" },
        { id: "code", code: 5 },
        { id: "codeText", code: "5" },
      ],
      async (name, store) => {
        expect((await store.query<Row>("products", { published: true })).map(byId), name).toEqual(["flag"]);
        expect((await store.query<Row>("products", { published: 1 })).map(byId), name).toEqual(["one"]);
        expect((await store.query<Row>("products", { code: 5 })).map(byId), name).toEqual(["code"]);
        expect((await store.query<Row>("products", { code: "5" })).map(byId), name).toEqual(["codeText"]);
      },
    );
  });

  it("still finds a record storing null without claiming one that never had the field", async () => {
    await inBothStores(records, async (name, store) => {
      const found = await store.query<Row>("products", { note: null });
      expect(found.map(byId), name).toEqual(["r1"]);
    });
  });

  it("has no way to be sent a window, a sort or a limit, which are the paged form's own parts", async () => {
    // A host that reaches for `query` to page gets a field match on a field nothing stores, which
    // is the empty list the paged form exists to stop being silent about. It is still what it
    // always was, and the paged form is a member beside it rather than a change to it.
    await inBothStores(records, async (name, store) => {
      expect(await store.query<Row>("products", { limit: 2 }), name).toEqual([]);
      expect(await store.query<Row>("products", { sort: "views" }), name).toEqual([]);
      expect(await store.query<Row>("products", { window: { offset: 0, limit: 2 } }), name).toEqual([]);
    });
  });

  it("is still the call a list makes when its adapter cannot page", async () => {
    // The compatibility the whole design rests on, checked through the adapter rather than through
    // a type: a store that never heard of `queryPage` is an adapter, and a one-argument query is
    // all it is asked.
    await inBothStores(records, async (name, store) => {
      const legacy: AdminPersistenceAdapter = {
        read: (resource, id) => store.read(resource, id),
        query: (resource, query) => store.query(resource, query),
        create: (resource, value) => store.create(resource, value),
        update: (resource, id, value) => store.update(resource, id, value),
        delete: (resource, id) => store.delete(resource, id),
      };

      expect(legacy.queryPage, name).toBeUndefined();
      expect((await legacy.query<Row>("products")).map(byId), name).toEqual(["r1", "r2", "r3"]);
    });
  });
});
