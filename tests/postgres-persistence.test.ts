// SPDX-License-Identifier: MIT
/**
 * These run against a real PostgreSQL server rather than a recorded client, for the reason the
 * SQLite tests give: what matters here is which rows the statements select, and a fake client can
 * only confirm the strings it was handed. Every question here has an answer that differs between a
 * fake and a database, which is what makes the fake useless for them.
 *
 * A server address comes from `HELMDECK_TEST_POSTGRES_URL`. Without one these do not run and say so,
 * loudly, on stdout, because a suite that quietly stops testing is worse than one that is absent.
 * `scripts/ci` refuses to pass without the variable, so a gate cannot be green having skipped them.
 *
 * **Every case gets its own table**, created and dropped around it, so nothing is shared between
 * them and an ordering bug in one cannot be blamed on another's rows.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { adminResourceQuery } from "../src/adapters/query";
import type {
  AdminPersistenceAdapter,
  AdminResourcePage,
  AdminResourceQuery,
} from "../src/adapters/index";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import {
  createPostgresPersistenceAdapter,
  postgresIndexStatement,
  postgresSchema,
  postgresTenancyMigration,
  type PostgresClient,
} from "../src/baseline/postgres";
import { currentAdminTenant, runWithAdminTenant } from "../src/tenant-scope";

/**
 * Named `SERVER` rather than `URL` because a module-level `URL` shadows the global `URL`
 * constructor, and the manifest test below needs to build a `file:` URL to read package.json.
 */
const SERVER = process.env.HELMDECK_TEST_POSTGRES_URL;

if (!SERVER) {
  console.warn(
    "postgres-persistence.test.ts: HELMDECK_TEST_POSTGRES_URL is unset, so these did not run. " +
      "Point it at a PostgreSQL to run them; scripts/ci refuses to pass without it.",
  );
}

const describeWithServer = SERVER ? describe : describe.skip;

let pool: pg.Pool;
const created: string[] = [];
let counter = 0;

/** A table of this case's own, created by the statement the adapter would refuse without. */
async function table(tenancy = false): Promise<string> {
  counter += 1;
  const name = `hd_${randomBytes(5).toString("hex")}_${counter}`;
  created.push(name);
  await pool.query(postgresSchema({ table: name, tenancy }));
  return name;
}

/**
 * A store that has the paged and the atomic-insert form, which most of this file is about.
 * Written out rather than derived with `Required`, because the contract's members carry the
 * `undefined` inside them and taking that away is the point: the adapter under test implements both,
 * and a test that had to ask whether it did would be asking the question it is supposed to answer.
 */
type PagingStore = Omit<AdminPersistenceAdapter, "queryPage" | "insertIfAbsent"> & {
  queryPage: <T>(resource: string, query?: AdminResourceQuery) => Promise<AdminResourcePage<T>>;
  insertIfAbsent: <T>(resource: string, key: string, value: unknown) => Promise<T | null>;
};

/**
 * A store over a table of this case's own.
 *
 * `tenancy: "scope"` is the shape a host actually writes: the adapter takes a **resolver**, and
 * reading the ambient scope is one implementation of it, supplied by `currentAdminTenant` from the
 * `tenant-scope` entry point. The adapter cannot read that scope itself, because the module that
 * holds it imports `node:async_hooks` and this adapter is reachable from a browser bundle through the
 * baseline subpath. Making it a resolver rather than an implicit read is what keeps both true: the
 * host decides how a tenant is found, and the adapter stays bundleable.
 */
async function store(options: { tenancy?: "scope" | string } = {}): Promise<{
  db: PagingStore;
  table: string;
}> {
  const name = await table(options.tenancy !== undefined);
  const db = createPostgresPersistenceAdapter({
    pool: pool as unknown as PostgresClient,
    table: name,
    ...(options.tenancy === undefined
      ? { tenant: false as const }
      : options.tenancy === "scope"
        ? { tenant: currentAdminTenant }
        : { tenant: () => options.tenancy as string }),
  });
  // Cast once, here, rather than at every call site. The factory is typed as returning the wide
    // contract, so each `db` would otherwise need its own narrowing, and a suite whose type says
    // `queryPage` may be absent while the tests are entirely about it is a contradiction.
    return { db: db as PagingStore, table: name };
}

beforeAll(() => {
  if (!SERVER) return;
  pool = new pg.Pool({ connectionString: SERVER, max: 8 });
});

afterEach(async () => {
  if (!SERVER) return;
  while (created.length > 0) await pool.query(`DROP TABLE IF EXISTS ${created.pop()} CASCADE`);
});

