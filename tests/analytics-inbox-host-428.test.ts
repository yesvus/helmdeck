// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { AnalyticsEvents, ContactMessages } from "../examples/payload-host/lib/payload/analytics";
import { createPayloadPersistence } from "../examples/payload-host/lib/payload/persistence";
import { createInboxActions } from "../examples/payload-host/lib/inbox-actions-factory";
import { createAdminPayloadContent } from "../src/payload/bridge";
import { adminAnalyticsSeries } from "../src/analytics";
import { contactInboxMessage } from "../examples/payload-host/lib/inbox-message";

describe("analytics/inbox host #428 collections access", () => {
  it("analytics-events is server-write only and admin-read", async () => {
    const access = (AnalyticsEvents as unknown as { access: Record<string, (args: unknown) => unknown> }).access;
    const invoke = (op: string, user: unknown) => (access[op] as (args: never) => unknown)({ req: { user } } as never);
    expect(await invoke("create", null)).toBe(false);
    expect(await invoke("create", { id: "a", role: "admin" })).toBe(false);
    expect(await invoke("read", null)).toBe(false);
    expect(await invoke("read", { id: "a", role: "editor" })).toBe(false);
    expect(await invoke("read", { id: "a", role: "admin" })).toBe(true);
  });

  it("contact-messages allows public create and admin triage", async () => {
    const access = (ContactMessages as unknown as { access: Record<string, (args: unknown) => unknown> }).access;
    const invoke = (op: string, user: unknown) => (access[op] as (args: never) => unknown)({ req: { user } } as never);
    expect(await invoke("create", null)).toBe(true);
    expect(await invoke("read", null)).toBe(false);
    expect(await invoke("read", { id: "a", role: "admin" })).toBe(true);
    expect(await invoke("update", { id: "a", role: "admin" })).toBe(true);
    expect(await invoke("update", null)).toBe(false);
  });
});

describe("analytics/inbox host #428 pageview persistence", () => {
  it("persists a page view through the adapter", async () => {
    const payload = {
      find: vi.fn(async () => ({ docs: [], totalDocs: 0 })),
      findByID: vi.fn(),
      create: vi.fn(async () => ({ id: "e1" })),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const content = createAdminPayloadContent({ payload, resolveUser: async () => ({ id: "sys", email: "sys@example.com" }) });
    const store = createPayloadPersistence({ content });
    const result = await store.create("analytics_events", { kind: "page_view", path: "/home", visitor_key: "v1", source: null, occurred_at: "2026-11-02T00:00:00.000Z" });
    expect(result).toEqual({ id: "e1" });
    expect(payload.create).toHaveBeenCalled();
    const args = (payload.create as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { collection: string; overrideAccess: boolean };
    expect(args.collection).toBe("analytics-events");
    expect(args.overrideAccess).toBe(false);
  });
});

describe("analytics/inbox host #428 aggregation mapping", () => {
  it("zero-fills days without events", async () => {
    const store = {
      query: vi.fn(async () => [
        { id: "1", kind: "page_view", path: "/", visitor_key: "v1", source: null, occurred_at: "2026-11-01T10:00:00.000Z" },
      ]),
      read: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as never;
    const range = ["2026-10-31", "2026-11-01", "2026-11-02"];
    const series = await adminAnalyticsSeries(store, { range });
    expect(series.points).toHaveLength(3);
    expect(series.points[1].views).toBe(1);
    expect(series.points[0].views).toBe(0);
    expect(series.points[2].views).toBe(0);
  });
});

describe("analytics/inbox host #428 contact message flow", () => {
  function payload() {
    return {
      find: vi.fn(async () => ({ docs: [{ id: "m1", name: "Ada", email: "ada@example.com", subject: "Hi", message: "Hello", status: "new", created_at: "2026-11-02T00:00:00.000Z" }] })),
      findByID: vi.fn(async () => ({ id: "m1", name: "Ada", email: "ada@example.com", subject: "Hi", message: "Hello", status: "new", created_at: "2026-11-02T00:00:00.000Z" })),
      create: vi.fn(async () => ({ id: "m2" })),
      update: vi.fn(async () => ({ id: "m1" })),
      delete: vi.fn(),
    };
  }

  it("refuses non-admin create", async () => {
    const p = payload();
    const actions = createInboxActions({ sessionResolver: async () => null, payload: p });
    const result = await actions.createMessage({ name: "Ada", email: "ada@example.com", subject: "Hi", message: "Hello" });
    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(p.create).not.toHaveBeenCalled();
  });

  it("creates for an admin", async () => {
    const p = payload();
    const actions = createInboxActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: p });
    const result = await actions.createMessage({ name: "Ada", email: "ada@example.com", subject: "Hi", message: "Hello" });
    expect(result).toEqual({ ok: true });
    expect(p.create).toHaveBeenCalled();
  });

  it("refuses non-admin status update", async () => {
    const p = payload();
    const actions = createInboxActions({ sessionResolver: async () => ({ id: "e", role: "editor" }), payload: p });
    const result = await actions.markRead("m1");
    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(p.update).not.toHaveBeenCalled();
  });

  it("updates status for an admin", async () => {
    const p = payload();
    const actions = createInboxActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: p });
    const result = await actions.markRead("m1");
    expect(result).toEqual({ ok: true });
    expect(p.update).toHaveBeenCalled();
  });

  it("lists messages for an admin", async () => {
    const p = payload();
    const actions = createInboxActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: p });
    const messages = await actions.listMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("m1");
  });

  it("maps a contact record into the inbox view model", () => {
    const mapped = contactInboxMessage({
      id: "msg-1",
      name: "Ada",
      email: "ada@example.com",
      subject: "Question",
      message: "Hello",
      status: "new",
      created_at: "2026-10-20T00:00:00.000Z",
    });
    expect(mapped).not.toBeNull();
    expect(mapped?.status).toBe("unread");
  });
});
