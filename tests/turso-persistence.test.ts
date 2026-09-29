// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import {
  createTursoPersistenceAdapter,
  resetTursoAdapterCache,
  type SqlClient,
} from "../fixtures/lib/turso-persistence";

/** A client that records what it was asked, so the assertions are about the SQL, not the result. */
function fakeClient(columns: string[] = ["id"], rows: unknown[][] = []) {
  const execute = vi.fn().mockResolvedValue({ columns, rows });
  return { client: { execute } as unknown as SqlClient, execute };
}

describe("createTursoPersistenceAdapter", () => {
  it("refuses a resource that is not one of the demo's tables", async () => {
    // A resource name reaches string concatenation, so this is the one place a name could become SQL.
    // Checking it against a fixed set removes the possibility rather than escaping it.
    const { client } = fakeClient([]);
    const adapter = createTursoPersistenceAdapter(client);

    await expect(adapter.query("posts; DROP TABLE users", {})).rejects.toThrow(/not a table/);
  });

  it("reads one row by id, parameterised", async () => {
    const { client, execute } = fakeClient(["id", "title"], [["abc", "Hello"]]);
    const adapter = createTursoPersistenceAdapter(client);

    const row = await adapter.read<{ id: string; title: string }>("posts", "abc");

    expect(execute).toHaveBeenCalledWith({ sql: "SELECT * FROM posts WHERE id = ?", args: ["abc"] });
    expect(row).toEqual({ id: "abc", title: "Hello" });
  });

  it("returns nothing for a row that is not there", async () => {
    const { client } = fakeClient(["id"]);
    const adapter = createTursoPersistenceAdapter(client);

    expect(await adapter.read("posts", "missing")).toBeNull();
  });

  it("passes filter values as arguments rather than in the SQL", async () => {
    resetTursoAdapterCache();
    const { client, execute } = fakeClient([]);
    execute
      .mockResolvedValueOnce({ columns: ["name"], rows: [["name"], ["slug"]] }) // pragma_table_info
      .mockResolvedValueOnce({ columns: ["id"], rows: [] });
    const adapter = createTursoPersistenceAdapter(client);

    await adapter.query("products", { slug: "a' OR 1=1 --" });

    // The value is in the arguments, and the statement names no value at all.
    expect(execute).toHaveBeenLastCalledWith({
      sql: "SELECT * FROM products WHERE slug = ?",
      args: ["a' OR 1=1 --"],
    });
  });

  it("refuses to filter on a column the table does not have", async () => {
    resetTursoAdapterCache();
    const { client, execute } = fakeClient([]);
    execute.mockResolvedValueOnce({ columns: ["name"], rows: [["id"], ["name"]] });
    const adapter = createTursoPersistenceAdapter(client);

    await expect(adapter.query("products", { "; DROP TABLE users": 1 })).rejects.toThrow(
      /not a column/,
    );
  });

  it("writes only the columns it was given", async () => {
    resetTursoAdapterCache();
    const { client, execute } = fakeClient();
    const adapter = createTursoPersistenceAdapter(client);

    await adapter.update("posts", "p1", { title: "Next" });

    expect(execute).toHaveBeenCalledWith({
      sql: "UPDATE posts SET title = ? WHERE id = ?",
      args: ["Next", "p1"],
    });
  });

  it("generates an id when a create is given none", async () => {
    resetTursoAdapterCache();
    const { client, execute } = fakeClient();
    execute.mockResolvedValue({ columns: ["id"], rows: [] });
    const adapter = createTursoPersistenceAdapter(client);

    const created = await adapter.create<{ id: string }>("posts", { title: "x" });

    expect(typeof created.id).toBe("string");
    expect(created.id.length).toBeGreaterThan(0);
  });

  it("reads a column that holds JSON back as an object", async () => {
    const { client } = fakeClient(["id", "meta"], [["a", '{"b":1}']]);
    const adapter = createTursoPersistenceAdapter(client);

    // A text column holding a bare word is data rather than broken JSON, so the fallback is silent.
    const withJson = await adapter.read<Record<string, unknown>>("posts", "a");
    expect(JSON.stringify(withJson)).toContain('{"b":1}');

    const bare = createTursoPersistenceAdapter({
      execute: vi.fn().mockResolvedValue({ columns: ["id", "meta"], rows: [["a", "plain"]] }),
    } as unknown as SqlClient);
    expect(JSON.stringify(await bare.read("posts", "a"))).toContain("plain");
  });

  it("deletes by id, parameterised", async () => {
    const { client, execute } = fakeClient();
    const adapter = createTursoPersistenceAdapter(client);

    await adapter.delete("posts", "gone");

    expect(execute).toHaveBeenCalledWith({ sql: "DELETE FROM posts WHERE id = ?", args: ["gone"] });
  });
});
