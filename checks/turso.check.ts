// SPDX-License-Identifier: MIT
//
// Proves the demo's persistence adapter against a real database. Run with `scripts/check-turso` and
// credentials in the environment. It is not part of the ordinary suite, which must pass with no
// database configured at all.
import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import {
  createTursoPersistenceAdapter,
  resetTursoAdapterCache,
  type SqlClient,
} from "../fixtures/lib/turso-persistence";

const url = process.env.HELMDECK_TURSO_URL!;
const authToken = process.env.HELMDECK_TURSO_TOKEN!;

function adapter() {
  const client = createClient({ url, authToken });
  resetTursoAdapterCache();
  return { client, adapter: createTursoPersistenceAdapter(client as unknown as SqlClient) };
}

describe("the persistence adapter against a real database", () => {
  it("creates, reads, filters, updates and deletes a row", async () => {
    const { adapter: store } = adapter();

    const created = await store.create<{ id: string; title: string }>("posts", { title: "Live" });
    expect(created.id).toBeTruthy();
    expect((await store.read<{ title: string }>("posts", created.id))?.title).toBe("Live");

    const found = await store.query<{ id: string }>("posts", { title: "Live" });
    expect(found.map((row) => row.id)).toContain(created.id);

    await store.update("posts", created.id, { title: "Updated" });
    expect((await store.read<{ title: string }>("posts", created.id))?.title).toBe("Updated");

    await store.delete("posts", created.id);
    expect(await store.read("posts", created.id)).toBeNull();
  });

  it("refuses a resource name that is not a table, and the table survives", async () => {
    const { client, adapter: store } = adapter();

    await expect(store.query("posts; DROP TABLE users", {})).rejects.toThrow(/not a table/);
    // The point of refusing rather than escaping: the table is still there afterwards.
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
    );
    expect(tables.rows.length).toBe(1);
  });

  it("is refused by the database's own constraints, which the adapter does not enforce", async () => {
    const { adapter: store } = adapter();

    await expect(store.create("posts", { title: "   " })).rejects.toThrow(/CHECK/);
  });

  it("keeps a placement's position unique, so a saved dashboard cannot reorder into a tie", async () => {
    const { adapter: store } = adapter();
    const dashboard = `check-${Date.now()}`;

    await store.create("dashboard_placements", { id: "a", dashboard, widget: "counter", size: "sm", position: 0 });
    await expect(
      store.create("dashboard_placements", { id: "b", dashboard, widget: "counter", size: "sm", position: 0 }),
    ).rejects.toThrow(/UNIQUE/);

    await store.delete("dashboard_placements", "a");
  });
});

describe("seeding the demo", () => {
  it("is idempotent, so a deploy does not double the workspace", { timeout: 30000 }, async () => {
    const { adapter: store } = adapter();
    const { seedDemo } = await import("../fixtures/lib/seed");
    const { DEMO_PASSWORD } = await import("../fixtures/lib/demo-accounts");
    const { seedOrders } = await import("../fixtures/lib/seed-data");

    // The database is not assumed empty: an earlier run may have seeded it, and idempotency means
    // the second pass changes nothing, not that the first one created something.
    await seedDemo(store as never, DEMO_PASSWORD);
    const afterFirst = (await store.query("orders")).length;
    const second = await seedDemo(store as never, DEMO_PASSWORD);

    // A seed that inserted on every run would be invisible in a fresh database and obvious in the
    // demo within a week of deploys.
    expect(second.created).toEqual({});
    expect((await store.query("orders")).length).toBe(afterFirst);
    expect(afterFirst).toBe(seedOrders.length);
  });
});
