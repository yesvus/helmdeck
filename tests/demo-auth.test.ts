// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryPersistenceAdapter } from "@yesvus/helmdeck/baseline";
import type { CredentialRevocation, CredentialStore } from "@yesvus/helmdeck/baseline";
import type { AdminAuthAdapter, AdminPersistenceAdapter } from "@yesvus/helmdeck";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { seedDemo } from "../fixtures/lib/seed";
import { demoAuth, demoCredentialStore, SESSION_TTL_SECONDS } from "../fixtures/lib/demo-session";
import { DEFAULT_AFTER_LOGIN, requireDemoSession } from "../fixtures/lib/demo-guard";
import { endEverySessionAction, signInAction, signOutAction } from "../fixtures/app/login/actions";

/**
 * The request scope, stood in for.
 *
 * The cookie is one object for the whole file because a session is written by the package's
 * adapter and read back by an action, and both have to see the same browser. `next/headers` is the
 * seam: the demo's own code and the package's adapter both reach the request's cookies through it,
 * so mocking that one module is what makes an action testable without a running server.
 */
const request = vi.hoisted(() => ({
  session: undefined as string | undefined,
  cleared: 0,
}));

const guard = vi.hoisted(() => {
  class RedirectSignal extends Error {}
  return { RedirectSignal, calls: [] as string[] };
});

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
      request.cleared += 1;
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    guard.calls.push(url);
    throw new guard.RedirectSignal(url);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** A cookie jar for a caller that passes its own cookie instead of going through next/headers. */
function jar() {
  let value: string | undefined;
  const io = {
    read: () => value,
    write: (next: string) => {
      value = next;
    },
    clear: () => {
      value = undefined;
    },
  };
  return { io, peek: () => value, tamper: (next: string) => (value = next) };
}

type SessionRow = { id: string; user_id: string; expires_at: number };

/**
 * One seeded store and one browser, so a test can say which session it means.
 *
 * The rows are the demo's own, written by the demo's own seed, and the store over them is the one
 * `demoAuth` builds for itself. That is the point of the harness: a sign-in here is the same sign-in a
 * deployment does, against accounts that exist as rows rather than as values in an array, so what is
 * under test is the demo's wiring rather than a test double standing in for it.
 */
async function harness() {
  const memory = createMemoryPersistenceAdapter();
  await seedDemo(memory as AdminPersistenceAdapter, DEMO_PASSWORD);
  const store = demoCredentialStore(memory as AdminPersistenceAdapter);
  const cookies = jar();
  return { memory, store, cookies, auth: demoAuth({ store, cookie: cookies.io }) };
}

/** The same store with every call recorded, for the question of whether a cookie reached it at all. */
function watched(store: CredentialStore) {
  const calls: string[] = [];
  const record = <K extends keyof CredentialStore>(name: K, call: CredentialStore[K]) =>
    ((...args: never[]) => {
      calls.push(name);
      return (call as (...values: never[]) => unknown)(...args);
    }) as CredentialStore[K];
  return {
    store: {
      findUserByEmail: record("findUserByEmail", store.findUserByEmail),
      findUserById: record("findUserById", store.findUserById),
      createSession: record("createSession", store.createSession),
      readSession: record("readSession", store.readSession),
      deleteSession: record("deleteSession", store.deleteSession),
      deleteSessionsForUser: record("deleteSessionsForUser", store.deleteSessionsForUser),
    } satisfies CredentialStore,
    calls,
  };
}

function sessionsIn(memory: AdminPersistenceAdapter, userId: string): Promise<SessionRow[]> {
  return memory.query<SessionRow>("sessions", { user_id: userId });
}

/** The store the actions reach: the demo's persistence adapter rather than a test double. */
function liveSessions(): Promise<SessionRow[]> {
  return demoPersistence().adapter.query<SessionRow>("sessions");
}

const [owner, editor] = demoAccounts;

