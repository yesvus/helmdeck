// SPDX-License-Identifier: MIT

/**
 * The `overrideAccess` boundary, checked against a running Payload rather than argued.
 *
 * Payload's Local API sets `overrideAccess: true` **by default**. A call that does not pass
 * `overrideAccess: false` skips every access function in the config: it reads and writes with no
 * permission check at all, raises nothing, logs nothing, and appears to work perfectly. Passing a
 * `user` on its own changes nothing, because with access control switched off there is nothing to
 * check the user against.
 *
 * Every case below is written so that it would fail against the unsafe version of this code:
 *
 *   - the first test proves the unsafe call really does land, so the refusals that follow are the
 *     access functions refusing rather than a database that refuses everything;
 *   - the second proves `overrideAccess: false` with no user is refused;
 *   - the third proves the same call with a permitted user succeeds, so the second is not a rule that
 *     refuses everyone;
 *   - the last two go through the demo's own adapter, which is the only place in this repository that
 *     calls Payload, and prove it refuses before it reaches Payload at all.
 *
 * A test that only proved a write succeeded would pass against exactly the code this file exists to
 * catch.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPayload, type Payload } from "payload";

/**
 * The request scope, stood in for.
 *
 * State is held in a hoisted object rather than a closure inside the factory, because the factory is
 * evaluated before the module body runs and a `let` declared here would be in its temporal dead zone
 * when the factory was called. One mutable cookie stands for one browser: the demo's sign-in writes it
 * and Payload's strategy reads it, and both go through this object, which is what makes the round trip
 * in the second describe block a real one.
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
    get: (name: string) => (browser.cookies.has(name) ? { name, value: browser.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => {
      browser.cookies.set(name, value);
    },
    delete: (options: { name?: string; path?: string } | string) => {
      browser.cookies.delete(typeof options === "string" ? options : options.name!);
    },
  }),
}));

/**
 * A real Payload against a real SQLite file, because a mock cannot demonstrate that a call which
 * skipped access control was refused. The refusal is decided inside Payload, so Payload has to be
 * running for the assertion to mean anything.
 */
let workdir: string;
let payload: Payload;

/**
 * The demo's own accounts table, created here because nothing else in this suite will.
 *
 * In a deployment `fixtures/lib/migrations/0001_initial.sql` creates it, and Payload's collection
 * declares `dbName: 'users'` so Payload reads that table rather than creating one. On a throwaway file
 * there is no deployment, and Payload's update path clears a document lock whose relation row points at
 * `users`, so a write fails on a missing table that has nothing to do with the question being asked.
 * The columns are the ones that migration creates, and no row is written into it: the access functions
 * are handed a user object directly rather than resolved from a session.
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

/** A lexical value Payload accepts for a required rich text field. */
function richText(text: string) {
  return {
    root: {
      type: "root" as const,
      format: "" as const,
      indent: 0,
      version: 1,
      direction: "ltr" as const,
      children: [
        {
          type: "paragraph",
          format: "" as const,
          indent: 0,
          version: 1,
          direction: "ltr" as const,
          children: [
            { type: "text", detail: 0, format: 0, mode: "normal", style: "", text, version: 1 },
          ],
        },
      ],
    },
  };
}

beforeAll(async () => {
  workdir = mkdtempSync(join(tmpdir(), "helmdeck-payload-"));

  // The database is pointed at a throwaway file, so the suite never opens the demo's own database and a
  // run cannot write to a store somebody else pays for. `HELMDECK_PAYLOAD_DB_URL` rather than the Turso
  // pair, because the demo's reader requires both of those and a suite that set only one would silently
  // fall through to the developer's local file.
  process.env.HELMDECK_PAYLOAD_DB_URL = `file:${join(workdir, "payload.db")}`;
  process.env.PAYLOAD_SECRET = "payload-boundary-suite";

  const { default: config } = await import("../fixtures/payload.config");
  payload = await getPayload({ config });

  // The committed migration, rather than hand-written DDL for the content tables. The suite then runs
  // against the schema a deployment would actually have, which is the only version of this question
  // worth answering: a suite that built its own tables could pass against tables no migration creates.
  await payload.db.migrate?.();

  const client = (
    payload.db as unknown as { drizzle: { $client: { execute: (sql: string) => Promise<unknown> } } }
  ).drizzle.$client;
  await client.execute(SUITE_USERS_TABLE);
}, 120_000);

afterAll(async () => {
  rmSync(workdir, { recursive: true, force: true });
});

/** A document to write against, so a refusal is about permission rather than about nothing. */
async function seedPage(title: string) {
  return payload.create({
    collection: "demo-pages",
    // Seeding is not the thing under test, and the demo's rule would refuse a caller with no session.
    overrideAccess: true,
    data: { title, slug: title.toLowerCase().replace(/[^a-z]+/g, "-"), summary: "seeded", richText: richText("seeded") },
  });
}

/** The user object an editor's session resolves to, built the way the demo's adapter builds it. */
const EDITOR = { id: "usr_editor", email: "editor@demo.helmdeck.dev", role: "editor" } as const;

