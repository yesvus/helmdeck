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
});
