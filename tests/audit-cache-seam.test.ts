// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { createMemoryPersistenceAdapter } from "../src/baseline";
import {
  AdminPermissionDeniedError,
  AdminResourceNotExposedError,
  createAdminPermissionGuard,
  createAdminResourceActions,
  type AdminAuditEvent,
  type AdminPermission,
  type AdminPermissionGuard,
  type AdminPersistenceAdapter,
  type AdminResourceActions,
  type AdminSession,
} from "../src/index";

/**
 * The two adapters a host hands the resource actions, asked what a write leaves behind.
 *
 * Nothing here decides what was recorded by comparing against a constant. Every claim about an event
 * is read against the store the same host wrote to, because the point of the seam is that the trail
 * describes the write that happened: an event naming a record the store never made, or fields the
 * store does not hold, is a trail of a different system.
 */

const OWNER: AdminSession = { email: "owner@example.test", role: "admin" };
const EDITOR: AdminSession = { email: "editor@example.test", role: "editor" };
const SESSIONS = { owner: OWNER, editor: EDITOR } as const;

const EXPOSED = new Set(["products"]);
/** A record that exists before any test runs, so a write has something to be about. */
const SEEDED = "prd_seeded";

/** An editor works the catalogue and can neither add to it nor remove from it. */
function can(session: AdminSession, permission: AdminPermission): boolean {
  const [resource, operation] = permission.split(".");
  if (!EXPOSED.has(resource)) return false;
  if (session.role === "admin") return true;
  return operation === "read" || operation === "update";
}

function guardFor(role: keyof typeof SESSIONS | null): AdminPermissionGuard {
  const session = role === null ? null : SESSIONS[role];
  return createAdminPermissionGuard({ rule: can, session: () => session });
}

/** A store that notes the calls it received, in the order they arrived. */
function tracked(order: string[] = []) {
  const base = createMemoryPersistenceAdapter();
  const note = (call: string) => void order.push(call);
  const persistence: AdminPersistenceAdapter = {
    query: (async (resource: string, query?: Record<string, unknown>) => {
      note(`query:${resource}`);
      return base.query(resource, query);
    }) as AdminPersistenceAdapter["query"],
    read: async (resource, id) => {
      note(`read:${resource}:${id}`);
      return base.read(resource, id);
    },
    create: async (resource, value) => {
      note(`create:${resource}`);
      return base.create(resource, value);
    },
    update: async (resource, id, value) => {
      note(`update:${resource}:${id}`);
      return base.update(resource, id, value);
    },
    delete: async (resource, id) => {
      note(`delete:${resource}:${id}`);
      return base.delete(resource, id);
    },
  };
  return { base, order, persistence };
}

type Half = "audit" | "cache";
type Failure = { adapter: Half; cause: unknown };
/** The second argument the seam hands `onAdapterError`, which names the half and the write. */
type Reported = { adapter: Half; operation: string; resource: string; resourceId?: string };

/**
 * A host wired the way the README wires one.
 *
 * The events and the invalidations collect in a list rather than in a call count, because what a host
 * has afterwards is a trail someone reads back, and the properties below are about that list. `halves`
 * says which adapters the host supplied at all, and `record` and `invalidate` add behaviour to a half
 * that is already supplied, which is how a test makes one of them fail without unwiring the other.
 */
async function host(options: {
  role?: keyof typeof SESSIONS | null;
  halves?: Partial<Record<Half, boolean>>;
  record?: (event: AdminAuditEvent) => void | Promise<void>;
  invalidate?: (input: { resource: string; resourceId?: string; operation: string }) => void | Promise<void>;
  onAdapterError?: (cause: unknown, input: Reported) => void;
} = {}) {
  const wired = { audit: true, cache: true, ...options.halves };
  const store = tracked();
  const trail: AdminAuditEvent[] = [];
  const invalidated: { resource: string; resourceId?: string; operation: string }[] = [];
  const failures: Failure[] = [];

  const actions: AdminResourceActions = createAdminResourceActions({
    guard: guardFor(options.role ?? "owner"),
    persistence: store.persistence,
    expose: (resource) => EXPOSED.has(resource),
    ...(wired.audit
      ? {
        audit: {
          record: async (event: AdminAuditEvent) => {
            trail.push(event);
            await options.record?.(event);
          },
        },
      }
      : {}),
    ...(wired.cache
      ? {
        cache: {
          invalidate: async (input) => {
            invalidated.push(input);
            await options.invalidate?.(input);
          },
        },
      }
      : {}),
    onAdapterError: (cause: unknown, input: Reported) => {
      failures.push({ adapter: input.adapter, cause });
      options.onAdapterError?.(cause, input);
    },
  });

  await store.base.create("products", { id: SEEDED, name: "Seeded" });
  // A test asserting the store was not reached starts from a call record holding nothing.
  store.order.length = 0;

  return {
    ...store,
    actions,
    trail,
    invalidated,
    failures,
    /** The history a host reads back: the events for one resource, and for one record of it. */
    history: (resource: string, resourceId?: string) =>
      trail.filter(
        (event) =>
          event.resource === resource && (resourceId === undefined || event.resourceId === resourceId),
      ),
  };
}

