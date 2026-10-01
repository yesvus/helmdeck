// SPDX-License-Identifier: MIT

/**
 * The single login: one cookie, one session row, one account, reached from both surfaces.
 *
 * The claim is not that a person can sign in twice and reach two products. It is that a person signs in
 * once and Payload's admin panel is already authenticated, because Payload's auth collection reads the
 * demo's own `users` table and its strategy reads the demo's own session cookie.
 *
 * The sign-in below is a real one, through the demo's own adapter, against the demo's in-memory store.
 * Nothing here writes a cookie by hand, because a hand-written cookie would test a string rather than the
 * arrangement: the credential store writes the cookie and this strategy is the only thing that reads it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPayload, type Payload } from "payload";

/**
 * The request scope, stood in for.
 *
 * One mutable cookie for one browser. The credential adapter writes it through the sign-in and Payload's
 * strategy reads it back, and both reach it through this object, which is what makes the round trip below
 * a real one rather than two halves wired to different stand-ins.
 */
const browser = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  clear: () => browser.cookies.clear(),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      browser.cookies.size
        ? { cookie: [...browser.cookies].map(([name, value]) => `${name}=${value}`).join("; ") }
        : {},
    ),
  cookies: async () => ({
    get: (name: string) =>
      browser.cookies.has(name) ? { name, value: browser.cookies.get(name)! } : undefined,
    set: (name: string, value: string) => {
      browser.cookies.set(name, value);
    },
    delete: (options: { name?: string } | string) => {
      browser.cookies.delete(typeof options === "string" ? options : options.name!);
    },
  }),
}));

let workdir: string;
let payload: Payload;

/**
 * The demo's accounts table.
 *
 * In a deployment `fixtures/lib/migrations/0001_initial.sql` owns this table and Payload's accounts
 * collection reads it through `dbName: 'users'`. On a throwaway SQLite file there is no deployment, and
 * Payload's `demo-accounts` collection is declared against that name, so the table has to exist for the
 * collection to be readable at all. No row is written into it here: the sign-in resolves through the
 * demo's in-memory store, and the strategy's account lookup is what the tests below exercise.
 */
const SUITE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

beforeAll(async () => {
  workdir = mkdtempSync(join(tmpdir(), "helmdeck-one-login-"));
  process.env.HELMDECK_PAYLOAD_DB_URL = `file:${join(workdir, "payload.db")}`;
  process.env.PAYLOAD_SECRET = "one-login-suite";

  const { default: config } = await import("../fixtures/payload.config");
  payload = await getPayload({ config });
  await payload.db.migrate?.();

  const client = (
    payload.db as unknown as { drizzle: { $client: { execute: (sql: string) => Promise<unknown> } } }
  ).drizzle.$client;
  await client.execute(SUITE_USERS_TABLE);
}, 120_000);

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

/**
 * The demo's session cookie, over this file's request scope.
 *
 * Passed explicitly because the suite runs in jsdom, and the package's session adapter refuses to open a
 * cookie store itself when `window` exists: a server-side module that silently fell back to a browser
 * store would be reading a cookie a page could have written. Supplying the store is the supported way to
 * stand in for a request.
 */
const cookieIO = {
  read: () => browser.cookies.get("helmdeck_session"),
  write: (value: string) => {
    browser.cookies.set("helmdeck_session", value);
  },
  clear: () => {
    browser.cookies.delete("helmdeck_session");
  },
};

/** A real sign-in through the demo's own adapter, as the login action would do it. */
async function signIn(email: string): Promise<void> {
  const { demoAuth } = await import("../fixtures/lib/demo-session");
  const { DEMO_PASSWORD } = await import("../fixtures/lib/demo-accounts");

  const result = await demoAuth({ cookie: cookieIO }).login({ email, password: DEMO_PASSWORD });
  if (!result.ok) throw new Error(`the demo sign-in refused: ${result.message}`);
}

