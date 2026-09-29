// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSqlitePersistenceAdapter } from "../src/baseline/sqlite";

/**
 * These run against a real SQLite database rather than a recorded client, because the questions
 * worth asking here are about SQL: that a JSON path is bound and not interpolated, that a filter
 * actually selects, and that a write that matched nothing is told apart from one that did.
 * A fake client answers none of them; it can only confirm the strings it was handed.
 *
 * `file::memory:` gives each adapter its own database, so cases do not share state.
 */
const adapter = (table?: string) =>
  createSqlitePersistenceAdapter({ url: "file::memory:", ...(table ? { table } : {}) });

const temporary: string[] = [];

afterEach(() => {
  while (temporary.length > 0) rmSync(temporary.pop()!, { force: true, recursive: true });
});

describe("createSqlitePersistenceAdapter", () => {
  it("needs no schema: the first call creates the table it stores in", async () => {
    const db = adapter();
    const created = await db.create<{ id: string; title: string }>("posts", { title: "Hello" });

    expect(created.title).toBe("Hello");
    expect(await db.read("posts", created.id)).toEqual(created);
  });

  it("keeps each resource's records separate", async () => {
    const db = adapter();
    await db.create("posts", { id: "shared", title: "A post" });
    await db.create("pages", { id: "shared", title: "A page" });

    expect(await db.read<{ title: string }>("posts", "shared")).toEqual({
      id: "shared",
      title: "A post",
    });
    expect(await db.query("pages")).toHaveLength(1);
  });

  it("queries on exact field matches, including booleans and numbers", async () => {
    const db = adapter();
    await db.create("posts", { title: "A", published: true, count: 1 });
    await db.create("posts", { title: "B", published: false, count: 2 });

    expect(await db.query("posts", { published: true })).toHaveLength(1);
    expect(await db.query("posts", { count: 2 })).toHaveLength(1);
    expect(await db.query("posts")).toHaveLength(2);
  });

  it("matches no records for a query nothing satisfies", async () => {
    const db = adapter();
    await db.create("posts", { title: "A" });

    expect(await db.query("posts", { title: "Z" })).toEqual([]);
  });

  it("ignores a filter that was never set, instead of returning nothing", async () => {
    const db = adapter();
    await db.create("posts", { title: "A" });

    expect(await db.query("posts", { title: undefined })).toHaveLength(1);
  });

  it("updates in place and keeps the id", async () => {
    const db = adapter();
    const created = await db.create<{ id: string }>("posts", { title: "A" });

    const updated = await db.update<{ id: string; title: string }>("posts", created.id, {
      id: "hijack",
      title: "B",
    });

    expect(updated.id).toBe(created.id);
    expect(await db.read("posts", created.id)).toEqual({ id: created.id, title: "B" });
  });

  it("throws when updating a record that is not there", async () => {
    const db = adapter();

    await expect(db.update("posts", "nope", {})).rejects.toThrow(/nope/);
  });

  it("deletes a record and is a no-op for one that is not there", async () => {
    const db = adapter();
    const created = await db.create<{ id: string }>("posts", { title: "A" });

    await db.delete("posts", created.id);
    expect(await db.read("posts", created.id)).toBeNull();
    await expect(db.delete("posts", created.id)).resolves.toBeUndefined();
  });

  it("keeps an id it is given, so a seeded parent still points at its child", async () => {
    const db = adapter();

    const created = await db.create<{ id: string }>("orders", { id: "order_1", product: "prod_7" });

    expect(created.id).toBe("order_1");
    expect(await db.read("orders", "order_1")).toMatchObject({ product: "prod_7" });
  });

  it("hands out copies, so a caller cannot edit stored state behind update's back", async () => {
    const db = adapter();
    const created = await db.create<{ id: string; title: string }>("posts", { title: "A" });

    const read = await db.read<{ title: string }>("posts", created.id);
    if (read) read.title = "Changed outside the adapter";

    expect(await db.read<{ title: string }>("posts", created.id)).toEqual({ id: created.id, title: "A" });
  });

  it("treats a hostile resource name as data rather than as SQL", async () => {
    const db = adapter();

    await db.create("posts; DROP TABLE helmdeck_records; --", { title: "A" });

    // The name is a bound value, so it is stored verbatim and the table it could have named
    // is untouched. Both are asserted: storing alone would pass if the statement still ran.
    expect(await db.query("posts; DROP TABLE helmdeck_records; --")).toHaveLength(1);
    expect(await db.query("posts")).toHaveLength(0);
  });

  it("treats a hostile field name as data rather than as SQL", async () => {
    const db = adapter();
    const key = "title') = '' OR 1=1 --";

    await db.create("posts", { title: "A" });
    await db.create("posts", { [key]: "B" });

    expect(await db.query("posts", { [key]: "B" })).toHaveLength(1);
    expect(await db.query("posts", { title: "A" })).toHaveLength(1);
  });

  it("refuses a table name it would have to concatenate", () => {
    expect(() => adapter("helmdeck_records; DROP TABLE users")).toThrow(/table name/);
  });

  it("stores to a file path that carries no scheme", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helmdeck-"));
    temporary.push(directory);
    const path = join(directory, "store.db");

    const db = createSqlitePersistenceAdapter({ url: path });
    const created = await db.create<{ id: string }>("posts", { title: "On disk" });

    expect(await db.read("posts", created.id)).toEqual(created);
    expect(() => rmSync(path, { force: true })).not.toThrow();
  });
});