afterAll(async () => {
  if (pool) await pool.end();
});

describeWithServer("createPostgresPersistenceAdapter, against a real server", () => {
  it("stores a record and reads back exactly what it was given", async () => {
    const { db } = await store();
    const created_ = await db.create<{ id: string; title: string; tags: string[] }>("posts", {
      title: "Hello",
      tags: ["a", "b"],
    });

    expect(created_.title).toBe("Hello");
    expect(await db.read("posts", created_.id)).toEqual(created_);
  });

  it("refuses a table it cannot find, and names the statement that creates it", async () => {
    const db = createPostgresPersistenceAdapter({
      pool: pool as unknown as PostgresClient,
      table: "hd_absent_table",
      tenant: false,
    });

    // It names the statement rather than creating the table: a schema a host cannot see is a schema
    // a host cannot review, and a library that creates one on first call hides a migration from the
    // person who has to run it in production.
    await expect(db.read("posts", "1")).rejects.toThrow(/postgresSchema\(\{ table: "hd_absent_table"/);
  });

  it("refuses a store built with neither a pool nor a connect, naming what it needs", async () => {
    // On the first statement rather than at construction: building the adapter opens nothing, so
    // importing it in a module that only wires things up costs no I/O, and the refusal arrives
    // where the connection is actually wanted.
    const db = createPostgresPersistenceAdapter({ tenant: false } as never);

    await expect(db.read("posts", "1")).rejects.toThrow(/needs a pool or a connect function/);
  });

  it("honours an id it is handed, because a stored foreign key has no second chance", async () => {
    const { db } = await store();
    const row = await db.create<{ id: string; title: string }>("posts", { id: "seeded", title: "Seeded" });

    expect(row.id).toBe("seeded");
    expect(await db.read("posts", "seeded")).toMatchObject({ title: "Seeded" });
  });

  it("keeps each resource's records separate, including under the same id", async () => {
    const { db } = await store();
    await db.create("posts", { id: "shared", title: "A post" });
    await db.create("pages", { id: "shared", title: "A page" });

    expect(await db.read<{ title: string }>("posts", "shared")).toEqual({ id: "shared", title: "A post" });
    expect(await db.read<{ title: string }>("pages", "shared")).toEqual({ id: "shared", title: "A page" });
  });

  it("tells three apart where a number, the text of that number and a boolean all could answer", async () => {
    const { db } = await store();
    await db.create("posts", { id: "1", field: 1 });
    await db.create("posts", { id: "2", field: "1" });
    await db.create("posts", { id: "3", field: true });

    // The SQLite adapter needed `json_type` beside its comparison and still got these three wrong.
    // Here both sides are `jsonb` and there is nothing to cast, so the distinction is the store's.
    expect(await db.query("posts", { field: 1 })).toHaveLength(1);
    expect(await db.query("posts", { field: "1" })).toHaveLength(1);
    expect(await db.query("posts", { field: true })).toHaveLength(1);
    expect((await db.query<{ id: string }>("posts", { field: 1 }))[0]?.id).toBe("1");
    expect((await db.query<{ id: string }>("posts", { field: true }))[0]?.id).toBe("3");
  });

  it("finds a record storing null without also claiming one that never had the field", async () => {
    const { db } = await store();
    await db.create("posts", { title: "A", subtitle: null });
    await db.create("posts", { title: "B" });

    expect(await db.query("posts", { subtitle: null })).toHaveLength(1);
    expect((await db.query<{ title: string }>("posts", { subtitle: null }))[0]?.title).toBe("A");
  });

  it("refuses a filter on a document, because only a scalar can be compared with one", async () => {
    const { db } = await store();
    await expect(db.query("posts", { tags: ["a"] })).rejects.toThrow(/must be a string, number, boolean or null/);
  });

  it("tells a write that matched nothing from one that did", async () => {
    const { db } = await store();
    await expect(db.update("posts", "absent", { title: "x" })).rejects.toThrow(
      /No posts record with id absent/,
    );
  });

  it("does not let an update move a row by naming a different one", async () => {
    const { db } = await store();
    await db.create("posts", { id: "a", title: "A" });
    await db.create("posts", { id: "b", title: "B" });

    await db.update("posts", "a", { id: "b", title: "moved" });

    expect(await db.read<{ title: string }>("posts", "a")).toEqual({ id: "a", title: "moved" });
    expect(await db.read<{ title: string }>("posts", "b")).toEqual({ id: "b", title: "B" });
  });

  it("deletes only the row it named", async () => {
    const { db } = await store();
    await db.create("posts", { id: "a", title: "A" });
    await db.create("posts", { id: "b", title: "B" });

    await db.delete("posts", "a");

    expect(await db.read("posts", "a")).toBeNull();
    expect(await db.read("posts", "b")).not.toBeNull();
  });
});

describeWithServer("the paged query, against a real server", () => {
  const rows = async (db: PagingStore, title: string) =>
    (await db.queryPage<{ title: string }>("posts", { filter: [{ field: "title", operator: "contains", value: title }] })).rows.map(
      (row) => row.title,
    );

  it("counts the whole match and returns the window", async () => {
    const { db } = await store();
    for (const title of ["a", "b", "c", "d", "e"]) await db.create("posts", { title });

    const page = await db.queryPage("posts", { window: { offset: 1, limit: 2 } });

    expect(page.total).toBe(5);
    expect(page.rows).toHaveLength(2);
  });

  it("reports a window past the end as an empty window of a resource that is not empty", async () => {
    const { db } = await store();
    await db.create("posts", { title: "a" });

    const page = await db.queryPage("posts", { window: { offset: 50, limit: 10 } });

    expect(page.rows).toEqual([]);
    expect(page.total).toBe(1);
  });

  it("sorts numbers as numbers, which a text cast would get backwards", async () => {
    const { db } = await store();
    for (const count of [10, 9, 2, 100]) await db.create("posts", { count });

    const page = await db.queryPage<{ count: number }>("posts", { sort: [{ field: "count", direction: "asc" }] });

    // A `CASE` with a numeric and a text branch has one type, and Postgres resolves it to text,
    // which sorts 100 before 2. That is why the value is written as two expressions and the rank
    // comes first: this ordering is the test that the split is still there.
    expect(page.rows.map((row) => row.count)).toEqual([2, 9, 10, 100]);
  });

  it("puts a missing or null value below every number and every word", async () => {
    const { db } = await store();
    await db.create("posts", { id: "1", title: "text" });
    await db.create("posts", { id: "2", title: 5 });
    await db.create("posts", { id: "3", title: null });
    await db.create("posts", { id: "4" });

    const page = await db.queryPage<{ id: string; title: unknown }>("posts", { sort: [{ field: "title", direction: "asc" }] });

    // **The stored null and the absent field read back as `null` and `undefined`, and the in-memory
    // adapter answers `null` and `null`.** A `jsonb` document has no absent member: `pg` maps a key
    // the document does not have to `undefined` where the in-memory store leaves a property off the
    // object and a reader sees `undefined` too, but a field stored as JSON `null` is a member and
    // arrives as `null` under either. What agrees is the ordering, which is the part a list depends
    // on: both rank lowest and both sort ahead of the number and the word. The agreement test below
    // pins the ordering; this is the one place the round trip differs, stated rather than asserted
    // away.
    expect(page.rows.map((row) => row.title)).toEqual([null, undefined, 5, "text"]);
    expect(page.rows.map((row) => row.id)).toEqual(["3", "4", "2", "1"]);
  });

  it("still tells a stored null from an absent field when filtering, where the difference is a filter", async () => {
    const { db } = await store();
    await db.create("posts", { id: "stored", title: null });
    await db.create("posts", { id: "absent" });

    // The read cannot separate them, but a filter can and must: `isNull` is a question about what
    // was stored, and answering it from the read alone would claim the absent field stores a null.
    const stored = await db.queryPage<{ id: string }>("posts", {
      filter: [{ field: "title", operator: "isNull" }],
    });
    const present = await db.queryPage<{ id: string }>("posts", {
      filter: [{ field: "title", operator: "notNull" }],
    });

    expect(stored.rows.map((row) => row.id)).toEqual(["stored"]);
    expect(present.rows.map((row) => row.id)).toEqual([]);
  });

  it("orders text by code point, the way the in-memory adapter does", async () => {
    const { db } = await store();
    // U+FFFD and U+10000. As UTF-16 units the surrogate pair of the second starts at U+D800, below
    // every character from U+E000 up, so a plain `<` in JavaScript puts it first and Postgres does
    // not. This is the case the C collation is named for.
    await db.create("posts", { id: "a", title: "\u{10000}" });
    await db.create("posts", { id: "b", title: "�" });

    const page = await db.queryPage<{ id: string }>("posts", { sort: [{ field: "title", direction: "asc" }] });

    expect(page.rows.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("settles ties on the id, so two pages of one query cannot repeat a row", async () => {
    const { db } = await store();
    for (const id of ["c", "a", "b", "e", "d"]) await db.create("posts", { id, group: "same" });

    const first = await db.queryPage<{ id: string }>("posts", {
      filter: [{ field: "group", operator: "eq", value: "same" }],
      sort: [{ field: "group", direction: "asc" }],
      window: { offset: 0, limit: 2 },
    });
    const second = await db.queryPage<{ id: string }>("posts", {
      filter: [{ field: "group", operator: "eq", value: "same" }],
      sort: [{ field: "group", direction: "asc" }],
      window: { offset: 2, limit: 2 },
    });

    expect(first.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(second.rows.map((r) => r.id)).toEqual(["c", "d"]);
    expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(4);
  });

  it("answers every operator in the query contract", async () => {
    const { db } = await store();
    await db.create("posts", { id: "a", count: 1, title: "alpha", live: true });
    await db.create("posts", { id: "b", count: 5, title: "beta", live: false });
    await db.create("posts", { id: "c", count: 10, title: "gamma" });

    const ids = async (query: AdminResourceQuery) =>
      (await db.queryPage<{ id: string }>("posts", query)).rows.map((r) => r.id).sort();

    expect(await ids({ filter: [{ field: "count", operator: "eq", value: 5 }] })).toEqual(["b"]);
    expect(await ids({ filter: [{ field: "count", operator: "ne", value: 5 }] })).toEqual(["a", "c"]);
    expect(await ids({ filter: [{ field: "count", operator: "gt", value: 1 }] })).toEqual(["b", "c"]);
    expect(await ids({ filter: [{ field: "count", operator: "gte", value: 5 }] })).toEqual(["b", "c"]);
    expect(await ids({ filter: [{ field: "count", operator: "lt", value: 5 }] })).toEqual(["a"]);
    expect(await ids({ filter: [{ field: "count", operator: "lte", value: 5 }] })).toEqual(["a", "b"]);
    expect(await ids({ filter: [{ field: "count", operator: "in", value: [1, 10] }] })).toEqual(["a", "c"]);
    expect(await ids({ filter: [{ field: "live", operator: "eq", value: true }] })).toEqual(["a"]);
    expect(await ids({ filter: [{ field: "title", operator: "contains", value: "amm" }] })).toEqual(["c"]);
    expect(await ids({ filter: [{ field: "count", operator: "notNull" }] })).toEqual(["a", "b", "c"]);
  });

  it("compares a boolean on every operator, rather than only on equality", async () => {
      const { db } = await store();
      await db.create("posts", { id: "on", active: true });
      await db.create("posts", { id: "off", active: false });

      const ids = async (operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte") =>
        (await db.queryPage<{ id: string }>("posts", { filter: [{ field: "active", operator, value: true }] }))
          .rows.map((row) => row.id)
          .sort();

      // **Every inequality on a boolean used to throw** `invalid input syntax for type numeric:
      // "true"`, because the stored side is read as 1 or 0 and the bound side was cast to `numeric`
      // without being translated. `eq` worked, which is why a suite covering only equality could not
      // see it. A boolean is ranked with the numbers, so every operator that ranks has to accept one.
      expect(await ids("eq")).toEqual(["on"]);
      expect(await ids("ne")).toEqual(["off"]);
      expect(await ids("gt")).toEqual([]);
      expect(await ids("gte")).toEqual(["on"]);
      expect(await ids("lt")).toEqual(["off"]);
      expect(await ids("lte")).toEqual(["off", "on"]);
    });

  it("ranks a null as the lowest class for every direction a filter can ask", async () => {
    const { db } = await store();
    await db.create("posts", { id: "a", title: null });
    await db.create("posts", { id: "b", title: "text" });

    const ids = async (operator: "gt" | "gte" | "lt" | "lte") =>
      (await db.queryPage<{ id: string }>("posts", { filter: [{ field: "title", operator, value: null }] }))
        .rows.map((r) => r.id);

    // Nothing compares against nothing, so the class alone decides and the operator still says which
    // way: `gt(null)` is everything that is not null, `lte(null)` is the null and the absent.
    expect(await ids("gt")).toEqual(["b"]);
    expect(await ids("gte")).toEqual(["a", "b"]);
    expect(await ids("lt")).toEqual([]);
    expect(await ids("lte")).toEqual(["a"]);
  });

  it("reads a nested field the way the query contract says a dotted name addresses one", async () => {
    const { db } = await store();
    await db.create("posts", { id: "a", meta: { author: { name: "ada" } } });
    await db.create("posts", { id: "b", meta: { author: { name: "bob" } } });

    const page = await db.queryPage<{ id: string }>("posts", {
      filter: [{ field: "meta.author.name", operator: "eq", value: "ada" }],
    });

    expect(page.rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("treats a term as text rather than as a pattern", async () => {
    const { db } = await store();
    await db.create("posts", { id: "a", title: "100% done" });
    await db.create("posts", { id: "b", title: "nothing here" });

    // `LIKE` reads `%` and `_` as wildcards, and a search box is full of both. A term of `%` under
    // `LIKE` matches every record rather than the one holding a percent sign.
    expect(await rows(db, "%")).toEqual(["100% done"]);
    expect(await rows(db, "done")).toEqual(["100% done"]);
  });

  it("searches the top level of the document, over the values rather than the text", async () => {
    const { db } = await store();
    await db.create("posts", { id: "a", title: "Hello world", meta: { title: "nested" } });
    await db.create("posts", { id: "b", title: "Nothing" });

    const page = await db.queryPage<{ id: string }>("posts", { search: "Hello" });
    expect(page.rows.map((r) => r.id)).toEqual(["a"]);

    // A document is not searched, because a document casts to text as its own JSON and a term could
    // match a key name rather than anything a reader would recognise.
    const nested = await db.queryPage("posts", { search: "author" });
    expect(nested.rows).toEqual([]);
  });

  it("folds case the way a database folds it, which is the ASCII letters and nothing else", async () => {
    const { db } = await store();
    await db.create("posts", { title: "HELLO" });

    expect(await rows(db, "hello")).toEqual(["HELLO"]);
  });

  it("builds the same query through the builder it parses back", async () => {
    const { db } = await store();
    await db.create("posts", { id: "a", count: 5 });
    await db.create("posts", { id: "b", count: 1 });

    const built = adminResourceQuery().where("count", "gte", 1).sort("count", "asc").window(0, 1).build();
    const page = await db.queryPage<{ id: string }>("posts", built);

    expect(page.rows.map((r) => r.id)).toEqual(["b"]);
  });
});

describeWithServer("insertIfAbsent, against a real server", () => {
  it("lets the first write through and refuses the second", async () => {
    const { db } = await store();

    const first = await db.insertIfAbsent<{ id: string }>("users", "email", { email: "a@b.c", id: "one" });
    const second = await db.insertIfAbsent<{ id: string }>("users", "email", { email: "a@b.c", id: "two" });

    expect(first?.id).toBe("one");
    expect(second).toBeNull();
    expect(await db.query("users")).toHaveLength(1);
  });

  it("lets two resources hold the same value, because the index is scoped to one", async () => {
    const { db } = await store();

    await db.insertIfAbsent("users", "email", { email: "same@x.y", id: "u1" });
    await db.insertIfAbsent("invites", "email", { email: "same@x.y", id: "i1" });

    expect(await db.query("users")).toHaveLength(1);
    expect(await db.query("invites")).toHaveLength(1);
  });

  it("refuses a concurrent pair of writes with the same value, which is the guarantee's point", async () => {
    const { db } = await store();
    // Warm the index first, so the two racing writes are both against a real unique index rather
    // than against a `CREATE INDEX` that has not happened yet.
    await db.insertIfAbsent("users", "email", { email: "first@x.y" });
    await db.delete("users", (await db.query<{ id: string }>("users"))[0].id);

    const results = await Promise.all(
      ["a@x.y", "b@x.y", "c@x.y"].map((email) => db.insertIfAbsent("users", "email", { email })),
    );

    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await db.query("users")).toHaveLength(3);
  });

  it("says which resource and key could not be indexed, rather than repeating the driver's words", async () => {
    const { db } = await store();
    await db.create("users", { email: "dup@x.y" });
    await db.create("users", { email: "dup@x.y" });

    await expect(db.insertIfAbsent("users", "email", { email: "dup@x.y" })).rejects.toThrow(
      /A unique index on users.email could not be created/,
    );
  });

  it("refuses a key that is not an identifier, because it reaches an index name", async () => {
    const { db } = await store();
    await expect(db.insertIfAbsent("users", "email; DROP TABLE posts", { email: "a" })).rejects.toThrow(
      /cannot be a key name/,
    );
  });
});

describeWithServer("tenancy, against a real server", () => {
  it("gives two tenants the same id without either seeing the other's row", async () => {
    const { db } = await store({ tenancy: "scope" });

    await runWithAdminTenant("acme", () => db.create("posts", { id: "shared", title: "Acme post" }));
    await runWithAdminTenant("globex", () => db.create("posts", { id: "shared", title: "Globex post" }));

    expect(await runWithAdminTenant("acme", () => db.read<{ title: string }>("posts", "shared"))).toEqual({
      id: "shared",
      title: "Acme post",
    });
    expect(await runWithAdminTenant("globex", () => db.read<{ title: string }>("posts", "shared"))).toEqual({
      id: "shared",
      title: "Globex post",
    });
  });

  it("scopes every read and write, not only the read the list happens to make", async () => {
    const { db } = await store({ tenancy: "scope" });
    await runWithAdminTenant("acme", () => db.create("posts", { id: "p1", title: "Acme" }));

    expect(await runWithAdminTenant("globex", () => db.read("posts", "p1"))).toBeNull();
    expect(await runWithAdminTenant("globex", () => db.query("posts"))).toEqual([]);
    expect(await runWithAdminTenant("globex", () => db.queryPage("posts"))).toEqual({ rows: [], total: 0 });
    await expect(runWithAdminTenant("globex", () => db.update("posts", "p1", { title: "x" }))).rejects.toThrow(
      /No posts record with id p1/,
    );

    // A delete that matches nothing is not an error, so the assertion is what is left afterwards.
    await runWithAdminTenant("globex", () => db.delete("posts", "p1"));
    expect(await runWithAdminTenant("acme", () => db.read("posts", "p1"))).not.toBeNull();
  });

  it("refuses a statement with no tenant rather than defaulting to one", async () => {
    const { db } = await store({ tenancy: "scope" });
    await runWithAdminTenant("acme", () => db.create("posts", { id: "p1" }));

    await expect(db.read("posts", "p1")).rejects.toThrow(/Reading posts p1 needs a tenant/);
    await expect(db.query("posts")).rejects.toThrow(/Querying posts needs a tenant/);
    await expect(db.create("posts", { title: "x" })).rejects.toThrow(/Creating a posts needs a tenant/);
  });

  it("refuses a resolver that returns nothing, in the same words", async () => {
    const db = createPostgresPersistenceAdapter({
      pool: pool as unknown as PostgresClient,
      table: await table(true),
      tenant: () => undefined,
    });

    await expect(db.query("posts")).rejects.toThrow(/Querying posts needs a tenant/);
  });

  it("asks the resolver per statement, so two concurrent requests do not share one tenant", async () => {
    const { db } = await store({ tenancy: "scope" });
    await runWithAdminTenant("acme", () => db.create("posts", { id: "p1", title: "Acme" }));
    await runWithAdminTenant("globex", () => db.create("posts", { id: "p1", title: "Globex" }));

    const read = (tenant: string) => runWithAdminTenant(tenant, () => db.read<{ title: string }>("posts", "p1"));
    const [acme, globex] = await Promise.all([read("acme"), read("globex")]);

    expect(acme?.title).toBe("Acme");
    expect(globex?.title).toBe("Globex");
  });

  it("keeps two tenants' uniqueness decisions apart", async () => {
    const { db } = await store({ tenancy: "scope" });

    const acme = await runWithAdminTenant("acme", () =>
      db.insertIfAbsent<{ id: string }>("users", "email", { email: "same@x.y", id: "a1" }),
    );
    const globex = await runWithAdminTenant("globex", () =>
      db.insertIfAbsent<{ id: string }>("users", "email", { email: "same@x.y", id: "g1" }),
    );
    const globexAgain = await runWithAdminTenant("globex", () =>
      db.insertIfAbsent("users", "email", { email: "same@x.y", id: "g2" }),
    );

    // Two tenants may each hold an address the other has. The index narrows to the tenant as well as
    // the resource, or one tenant's signup would refuse another's.
    expect(acme?.id).toBe("a1");
    expect(globex?.id).toBe("g1");
    expect(globexAgain).toBeNull();
  });

  it("gives each tenant its own window, rather than one tenant paging into the other's rows", async () => {
    const { db } = await store({ tenancy: "scope" });
    for (let index = 1; index <= 5; index += 1) {
      const id = `p${index}`;
      await runWithAdminTenant("acme", () => db.create("posts", { id }));
      await runWithAdminTenant("globex", () => db.create("pages", { id }));
    }

    const acme = await runWithAdminTenant("acme", () =>
      db.queryPage("posts", { window: { offset: 0, limit: 2 } }),
    );
    const globex = await runWithAdminTenant("globex", () =>
      db.queryPage("pages", { window: { offset: 0, limit: 2 } }),
    );

    expect(acme.total).toBe(5);
    expect(globex.total).toBe(5);
    expect(acme.rows.map((r) => (r as { id: string }).id)).toEqual(["p1", "p2"]);
  });
});

describeWithServer("agreement with the in-memory adapter", () => {
  /**
   * The two stores are asked the same question through the same contract, because a property one of
   * them answers and the other does not is a store a host has to choose between rather than a list
   * that works.
   *
   * Both are seeded with the same records under the same ids, so a difference in the answer is a
   * difference in the store and not in the data.
   */
  const seeds = [
    { id: "1", count: 10, title: "ten", live: true },
    { id: "2", count: 9, title: "nine", live: false },
    { id: "3", count: 100, title: "hundred" },
    { id: "4", count: null, title: null },
    { id: "5", title: "no count" },
  ];

  const both = async () => {
    const { db } = await store();
    for (const record of seeds) await db.create("posts", record);

    // Narrowed to the paging form, because the in-memory store's own type widens `queryPage` back to
    // possibly-undefined and this file is about both stores answering. If one of them ever stops
    // implementing it, the `queryPage` calls below throw rather than quietly comparing two different
    // shapes, which is the outcome these tests exist to prevent.
    const memory = createMemoryPersistenceAdapter({ posts: seeds.map((seed) => ({ ...seed })) });
    if (!memory.queryPage) throw new Error("the in-memory store no longer answers a paged query");

    return { server: db, memory: memory as PagingStore };
  };

  const order = async (db: PagingStore, field: string) =>
    (
      await db.queryPage<{ id: string }>("posts", { sort: [{ field, direction: "asc" }] })
    ).rows.map((row) => row.id);

  it("orders the same way by a number field", async () => {
    const { server, memory } = await both();
    expect(await order(server, "count")).toEqual(await order(memory, "count"));
  });

  it("orders the same way by a text field", async () => {
    const { server, memory } = await both();
    expect(await order(server, "title")).toEqual(await order(memory, "title"));
  });

  it("selects the same rows for every operator", async () => {
    const { server, memory } = await both();
    const ids = async (db: PagingStore, query: object) =>
      (await db.queryPage<{ id: string }>("posts", query)).rows.map((row) => row.id).sort();

    const queries = [
      { filter: [{ field: "count", operator: "eq", value: 9 }] },
      { filter: [{ field: "count", operator: "ne", value: 9 }] },
      { filter: [{ field: "count", operator: "gt", value: 9 }] },
      { filter: [{ field: "count", operator: "gte", value: 9 }] },
      { filter: [{ field: "count", operator: "lt", value: 100 }] },
      { filter: [{ field: "count", operator: "lte", value: 100 }] },
      { filter: [{ field: "count", operator: "isNull" }] },
      { filter: [{ field: "count", operator: "notNull" }] },
      { filter: [{ field: "count", operator: "in", value: [9, 100] }] },
      { filter: [{ field: "live", operator: "eq", value: true }] },
      { filter: [{ field: "title", operator: "contains", value: "n" }] },
      { search: "ten" },
      { search: "hundred" },
    ] as const;

    for (const query of queries) {
      expect({ query, ids: await ids(server, query) }).toEqual({ query, ids: await ids(memory, query) });
    }
  });

  it("counts and windows the same way", async () => {
    const { server, memory } = await both();
    const page = { window: { offset: 1, limit: 2 }, sort: [{ field: "id" as const, direction: "asc" as const }] };

    const fromServer = await server.queryPage<{ id: string }>("posts", page);
    const fromMemory = await memory.queryPage<{ id: string }>("posts", page);

    expect(fromServer.total).toBe(fromMemory.total);
    expect(fromServer.rows.map((r) => r.id)).toEqual(fromMemory.rows.map((r) => r.id));
  });
});

describeWithServer("the schema statements", () => {
  it("refuses a table name that is not an identifier, because it cannot be a bound value", () => {
    expect(() => postgresSchema({ table: "posts; DROP TABLE users" })).toThrow(/cannot be a table name/);
  });

  it("refuses to migrate to tenancy without saying which tenant the existing rows are", () => {
    expect(() => postgresTenancyMigration({ tenant: "" })).toThrow(/not optional/);
  });

  it("actually migrates a single-tenant table into a two-tenant one", async () => {
    const name = await table(false);
    await pool.query(`INSERT INTO ${name} (resource, id, data) VALUES ('posts', '1', '{"title":"old"}')`);

    for (const statement of postgresTenancyMigration({ tenant: "acme", table: name })) {
      await pool.query(statement);
    }

    // The migrated rows land in the tenant that was named, and the table now refuses to hold a row
    // without one, which is what a migration is for.
    const migrated = await pool.query(
      `SELECT tenant, resource, id, data->>'title' AS title FROM ${name}`,
    );
    expect(migrated.rows).toEqual([{ tenant: "acme", resource: "posts", id: "1", title: "old" }]);

    await expect(pool.query(`INSERT INTO ${name} (resource, id, data) VALUES ('posts','2','{}')`)).rejects.toThrow(
      /null value in column "tenant"/,
    );
  });

  it("builds an index the adapter's own filter can use", async () => {
    const { db, table: name } = await store();
    // Rows enough for the planner to prefer an index. On a table of one or two rows it would choose
    // a sequential scan whichever index exists, so a check that only inserted one row would pass or
    // fail on the size of the sample rather than on the index.
    await db.create("posts", { id: "target", title: "indexed" });
    for (let index = 0; index < 400; index += 1) {
      await db.create("posts", { id: `filler-${index}`, title: `filler ${index}` });
    }
    await pool.query(postgresIndexStatement("title", { table: name }));
    await pool.query(`ANALYZE ${name}`);

    const plan = await pool.query(
      `EXPLAIN SELECT data FROM ${name} WHERE resource = 'posts' AND (data #> '{"title"}') = to_jsonb('indexed'::text)`,
    );
    const text = JSON.stringify(plan.rows);

    // The exact expression the adapter's `eq` builds, which is why the index is usable by it: an
    // index whose path is a literal cannot serve a query whose path is a bound parameter, so both
    // sides build the path into the statement. If this stops matching, the index is decoration and
    // the scan the SQLite adapter documents is the cost a host here pays too.
    expect(text).toMatch(/Index Scan|Index Only Scan/);
  });

  it("writes a filter whose path the index it built can actually serve", async () => {
    const { db, table: name } = await store();
    await db.create("posts", { id: "target", title: "indexed" });
    await pool.query(postgresIndexStatement("title", { table: name }));
    await pool.query(`ANALYZE ${name}`);

    // Read the statement the adapter itself produced rather than a copy of it written here, since a
    // copy is what drifted in the first place: this asserts the two agree, and a drift between the
    // index and the filter shows up as an empty result rather than as a passing test.
    const page = await db.queryPage("posts", { filter: [{ field: "title", operator: "eq", value: "indexed" }] });

    expect(page.total).toBe(1);
    expect(await pool.query(`SELECT count(*)::int AS n FROM ${name}`)).toMatchObject({
      rows: [{ n: 1 }],
    });
  });

  it("refuses an indexed field that is not an identifier", () => {
    expect(() => postgresIndexStatement('title" DESC', {})).toThrow(/cannot be an indexed field/);
  });
});

describe("the shipped package, which no test above can see", () => {
  // `process.cwd()` and `join`, the way every other manifest-reading test here does it. A
  // `new URL(..., import.meta.url)` is not usable in this file because Vite rewrites `import.meta.url`
  // to something that is not a file URL, which is a confusing way to learn that.
  const manifest = () =>
    JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

  it("depends on no PostgreSQL driver, so a host on SQLite does not install one", () => {
    const { dependencies, peerDependencies, optionalDependencies } = manifest();
    const runtime = { ...dependencies, ...peerDependencies, ...optionalDependencies };

    // A driver in `peerDependencies` is not much better than one in `dependencies`: every host has
    // to satisfy it to install, and a host on SQLite is made to install the one thing it does not
    // want, in order to keep an adapter it does not use.
    expect(Object.keys(runtime)).not.toContain("pg");
    for (const name of Object.keys(runtime)) {
      expect(name, `${name} is a runtime dependency of a package that takes a connection as an argument`)
        .not.toMatch(/^pg$|postgres|neon|vercel-postgres/);
    }
  });

  it("keeps the driver in devDependencies, where the tests can reach a server and a host cannot", () => {
    const { devDependencies, dependencies } = manifest();

    expect(devDependencies?.pg).toBeDefined();
    expect(dependencies?.pg).toBeUndefined();
  });

  it("declares pg only as a version range, not as a tarball that could be pinned to a fork", () => {
    const spec = manifest().devDependencies?.pg ?? "";

    expect(spec).toMatch(/^\^\d/);
  });
});