describe("one login, reached from both surfaces", () => {
  beforeEach(() => browser.clear());

  it("resolves no Payload user when the request carries no session cookie", async () => {
    const { helmdeckSessionStrategy } = await import("../fixtures/lib/payload-auth-strategy");

    const result = await helmdeckSessionStrategy.authenticate({
      headers: new Headers(),
      payload,
      canSetHeaders: false,
    });

    expect(result.user).toBeNull();
  });

  it("resolves no Payload user for a cookie the credential store did not sign", async () => {
    const { helmdeckSessionStrategy } = await import("../fixtures/lib/payload-auth-strategy");

    // Shaped like the real cookie: a session id, a separator, and a signature. The refusal happens inside
    // the credential adapter, which verifies an HMAC the browser cannot produce, so this tests that the
    // strategy delegates rather than performing its own lighter check.
    const result = await helmdeckSessionStrategy.authenticate({
      headers: new Headers({ cookie: "helmdeck_session=made_up_id.not_a_signature" }),
      payload,
      canSetHeaders: false,
    });

    expect(result.user).toBeNull();
  });

  it("resolves the editor's own account from the session the demo's sign-in wrote", async () => {
    await signIn("editor@demo.helmdeck.dev");

    const { helmdeckSessionStrategy } = await import("../fixtures/lib/payload-auth-strategy");

    const result = await helmdeckSessionStrategy.authenticate({
      headers: new Headers({ cookie: `helmdeck_session=${cookieIO.read()}` }),
      payload,
      canSetHeaders: false,
    });

    expect(result.user).not.toBeNull();
    // The demo's own account id, so a document Payload writes records the same person the demo's audit
    // trail does.
    expect(result.user?.id).toBe("usr_editor");
    expect(result.user?.email).toBe("editor@demo.helmdeck.dev");
    expect(result.user?.collection).toBe("demo-accounts");
  });

  it("reads the role from the account row, so a cookie cannot grant one", async () => {
    await signIn("editor@demo.helmdeck.dev");

    const { helmdeckSessionStrategy } = await import("../fixtures/lib/payload-auth-strategy");
    const { demoCredentialStore } = await import("../fixtures/lib/demo-session");

    const result = await helmdeckSessionStrategy.authenticate({
      headers: new Headers({ cookie: `helmdeck_session=${cookieIO.read()}` }),
      payload,
      canSetHeaders: false,
    });

    // The role is the account's, not the cookie's. The credential adapter deliberately keeps the role out
    // of the signed cookie, and this is the assertion that Payload's copy of the account arrives with the
    // same role rather than an escalated one.
    const account = await demoCredentialStore().findUserByEmail("editor@demo.helmdeck.dev");
    expect(result.user?.role).toBe(account?.role);
    expect(result.user?.role).toBe("editor");
  });

  it("resolves the owner's account as an administrator, from its own row", async () => {
    await signIn("owner@demo.helmdeck.dev");

    const { helmdeckSessionStrategy } = await import("../fixtures/lib/payload-auth-strategy");

    const result = await helmdeckSessionStrategy.authenticate({
      headers: new Headers({ cookie: `helmdeck_session=${cookieIO.read()}` }),
      payload,
      canSetHeaders: false,
    });

    expect(result.user?.id).toBe("usr_owner");
    expect(result.user?.role).toBe("admin");
  });

  it("refuses Payload's own login route, because there is no second credential store", async () => {
    const { payloadCollections } = await import("../fixtures/lib/payload-collections");

    const accounts = payloadCollections.find((collection) => collection.slug === "demo-accounts");
    const auth = accounts?.auth as { disableLocalStrategy?: boolean } | undefined;

    // Payload's login operation throws Forbidden when this is set, which is what keeps the demo's form the
    // only way in. Asserted on the config rather than through the HTTP route because that is the setting
    // the route reads, and a test of the route would pass for a login that succeeded for other reasons.
    expect(auth?.disableLocalStrategy).toBe(true);
  });
});