/** The field names of a record, which is what an event's metadata says a write touched. */
function fieldsOf(record: unknown): string[] {
  const stored = record as Record<string, unknown>;
  return Object.keys(stored)
    .filter((key) => key !== "id")
    .sort();
}

describe("what a write leaves behind", () => {
  it("records a create against the record the store made, read back from the store", async () => {
    const app = await host();

    // No id in the value, so the store names the record. The event has to carry the same one, and the
    // only honest way to say that is to ask the store rather than to compare against a literal.
    const created = (await app.actions.create("products", { name: "Open" })) as { id: string };
    const stored = (await app.actions.read("products", created.id)) as Record<string, unknown>;

    expect(app.trail).toHaveLength(1);
    expect(app.trail[0]).toMatchObject({
      action: "create",
      resource: "products",
      actor: OWNER,
    });
    expect(app.trail[0].resourceId).toBe(stored.id);
    expect(app.trail[0].metadata).toEqual({ fields: fieldsOf(stored) });
    expect(app.trail[0].occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(Date.parse(app.trail[0].occurredAt as string))).toBe(false);
  });

  it("records an update and a delete as the operations they were, on the record named", async () => {
    const app = await host();
    const created = (await app.actions.create("products", { name: "Open" })) as { id: string };

    await app.actions.update("products", created.id, { name: "Renamed", sku: "A-1" });
    const afterUpdate = (await app.actions.read("products", created.id)) as Record<string, unknown>;
    await app.actions.delete("products", created.id);

    expect(app.trail.map((event) => event.action)).toEqual(["create", "update", "delete"]);
    // Every event names the same record, which is the question a host answers when someone asks what
    // happened to it. A trail where only the create names the record is two lists, not a history.
    expect(app.trail.map((event) => event.resourceId)).toEqual([created.id, created.id, created.id]);
    // The fields are the ones the store now holds, not the ones the caller sent, and a delete says
    // nothing about fields because the record it removed is not there to describe.
    expect(app.trail[1].metadata).toEqual({ fields: fieldsOf(afterUpdate) });
    expect(app.trail[2].metadata).toBeUndefined();
    // And the record is gone from the store, so the trail describes a change rather than an intention.
    expect(await app.actions.read("products", created.id)).toBeNull();
  });

  it("drops the cache for the collection on a create and for the record on an update or a delete", async () => {
    const app = await host();
    const created = (await app.actions.create("products", { name: "Open" })) as { id: string };

    await app.actions.update("products", created.id, { name: "Renamed" });
    await app.actions.delete("products", created.id);

    // A create invalidates the resource and not the record, because a record no read has returned
    // yet has no key in the host's cache, and what a create invalidates is the collection it joined.
    expect(app.invalidated).toEqual([
      { resource: "products", resourceId: undefined, operation: "create" },
      { resource: "products", resourceId: created.id, operation: "update" },
      { resource: "products", resourceId: created.id, operation: "delete" },
    ]);
  });

  it("records a write against the session the guard decided for", async () => {
    const app = await host({ role: "editor" });

    await app.actions.update("products", SEEDED, { name: "Edited by an editor" });

    expect(app.trail[0].actor).toEqual(EDITOR);
    expect(app.trail[0].actor?.email).toBe("editor@example.test");
  });

  it("leaves a read alone, on both halves", async () => {
    const app = await host();

    await app.actions.read("products", SEEDED);
    await app.actions.query("products");

    // Reading is not a change, and the cache contract has no operation for it, so a read that
    // recorded or invalidated anything would be inventing a vocabulary the contract does not have.
    expect(app.trail).toEqual([]);
    expect(app.invalidated).toEqual([]);
  });

  it("reads a record's history back as a list, which is what the trail is for", async () => {
    const app = await host();
    const created = (await app.actions.create("products", { name: "Open" })) as { id: string };
    const other = (await app.actions.create("products", { name: "Other" })) as { id: string };

    await app.actions.update("products", created.id, { name: "Renamed" });
    await app.actions.update("products", other.id, { name: "Also renamed" });
    await app.actions.delete("products", other.id);

    // Read the way a host reads it, out of the same list, with no adapter asked to do it: the events
    // carry the resource and the record themselves, so a history is a filter and not a guess.
    const ofOne = app.history("products", created.id);
    const ofAll = app.history("products");

    expect(ofOne.map((event) => event.action)).toEqual(["create", "update"]);
    expect(ofAll.map((event) => `${event.action}:${event.resourceId}`)).toEqual([
      `create:${created.id}`,
      `create:${other.id}`,
      `update:${created.id}`,
      `update:${other.id}`,
      `delete:${other.id}`,
    ]);
    // Every event says when it happened, so the list read in the order it was written is a timeline
    // rather than a set. A log of writes with no time and no order is a log of calls.
    const times = ofAll.map((event) => Date.parse(event.occurredAt as string));
    expect(times.every((time) => !Number.isNaN(time))).toBe(true);
    expect([...times].sort((left, right) => left - right)).toEqual(times);
  });
});

