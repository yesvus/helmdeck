// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listActivityEventsAction } from "../fixtures/app/(helmdeck)/shell/activity/actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { listActivityEvents } from "../fixtures/lib/demo-activity";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { hashPassword } from "../fixtures/lib/demo-users";
import { signInAction } from "../fixtures/app/(helmdeck)/login/actions";

/**
 * The demo's activity trail, exercised through the action a browser would post to.
 *
 * The rule is the point of the file. A trail is everyone's writes, so the page and the read behind it
 * are asked the same question about the same session, and the two answers cannot differ: the nav link
 * is not what hides the page, and the page is not what refuses the read. An editor who reaches past
 * the link gets a refusal rather than a filtered list, because a trail shown in part without saying so
 * is a trail that reads as the whole of it.
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

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirected");
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const [owner, editor] = demoAccounts;
const store = demoPersistence().adapter;
const TABLE = "audit_events";

const EVENTS = [
  {
    id: "aud_1",
    resource: "products",
    resource_id: "prd_1",
    action: "create",
    actor_email: owner.email,
    actor_name: "Ada Owner",
    actor_role: "admin",
    fields: JSON.stringify(["name", "price"]),
    occurred_at: "2026-10-01T09:00:00.000Z",
  },
  {
    id: "aud_2",
    resource: "products",
    resource_id: "prd_1",
    action: "update",
    actor_email: editor.email,
    actor_name: "Ed Editor",
    actor_role: "editor",
    fields: JSON.stringify(["price"]),
    occurred_at: "2026-10-05T09:00:00.000Z",
  },
  {
    id: "aud_3",
    resource: "products",
    resource_id: "prd_2",
    action: "delete",
    actor_email: owner.email,
    actor_name: "Ada Owner",
    actor_role: "admin",
    fields: "[]",
    occurred_at: "2026-10-12T09:00:00.000Z",
  },
];

/** The seeded accounts, written whole, because an update on the memory adapter replaces the record. */
async function restoreAccounts() {
  for (const account of demoAccounts) {
    await store.update("users", account.id, {
      id: account.id,
      email: account.email,
      role: account.role,
      password_hash: await hashPassword(DEMO_PASSWORD),
    });
  }
}

async function signIn(account: { email: string }) {
  const result = await signInAction({ email: account.email, password: DEMO_PASSWORD }, "");
  expect(result.ok).toBe(true);
}

async function writeTrail() {
  for (const row of EVENTS) {
    if (await store.read(TABLE, row.id)) {
      await store.update(TABLE, row.id, row);
    } else {
      await store.create(TABLE, row);
    }
  }
}

async function clearTrail() {
  for (const row of await store.query<{ id: string }>(TABLE)) {
    if (row.id.startsWith("aud_")) await store.delete(TABLE, row.id);
  }
}

describe("the demo's activity trail", () => {
  beforeEach(async () => {
    // The session adapter refuses to reach for a cookie from anything shaped like a browser, and jsdom
    // is one. The action is server code, so it runs without it.
    vi.stubGlobal("window", undefined);
    request.session = undefined;
    await ensureDemoSeeded();
    await clearTrail();
    await writeTrail();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await clearTrail();
    // The two action tests sign in, so they leave signed sessions behind. The store is shared with
    // every other demo test and with the demo's own session listing, so they go rather than pile up.
    for (const row of await store.query<{ id: string }>("sessions")) {
      await store.delete("sessions", row.id);
    }
    await restoreAccounts();
  });

  it("reads the trail newest first, as the events the resource actions leave behind", async () => {
    const events = await listActivityEvents({ email: owner.email, role: "admin" });

    expect(events.map((event) => event.action)).toEqual(["delete", "update", "create"]);
    expect(events[2]).toMatchObject({
      action: "create",
      resource: "products",
      resourceId: "prd_1",
      occurredAt: "2026-10-01T09:00:00.000Z",
    });
  });

  it("carries the names of the fields a write touched, and no values", async () => {
    const [newest] = await listActivityEvents({ email: owner.email, role: "admin" }, { action: "create" });

    expect(newest?.metadata).toEqual({ fields: ["name", "price"] });
    expect(JSON.stringify(newest)).not.toContain("Espresso machine");
  });

  it("applies the filter the reader chose, rather than the whole table", async () => {
    const session = { email: owner.email, role: "admin" };

    expect(await listActivityEvents(session, { action: "update" })).toHaveLength(1);
    expect(await listActivityEvents(session, { actor: "editor" })).toHaveLength(1);
    expect(await listActivityEvents(session, { from: "2026-10-05" })).toHaveLength(2);
    expect(await listActivityEvents(session, { to: "2026-10-05" })).toHaveLength(2);
    expect(await listActivityEvents(session, { from: "2026-10-02", to: "2026-10-11" })).toHaveLength(1);
    expect(await listActivityEvents(session, { action: "restore" })).toHaveLength(0);
  });

  it("finds an actor by their name, which is on screen beside every one of their events", async () => {
    const session = { email: owner.email, role: "admin" };

    expect(await listActivityEvents(session, { actor: "Ed" })).toHaveLength(1);
    expect(await listActivityEvents(session, { actor: "Ada" })).toHaveLength(2);
    expect((await listActivityEvents(session, { actor: "ada" }))[0]?.actor).toMatchObject({
      email: owner.email,
      name: "Ada Owner",
      role: "admin",
    });
  });

  it("refuses an editor, in the reader as well as in the page", async () => {
    await expect(listActivityEvents({ email: editor.email, role: "editor" })).rejects.toThrow(/may not read/);
  });

  it("refuses a session there is none of, rather than reading an empty trail", async () => {
    await expect(listActivityEvents(null)).rejects.toThrow(/needs a session/);
  });

  it("serves an administrator through the action a browser posts to", async () => {
    await signIn(owner);

    const events = await listActivityEventsAction({ action: "delete" });
    expect(events.map((event) => event.action)).toEqual(["delete"]);
  });

  it("refuses the same session through the action, because the read is what decides", async () => {
    await signIn(editor);

    await expect(listActivityEventsAction({})).rejects.toThrow(/may not read/);
  });
});