beforeEach(async () => {
  guard.calls.length = 0;
  request.session = undefined;
  request.cleared = 0;
  for (const row of await liveSessions()) {
    await demoPersistence().adapter.delete("sessions", row.id);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the demo's sign-in", () => {
  it("accepts the published password and returns the role the account holds", async () => {
    const { auth, memory } = await harness();

    const result = await auth.login({ email: owner.email, password: DEMO_PASSWORD });

    expect(result).toEqual({ ok: true, session: { email: owner.email, role: "admin" } });
    expect(await auth.getSession()).toEqual({ email: owner.email, role: "admin" });
    expect(await sessionsIn(memory, owner.id)).toHaveLength(1);
  });

  it("gives the two accounts different roles, from the accounts rather than the request", async () => {
    const asOwner = await harness();
    const asEditor = await harness();

    await asOwner.auth.login({ email: owner.email, password: DEMO_PASSWORD });
    await asEditor.auth.login({ email: editor.email, password: DEMO_PASSWORD });

    expect((await asOwner.auth.getSession())?.role).toBe("admin");
    expect((await asEditor.auth.getSession())?.role).toBe("editor");
  });

  it("refuses a wrong password and writes no session", async () => {
    const { auth, memory, cookies } = await harness();

    const result = await auth.login({ email: owner.email, password: `${DEMO_PASSWORD}x` });

    expect(result).toEqual({ ok: false, message: "That email and password do not match an account." });
    expect(await auth.getSession()).toBeNull();
    expect(cookies.peek()).toBeUndefined();
    expect(await sessionsIn(memory, owner.id)).toEqual([]);
  });

  it("answers an unknown email exactly as it answers a wrong password", async () => {
    const { auth } = await harness();

    const unknown = await auth.login({ email: "nobody@demo.helmdeck.dev", password: DEMO_PASSWORD });
    const wrong = await auth.login({ email: owner.email, password: "not-the-password" });

    // Equal answers, not merely two refusals: a form that says one of these two things reports
    // which addresses have accounts.
    expect(unknown).toEqual(wrong);
    expect(unknown.ok).toBe(false);
  });

  it("matches the email without regard to case or surrounding space", async () => {
    const { auth } = await harness();

    const result = await auth.login({ email: `  ${owner.email.toUpperCase()} `, password: DEMO_PASSWORD });

    expect(result.ok).toBe(true);
  });

  it("works with no database configured, on the in-memory store and its own seeded accounts", async () => {
    // The ordinary suite runs with no database, which is also what a fresh clone gets, so this is the
    // path that has to produce a working login rather than an error. It asks the demo's own store
    // rather than a harness store, because the demo's store is also what prepares the workspace: a
    // store nothing has written the accounts into yet has to find them before it answers.
    expect(demoPersistence().kind).toBe("memory");

    const cookies = jar();
    const result = await demoAuth({ cookie: cookies.io }).login({
      email: editor.email,
      password: DEMO_PASSWORD,
    });

    expect(result).toEqual({ ok: true, session: { email: editor.email, role: "editor" } });
    expect(await demoAuth({ cookie: cookies.io }).getSession()).toEqual({
      email: editor.email,
      role: "editor",
    });
    expect(await liveSessions()).toHaveLength(1);
  });

  it("gives a session the lifetime its cookie is given", async () => {
    const { auth, memory } = await harness();
    await auth.login({ email: owner.email, password: DEMO_PASSWORD });
    const [row] = await sessionsIn(memory, owner.id);

    // Two weeks out, within a minute of drift. A row that outlives its cookie is a session that
    // outlives the sign-out, and the other way round is a visitor signed out while still signed in.
    const expected = Date.now() / 1000 + SESSION_TTL_SECONDS;
    expect(Number(row.expires_at)).toBeGreaterThan(expected - 60);
    expect(Number(row.expires_at)).toBeLessThan(expected + 60);
  });
});

describe("signing out", () => {
  it("ends the row on the server, so the cookie that signed in stops working", async () => {
    const { auth, store, cookies, memory } = await harness();
    await auth.login({ email: owner.email, password: DEMO_PASSWORD });
    const [row] = await sessionsIn(memory, owner.id);
    const sealed = cookies.peek();

    await auth.logout();

    expect(await store.readSession(row.id)).toBeNull();
    expect(await auth.getSession()).toBeNull();
    expect(cookies.peek()).toBeUndefined();

    // The value is replayed into a fresh browser, because a cookie that still verified would mean
    // the only thing sign-out cleared was this browser's copy of it.
    const replayed = jar();
    replayed.tamper(sealed!);
    expect(await demoAuth({ store, cookie: replayed.io }).getSession()).toBeNull();
  });

  it("ends nothing when the cookie names a session it did not sign", async () => {
    const editorBrowser = await harness();
    await editorBrowser.auth.login({ email: editor.email, password: DEMO_PASSWORD });
    const [row] = await sessionsIn(editorBrowser.memory, editor.id);

    // Someone writing another session's id into their own cookie, with a signature that is wrong.
    const forger = await harness();
    forger.cookies.tamper(`${row.id}.not-a-signature`);

    await forger.auth.logout();

    expect(await editorBrowser.store.readSession(row.id)).not.toBeNull();
  });

  it("treats an expired row as no session, and clears it out", async () => {
    const { auth, store, memory } = await harness();
    await auth.login({ email: owner.email, password: DEMO_PASSWORD });
    const [row] = await sessionsIn(memory, owner.id);

    await memory.update("sessions", row.id, { ...row, expires_at: Math.floor(Date.now() / 1000) - 1 });

    expect(await auth.getSession()).toBeNull();
    expect(await store.readSession(row.id)).toBeNull();
  });

  it("ends a session whose expiry is not a number, rather than reading it as valid", async () => {
    const { auth, store, memory } = await harness();
    await auth.login({ email: owner.email, password: DEMO_PASSWORD });
    const [row] = await sessionsIn(memory, owner.id);

    // `NaN <= now` is false, so the comparison on its own reads an unparseable expiry as a session
    // that never lapses. Nothing this store writes produces one, which is the point: a row that did
    // not come from the store must not read as a valid session, and one that cannot be judged is
    // ended rather than kept.
    await memory.update("sessions", row.id, { ...row, expires_at: "not-a-number" });

    expect(await auth.getSession()).toBeNull();
    expect(await store.readSession(row.id)).toBeNull();
  });

  it("refuses a session whose account is no longer there", async () => {
    const { auth, store, memory } = await harness();
    await auth.login({ email: owner.email, password: DEMO_PASSWORD });
    const [row] = await sessionsIn(memory, owner.id);

    await memory.update("sessions", row.id, { ...row, user_id: "usr_withdrawn" });

    expect(await auth.getSession()).toBeNull();
    expect(await store.readSession(row.id)).toBeNull();
  });

  it("takes the role from the row it points at, and a promotion takes effect on the next call", async () => {
    const { auth, cookies, memory } = await harness();
    await auth.login({ email: editor.email, password: DEMO_PASSWORD });
    const sealed = cookies.peek();
    expect((await auth.getSession())?.role).toBe("editor");

    const row = (await memory.read("users", editor.id)) as Record<string, unknown>;
    await memory.update("users", editor.id, { ...row, role: "admin" });

    // The same cookie and the same row behind it, so the change came from the store and from nowhere
    // else. This is the half of the role a browser can never write.
    expect(cookies.peek()).toBe(sealed);
    expect((await auth.getSession())?.role).toBe("admin");
  });
});

describe("a cookie that was not issued here", () => {
  it("is refused before the store is asked anything at all", async () => {
    const { store, cookies } = await harness();
    const { store: watchedStore, calls } = watched(store);

    // Someone writing their own session id into the cookie, with a signature that is not the one the
    // server would have produced.
    cookies.tamper("ses_chosen_by_the_caller.not-a-signature");
    expect(await demoAuth({ store: watchedStore, cookie: cookies.io }).getSession()).toBeNull();

    // Nothing was asked, so the cookie cannot be used to learn which session ids exist, and the
    // refusal is the same one an absent cookie gets.
    expect(calls).toEqual([]);
    cookies.tamper(undefined as unknown as string);
    expect(await demoAuth({ store: watchedStore, cookie: cookies.io }).getSession()).toBeNull();
    expect(calls).toEqual([]);
  });

  it("is refused before the store is asked anything, when it is signed out", async () => {
    const { store, cookies } = await harness();
    const { store: watchedStore, calls } = watched(store);
    cookies.tamper("ses_chosen_by_the_caller.not-a-signature");

    await demoAuth({ store: watchedStore, cookie: cookies.io }).logout();

    // A sign-out that reached the store with a forged id would be a sign-out anyone could aim at a
    // session they do not hold.
    expect(calls).toEqual([]);
  });
});

describe("the destination a guard recorded", () => {
  beforeEach(() => {
    // The adapter refuses to read next/headers from anything that looks like a browser, so the
    // action is exercised with the same absence a server action has.
    vi.stubGlobal("window", undefined);
  });

  it("keeps a nested path, so a visitor comes back to the page rather than to its segment", async () => {
    const result = await signInAction(
      { email: owner.email, password: DEMO_PASSWORD },
      `next=${encodeURIComponent("/shell/settings/site")}`,
    );

    expect(result).toEqual({ ok: true, next: "/shell/settings/site" });
  });

  it("drops a destination that leaves the origin, however it is written", async () => {
    // The open redirect the validator exists to stop: a sign-in page that hands a visitor to another
    // origin the moment they authenticate. Each of these is a way of writing one.
    for (const hostile of [
      "https%3A%2F%2Fevil.example%2Fsteal",
      "%2F%2Fevil.example%2Fsteal",
      "%2F%5Cevil.example",
      "%2F%5C%5Cevil.example",
      "%2F%0D%0A%2Fevil.example",
      "%2F%252F%252Fevil.example",
      "evil.example",
      "%2F%2",
      "",
    ]) {
      const result = await signInAction({ email: owner.email, password: DEMO_PASSWORD }, `next=${hostile}`);

      expect(result, hostile).toEqual({ ok: true, next: DEFAULT_AFTER_LOGIN });
    }
  });

  it("sends a visitor with no recorded destination to the default rather than nowhere", async () => {
    const result = await signInAction({ email: owner.email, password: DEMO_PASSWORD }, null);

    expect(result).toEqual({ ok: true, next: DEFAULT_AFTER_LOGIN });
  });
});

describe("the guard on a protected route", () => {
  it("sends an anonymous visitor to the login page, keeping where they were going", async () => {
    const { store, cookies } = await harness();

    await expect(
      requireDemoSession({ store, cookie: cookies.io, returnTo: "/dashboard" }),
    ).rejects.toThrow(guard.RedirectSignal);
    expect(guard.calls).toEqual(["/login?next=%2Fdashboard"]);
  });

  it("lets a signed-in visitor through with the session it resolved", async () => {
    const { auth, store, cookies } = await harness();
    await auth.login({ email: editor.email, password: DEMO_PASSWORD });

    const session = await requireDemoSession({ store, cookie: cookies.io, returnTo: "/dashboard" });

    expect(session).toEqual({ email: editor.email, role: "editor" });
    expect(guard.calls).toEqual([]);
  });

  it("sends the visitor back out once the session is gone", async () => {
    const { auth, store, cookies } = await harness();
    await auth.login({ email: editor.email, password: DEMO_PASSWORD });
    await auth.logout();

    await expect(
      requireDemoSession({ store, cookie: cookies.io, returnTo: "/dashboard" }),
    ).rejects.toThrow(guard.RedirectSignal);
  });
});

describe("the actions a signed-in visitor can reach", () => {
  beforeEach(() => {
    // The adapter refuses to read next/headers from anything that looks like a browser, so the
    // actions are exercised with the same absence a server action has.
    vi.stubGlobal("window", undefined);
  });

  it("signs in through the request's own cookie, and sends the visitor where they were going", async () => {
    const result = await signInAction({ email: owner.email, password: DEMO_PASSWORD }, "next=%2Fdashboard");

    expect(result).toEqual({ ok: true, next: "/dashboard" });
    expect(request.session).toBeTruthy();
    expect(await liveSessions()).toHaveLength(1);
  });

  it("reports a wrong password without saying which half was wrong", async () => {
    const result = await signInAction({ email: owner.email, password: "nope" }, "");

    expect(result).toEqual({ ok: false, message: "That email and password do not match an account." });
    expect(request.session).toBeUndefined();
    expect(await liveSessions()).toEqual([]);
  });

  it("ends the session on the server when signing out", async () => {
    await signInAction({ email: owner.email, password: DEMO_PASSWORD }, "");

    const result = await signOutAction();

    expect(result.ok).toBe(true);
    expect(await liveSessions()).toEqual([]);
    expect(request.session).toBeUndefined();
    expect(request.cleared).toBe(1);
  });

  it("refuses an editor the administrator's action", async () => {
    await signInAction({ email: editor.email, password: DEMO_PASSWORD }, "");

    const result = await endEverySessionAction();

    // The refusal is the package's wording rather than the demo's, because the policy that refuses it
    // is the one the demo hands `mayEndAllSessions` and the adapter applies. The button that offers
    // it still carries the demo's own sentence as its tooltip, so a visitor reads the same thing
    // whether they press it or cannot.
    expect(result).toEqual({ ok: false, message: "This account may not end every session." });
    // Refused before anything was written, so the editor's own session is untouched.
    expect(await liveSessions()).toHaveLength(1);
  });

  it("ends every session an administrator holds, including the one it arrived on", async () => {
    await signInAction({ email: owner.email, password: DEMO_PASSWORD }, "");
    await signInAction({ email: owner.email, password: DEMO_PASSWORD }, "");

    const result = await endEverySessionAction();

    expect(result).toEqual({
      ok: true,
      ended: 2,
      message: "Ended 2 sessions for owner@demo.helmdeck.dev.",
    });
    expect(await liveSessions()).toEqual([]);
  });

  it("has no session to end when nobody is signed in", async () => {
    expect(await endEverySessionAction()).toEqual({ ok: false, message: "There is no session to end." });
  });
});

describe("ending every session an account holds", () => {
  it("reaches the other browser too", async () => {
    const { store, cookies } = await harness();
    const desktop = demoAuth({ store, cookie: cookies.io });
    const laptop = demoAuth({ store, cookie: cookies.io });
    await desktop.login({ email: owner.email, password: DEMO_PASSWORD });
    await laptop.login({ email: owner.email, password: DEMO_PASSWORD });

    const result = await desktop.endAllSessions();
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ended: 2, email: owner.email });
    expect(await desktop.getSession()).toBeNull();
    expect(await laptop.getSession()).toBeNull();
  });

  it("refuses an account that is not an administrator", async () => {
    const { auth, store, cookies } = await harness();
    await auth.login({ email: editor.email, password: DEMO_PASSWORD });

    // The session comes from the signed cookie rather than from an argument, so the only thing a
    // caller could forge is nothing: the id is verified before the store is reached.
    const result = await demoAuth({ store, cookie: cookies.io }).endAllSessions();
    expect(result).toEqual({ ok: false, message: "This account may not end every session." });
    // Refused before any row was read or written, so the editor's own session is untouched and the
    // answer cannot be used to ask which accounts exist.
    expect(await auth.getSession()).toEqual({ email: editor.email, role: "editor" });
  });

  it("ignores an account a caller names anyway, and ends only its own", async () => {
    // The session adapter refuses to reach for a cookie from anything shaped like a browser, and
    // jsdom is one. Resolving a session is server code, so it runs without one.
    vi.stubGlobal("window", undefined);
    const { auth } = await harness();
    await auth.login({ email: editor.email, password: DEMO_PASSWORD });

    // The shape of the defect this replaces: a caller authorized as itself, naming somebody else.
    // The method takes no account at all, so the argument is ignored rather than honoured.
    const withAccount = auth.endAllSessions as unknown as (
      first: unknown,
      second?: unknown,
    ) => Promise<CredentialRevocation>;
    const result = await withAccount({ email: owner.email, role: "admin" });

    expect(result.ok).toBe(false);
    expect(await auth.getSession()).toEqual({ email: editor.email, role: "editor" });
  });

  it("refuses when there is no session at all", async () => {
    const { store, cookies } = await harness();
    const result = await demoAuth({ store, cookie: cookies.io }).endAllSessions();
    expect(result).toEqual({ ok: false, message: "There is no session to end." });
  });
});

describe("the adapter the shell is given", () => {
  it("is the host contract, plus the revocation the contract has no room for", async () => {
    const { store, cookies } = await harness();
    const auth: AdminAuthAdapter = demoAuth({ store, cookie: cookies.io });

    // The three the shell calls, and the one the package adds for ending every session. A wrapper
    // that reported three keys was hiding a fourth call the demo's own action makes.
    expect(Object.keys(auth).sort()).toEqual(["endAllSessions", "getSession", "login", "logout"]);
  });
});