describe("a refused call records nothing", () => {
  it("records nothing for a call the rule refuses, asked the way an attacker would", async () => {
    const app = await host({ role: "editor" });

    // Nothing rendered anywhere asks for these two. The button is not in the way.
    await expect(app.actions.create("products", { name: "Smuggled" })).rejects.toThrow(
      AdminPermissionDeniedError,
    );
    await expect(app.actions.delete("products", SEEDED)).rejects.toThrow(AdminPermissionDeniedError);

    expect(app.trail).toEqual([]);
    expect(app.invalidated).toEqual([]);
    expect(app.order).toEqual([]);
  });

  it("records nothing for a name outside the exposed set", async () => {
    const app = await host();

    await expect(app.actions.delete("users", "usr_owner")).rejects.toThrow(AdminResourceNotExposedError);
    await expect(app.actions.create("users", { email: "new@example.test" })).rejects.toThrow(
      AdminResourceNotExposedError,
    );

    expect(app.trail).toEqual([]);
    expect(app.invalidated).toEqual([]);
  });

  it("records nothing when the store itself refuses the write", async () => {
    // Permitted, and then refused by the store: the other direction of the same claim. An event here
    // would say a record was updated that never was.
    const boom = new Error("no such column");
    const store = tracked();
    const trail: AdminAuditEvent[] = [];
    const invalidated: string[] = [];
    const actions = createAdminResourceActions({
      guard: guardFor("owner"),
      persistence: { ...store.persistence, update: async () => Promise.reject(boom) },
      audit: { record: async (event) => void trail.push(event) },
      cache: { invalidate: async ({ resource }) => void invalidated.push(resource) },
    });

    await expect(actions.update("products", SEEDED, { name: "x" })).rejects.toThrow(boom);

    expect(trail).toEqual([]);
    expect(invalidated).toEqual([]);
  });
});

describe("the order the halves run in", () => {
  it("prepares, then writes, then records, then invalidates", async () => {
    const order: string[] = [];
    const store = tracked(order);
    await store.base.create("products", { id: SEEDED, name: "Seeded" });
    order.length = 0;
    const actions = createAdminResourceActions({
      guard: guardFor("owner"),
      persistence: store.persistence,
      before: () => void order.push("before"),
      audit: { record: async () => void order.push("audit") },
      cache: { invalidate: async () => void order.push("cache") },
    });

    await actions.update("products", SEEDED, { name: "Renamed" });

    // The claim this file exists to hold, as an order rather than as prose. `before` is where it was,
    // behind the refusal and ahead of the effect, and the two new halves are behind the effect in
    // that order. Moving any of the four lines changes this list and fails the test.
    expect(order).toEqual(["before", `update:products:${SEEDED}`, "audit", "cache"]);
  });

  it("records after the store, which is the only order in which a create can name its record", async () => {
    const named: (string | undefined)[] = [];
    const store = tracked();
    const actions = createAdminResourceActions({
      guard: guardFor("owner"),
      persistence: store.persistence,
      audit: { record: async (event) => void named.push(event.resourceId) },
    });

    await actions.create("products", { name: "Open" });

    // A create has no id until the store assigns one, so an event recorded above the write could not
    // name the record it created, and the trail of a new record would be unreachable by id.
    expect(named).toHaveLength(1);
    expect(typeof named[0]).toBe("string");
    expect(named[0]).not.toBe("");
  });
});