describe("Payload's Local API access boundary", () => {
  it("writes with no permission check at all when overrideAccess is left at its default", async () => {
    const page = await seedPage("Unsafe");

    // No `overrideAccess`, no `user`. This is the trap stated as an assertion: if this call were
    // refused, the refusals below would prove nothing, because a store that refuses every write needs
    // no access control to be correct.
    await payload.update({
      id: String(page.id),
      collection: "demo-pages",
      data: { title: "Unsafe landed" },
    });

    const changed = await payload.findByID({
      id: String(page.id),
      collection: "demo-pages",
      overrideAccess: true,
    });
    expect(changed.title).toBe("Unsafe landed");
  });

  it("refuses the same write when overrideAccess is false and no user is passed", async () => {
    const page = await seedPage("NoUser");

    await expect(
      payload.update({
        id: String(page.id),
        collection: "demo-pages",
        data: { title: "Still unauthorised" },
        overrideAccess: false,
      }),
    ).rejects.toThrow();

    // The row is untouched, which a rejection alone would not prove: a write that succeeded and then
    // reported an error would satisfy `rejects` while having changed the document.
    const unchanged = await payload.findByID({
      id: String(page.id),
      collection: "demo-pages",
      overrideAccess: true,
    });
    expect(unchanged.title).toBe("NoUser");
  });

  it("allows the same write when overrideAccess is false and a permitted user is passed", async () => {
    const page = await seedPage("Permitted");

    const updated = await payload.update({
      id: String(page.id),
      collection: "demo-pages",
      data: { title: "Permitted edit" },
      overrideAccess: false,
      user: EDITOR as never,
    });

    expect(updated.title).toBe("Permitted edit");
  });

  it("refuses an editor deleting, which the demo's rule does not grant", async () => {
    const page = await seedPage("EditorDelete");

    await expect(
      payload.delete({
        id: String(page.id),
        collection: "demo-pages",
        overrideAccess: false,
        user: EDITOR as never,
      }),
    ).rejects.toThrow();

    const still = await payload.findByID({
      id: String(page.id),
      collection: "demo-pages",
      overrideAccess: true,
    });
    expect(still.id).toBe(page.id);
  });
});

describe("the demo's own adapter into Payload", () => {
  beforeEach(() => browser.clear());

  it("refuses every operation when no session resolves, before reaching Payload", async () => {
    const {
      createPayloadPage,
      listPayloadPages,
      readPayloadPage,
      updatePayloadPage,
      PayloadAccessRefused,
    } = await import("../fixtures/lib/payload-content");

    // No cookie in the mocked request scope, so `resolveDemoPrincipal` finds nothing. Each call must
    // refuse here rather than reach Payload, because a call that reached it without a user would be
    // answered by whatever `overrideAccess` defaults to.
    await expect(listPayloadPages(payload)).rejects.toBeInstanceOf(PayloadAccessRefused);
    await expect(readPayloadPage(payload, "any")).rejects.toBeInstanceOf(PayloadAccessRefused);
    await expect(
      createPayloadPage(payload, { title: "No session", slug: "no-session", richText: richText("x") }),
    ).rejects.toBeInstanceOf(PayloadAccessRefused);
    await expect(updatePayloadPage(payload, "any", { title: "No session" })).rejects.toBeInstanceOf(
      PayloadAccessRefused,
    );
  });

  it("writes once a real session from the demo's own sign-in resolves", async () => {
    // Signed in through the credential store rather than by writing a cookie string here, so the session
    // the adapter reads afterwards is one the demo actually issued and the row behind it actually exists.
    await signInThroughTheDemo();

    const { createPayloadPage, listPayloadPages } = await import("../fixtures/lib/payload-content");

    const created = await createPayloadPage(payload, {
      title: "Written through the adapter",
      slug: "written-through-the-adapter",
      richText: richText("Body from the adapter"),
    });
    expect(created.title).toBe("Written through the adapter");

    const listed = await listPayloadPages(payload);
    expect(listed.docs.some((doc) => doc.slug === "written-through-the-adapter")).toBe(true);
  });

  it("refuses an editor deleting through the adapter, which only overrideAccess: false can do", async () => {
    // This is the test that fails against the unsafe version of the adapter. With `overrideAccess: false`
    // the demo's rule refuses an editor's delete. Without it, Payload's Local API skips the rule entirely
    // and the delete lands, so an assertion of refusal here is only meaningful if the option is passed.
    //
    // It is checked against the adapter rather than against a hand-written call because the adapter is
    // the only thing in this repository that calls Payload, and a boundary that can be removed from it
    // without a test failing is not a boundary.
    await signInThroughTheDemo();

    const { createPayloadPage, deletePayloadPage } = await import("../fixtures/lib/payload-content");

    const created = await createPayloadPage(payload, {
      title: "An editor may not delete this",
      slug: "an-editor-may-not-delete-this",
      richText: richText("body"),
    });

    await expect(deletePayloadPage(payload, String(created.id))).rejects.toThrow();

    const still = await payload.findByID({
      id: String(created.id),
      collection: "demo-pages",
      overrideAccess: true,
    });
    expect(still.id).toBe(created.id);
  });
});

/**
 * Sign in through the demo's own adapter, so the session every later read finds was written by the
 * credential store and points at a seeded account.
 */
async function signInThroughTheDemo(): Promise<void> {
  const { demoAuth } = await import("../fixtures/lib/demo-session");
  const { DEMO_PASSWORD } = await import("../fixtures/lib/demo-accounts");

  const result = await demoAuth({ cookie: cookieIO }).login({
    email: "editor@demo.helmdeck.dev",
    password: DEMO_PASSWORD,
  });
  if (!result.ok) throw new Error(`the demo sign-in refused: ${result.message}`);

  expect(browser.cookies.get("helmdeck_session")).toBeTruthy();
}

/**
 * The demo's session cookie, over this file's request scope.
 *
 * Passed explicitly because the suite runs in jsdom, and the package's session adapter refuses to read
 * a cookie itself when `window` exists: a server-side module that silently opened a browser store would
 * be reading a cookie a page could have written. Supplying the store is the supported way to stand in
 * for a request, and it is the same store Payload's strategy reads through `resolveDemoPrincipal`.
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