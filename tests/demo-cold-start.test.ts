// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";

/**
 * A cold process: the demo signing in against a store nothing has written to.
 *
 * The accounts are rows now, in a table the migrations or the seed create, and a fresh clone has
 * neither written. So the sign-in has to find them anyway, and the one thing that makes it work is the
 * demo's own store preparing the workspace before the package's store is asked. No other test in the
 * suite would notice that step going away, because every other test shares a store this file's does
 * not: the module registry is reset before each test here, so the store is a new empty one and the
 * seed has not run when the request arrives. That is the state of the first request of a fresh
 * process, and it is the only state in which this claim can be made at all.
 */
const request = vi.hoisted(() => ({ session: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "helmdeck_session" && request.session !== undefined
        ? { name, value: request.session }
        : undefined,
    set: (name: string, value: string) => {
      request.session = value;
    },
    delete: () => {
      request.session = undefined;
    },
  }),
}));

vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const [owner, editor] = demoAccounts;

/** The demo as a process that has just started, imported after the registry was cleared. */
async function coldProcess() {
  vi.resetModules();
  const { demoPersistence } = await import("../fixtures/lib/demo-persistence");
  const { demoAuth } = await import("../fixtures/lib/demo-session");
  const actions = await import("../fixtures/app/login/actions");
  return { persistence: demoPersistence(), auth: demoAuth(), ...actions };
}

beforeEach(() => {
  // The session adapter refuses to reach for a cookie from anything shaped like a browser, and jsdom
  // is one. A sign-in is server code, so it runs without one.
  vi.stubGlobal("window", undefined);
  request.session = undefined;
});

describe("a store nothing has written to", () => {
  it("answers a sign-in with the seeded accounts, because the demo prepares its workspace first", async () => {
    const { persistence, auth, signInAction } = await coldProcess();

    // Nothing has run yet in this process, which is the state a fresh clone is in, and what the store
    // has to answer for is the demo's own seed rather than an array of accounts in memory.
    expect(persistence.kind).toBe("memory");
    expect(await persistence.adapter.query("users")).toEqual([]);

    const result = await signInAction({ email: owner.email, password: DEMO_PASSWORD }, "");

    expect(result).toEqual({ ok: true, next: "/dashboard" });
    expect(await auth.getSession()).toEqual({ email: owner.email, role: "admin" });
    expect(await persistence.adapter.query("users")).toHaveLength(demoAccounts.length);
  });

  it("gives each seeded account its own role, from the row the session points at", async () => {
    const { persistence, signInAction } = await coldProcess();

    expect((await signInAction({ email: editor.email, password: DEMO_PASSWORD }, "")).ok).toBe(true);

    const rows = await persistence.adapter.query<{ id: string; role: string }>("users");
    expect(rows.find((row) => row.id === editor.id)?.role).toBe("editor");
    expect(rows.find((row) => row.id === owner.id)?.role).toBe("admin");
  });

  it("writes a session row the sign-in can read back, and ends it on the way out", async () => {
    const { persistence, signInAction, signOutAction } = await coldProcess();

    await signInAction({ email: editor.email, password: DEMO_PASSWORD }, "");

    const sessions = await persistence.adapter.query<{ id: string; user_id: string }>("sessions");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].user_id).toBe(editor.id);

    expect((await signOutAction()).ok).toBe(true);
    expect(await persistence.adapter.query("sessions")).toEqual([]);
  });

  it("refuses a wrong password without saying which half was wrong, on a cold store too", async () => {
    const { persistence, signInAction } = await coldProcess();

    const wrong = await signInAction({ email: owner.email, password: "not-the-password" }, "");
    const unknown = await signInAction({ email: "nobody@demo.helmdeck.dev", password: DEMO_PASSWORD }, "");

    expect(wrong).toEqual(unknown);
    expect(wrong).toEqual({ ok: false, message: "That email and password do not match an account." });
    // The accounts are rows, so the refusal that answers a wrong password is a row that was found and
    // a hash that did not match. Nothing was written either way.
    expect(await persistence.adapter.query("sessions")).toEqual([]);
    expect(await persistence.adapter.query("users")).toHaveLength(demoAccounts.length);
  });

  it("seeds through the adapter, so a store call that seeds cannot re-enter the store", async () => {
    // A review claimed the prepared store could recurse: it seeds before every call, and the seed
    // might reach the store back. It cannot, because the seed only ever calls the persistence adapter
    // and the credential store only ever calls the adapter too, so nothing they do can reach each
    // other. That is worth pinning rather than asserting in prose, because the failure would be a
    // stack overflow on the first sign-in rather than a clean failed test.
    //
    // The instrument is the adapter, not the store object: a wrapper on the returned store misses a
    // re-entry that happens inside `prepared`, because that closure holds the inner store rather than
    // the object handed back. Every store call has to reach the adapter, so depth there sees them all.
    const { demoPersistence } = await import("../fixtures/lib/demo-persistence");
    const { seedDemo } = await import("../fixtures/lib/seed");
    const { demoCredentialStore } = await import("../fixtures/lib/demo-session");

    const adapter = demoPersistence().adapter;
    const entered: string[] = [];
    // The adapter's members take different second arguments, so the wrapper takes the loose form and
    // hands it straight back rather than pretending one signature fits all five.
    const record = (resource: string, run: () => Promise<unknown>): Promise<unknown> => {
      entered.push(resource);
      return run();
    };
    const read = adapter.read.bind(adapter);
    adapter.read = ((resource: string, id: string) =>
      record(resource, () => read(resource, id))) as typeof adapter.read;
    const query = adapter.query.bind(adapter);
    adapter.query = ((resource: string, query?: Record<string, unknown>) =>
      record(resource, () => query2(resource, query))) as typeof adapter.query;
    function query2(resource: string, criteria?: Record<string, unknown>) {
      return query(resource, criteria);
    }
    const create = adapter.create.bind(adapter);
    adapter.create = ((resource: string, value: unknown) =>
      record(resource, () => create(resource, value))) as typeof adapter.create;
    const update = adapter.update.bind(adapter);
    adapter.update = ((resource: string, id: string, value: unknown) =>
      record(resource, () => update(resource, id, value))) as typeof adapter.update;
    const remove = adapter.delete.bind(adapter);
    adapter.delete = ((resource: string, id: string) =>
      record(resource, () => remove(resource, id))) as typeof adapter.delete;

    // Seeding on its own. It writes accounts, so users and posts are expected here.
    await seedDemo(adapter, DEMO_PASSWORD);
    expect(entered, "the seed reached the sessions table, which only the store reads").not.toContain(
      "sessions",
    );

    // The order that would run away: a store call, which seeds, which must not call back into a store
    // while it is already inside one.
    entered.length = 0;
    await demoCredentialStore().findUserByEmail(owner.email);
    expect(entered, "a cold sign-in read only what it asked for").not.toContain("sessions");
    expect(entered).toContain("users");
  });
});