describe("a host that wired one half", () => {
  it("records without a cache, and the write is unaffected", async () => {
    const app = await host({ halves: { cache: false } });

    const created = (await app.actions.create("products", { name: "Open" })) as { id: string };
    await app.actions.update("products", created.id, { name: "Renamed" });

    expect(app.trail).toHaveLength(2);
    expect(app.invalidated).toEqual([]);
    expect(await app.actions.read("products", created.id)).toMatchObject({ name: "Renamed" });
  });

  it("invalidates without a record, and the write is unaffected", async () => {
    const app = await host({ halves: { audit: false } });

    const created = (await app.actions.create("products", { name: "Open" })) as { id: string };
    await app.actions.update("products", created.id, { name: "Renamed" });

    expect(app.invalidated).toHaveLength(2);
    expect(app.trail).toEqual([]);
    expect(await app.actions.read("products", created.id)).toMatchObject({ name: "Renamed" });
  });
});

describe("a failing adapter", () => {
  it("does not fail a write the store already made, and does not stop the other half", async () => {
    const log = new Error("log sink down");
    const cacheDown = new Error("cache down");
    const app = await host({
      record: () => {
        throw log;
      },
      invalidate: () => {
        throw cacheDown;
      },
    });

    // Both halves reject and the caller is told about its write rather than about the logging. An
    // error here would be an error on a save that worked, which is how a person stops trusting the
    // admin and starts working around it.
    const created = (await app.actions.create("products", { name: "Open" })) as { id: string };
    await expect(app.actions.update("products", created.id, { name: "Renamed" })).resolves.toMatchObject({
      name: "Renamed",
    });

    // The change is in the store, and the record the caller was handed is the one that is there.
    expect(await app.actions.read("products", created.id)).toMatchObject({ name: "Renamed" });
    // One half failing does not take the other with it, so a broken log still lets a stale read be
    // dropped. Two writes, both halves, so four failures rather than two.
    expect(app.failures).toEqual([
      { adapter: "audit", cause: log },
      { adapter: "cache", cause: cacheDown },
      { adapter: "audit", cause: log },
      { adapter: "cache", cause: cacheDown },
    ]);
  });

  it("hands the failure to the host rather than swallowing it silently", async () => {
    const seen: { adapter: string; operation: string; resource: string; resourceId?: string }[] = [];
    const app = await host({
      record: () => {
        throw new Error("sink down");
      },
      onAdapterError: (_cause, input) => void seen.push(input),
    });

    const created = (await app.actions.create("products", { name: "Open" })) as { id: string };
    await app.actions.update("products", created.id, { name: "Renamed" });

    // A swallowed failure is an invisible failure, and a host whose trail stopped being written is a
    // host that cannot tell. Each failure names the half it came from and the write it belongs to.
    expect(seen).toEqual([
      { adapter: "audit", operation: "create", resource: "products", resourceId: undefined },
      { adapter: "audit", operation: "update", resource: "products", resourceId: created.id },
    ]);
    // And the cache half was not told about a failure it did not have.
    expect(app.failures.map((failure) => failure.adapter)).toEqual(["audit", "audit"]);
  });
});

describe("a host that wired neither half", () => {
  it("behaves exactly as it did, with no adapter called and no work done", async () => {
    // Built with a guard and a store and nothing else, which is what a host that never heard of the
    // two adapters passes. The failure hook is left out too, so there is no option here to call.
    const store = tracked();
    await store.base.create("products", { id: SEEDED, name: "Seeded" });
    store.order.length = 0;
    const actions = createAdminResourceActions({
      guard: guardFor("owner"),
      persistence: store.persistence,
    });
    const stamp = vi.spyOn(Date.prototype, "toISOString");
    stamp.mockClear();

    const created = (await actions.create("products", { name: "Open" })) as { id: string };
    await actions.update("products", created.id, { name: "Renamed" });
    await actions.delete("products", created.id);

    // The same calls, in the same order, over the same store. No timestamp is taken for an event
    // nobody receives, which is what "no extra work" has to mean to be worth saying.
    expect(store.order).toEqual([
      "create:products",
      `update:products:${created.id}`,
      `delete:products:${created.id}`,
    ]);
    expect(stamp).not.toHaveBeenCalled();
    expect(await actions.read("products", created.id)).toBeNull();
  });

  it("still refuses what it refused, with no adapter there to notice", async () => {
    const store = tracked();
    await store.base.create("products", { id: SEEDED, name: "Seeded" });
    store.order.length = 0;
    const actions = createAdminResourceActions({
      guard: guardFor("editor"),
      persistence: store.persistence,
    });

    await expect(actions.delete("products", SEEDED)).rejects.toThrow(AdminPermissionDeniedError);
    expect(store.order).toEqual([]);
  });
});
