// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Feedback } from "../examples/payload-host/lib/payload/feedback";
import { allowFeedbackIntake } from "../examples/payload-host/lib/payload/feedback-intake-throttle";

const state = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../examples/payload-host/lib/payload/content", () => ({ payloadInstance: async () => ({ create: state.create }) }));

describe("Payload feedback intake", () => {
  beforeEach(() => { state.create.mockReset(); });

  it("accepts a valid anonymous submission and stores server-owned metadata", async () => {
    state.create.mockResolvedValue({ id: "f1" });
    const { POST } = await import("../examples/payload-host/app/api/feedback-intake/route");
    const response = await POST(new Request("http://localhost/api/feedback", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.4" }, body: JSON.stringify({ name: "A User", email: "a@example.com", subject: "Hello", message: "Message" }) }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ collection: "feedback", overrideAccess: true, data: expect.objectContaining({ name: "A User", status: "new", submitted_at: expect.any(String) }) }));
  });

  it("ignores caller-supplied status and submitted_at on public intake", async () => {
    state.create.mockResolvedValue({ id: "f2" });
    const { POST } = await import("../examples/payload-host/app/api/feedback-intake/route");
    const response = await POST(new Request("http://localhost/api/feedback-intake", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify({ name: "A User", email: "b@example.com", subject: "Different", message: "Different", status: "archived", submitted_at: "2000-01-01T00:00:00.000Z" }) }));
    expect(response.status).toBe(201);
    const [{ data }] = state.create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data).toEqual({ name: "A User", email: "b@example.com", subject: "Different", message: "Different", status: "new", submitted_at: expect.any(String) });
    expect(data.submitted_at).not.toBe("2000-01-01T00:00:00.000Z");
  });

  it("rejects malformed submissions without writing", async () => {
    const { POST } = await import("../examples/payload-host/app/api/feedback-intake/route");
    const response = await POST(new Request("http://localhost/api/feedback", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.5" }, body: JSON.stringify({ name: [], email: "bad" }) }));
    expect(response.status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and empty bodies with a minimal acknowledgement", async () => {
    const { POST } = await import("../examples/payload-host/app/api/feedback-intake/route");
    for (const body of ["{", ""]) {
      const response = await POST(new Request("http://localhost/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false });
    }
    expect(state.create).not.toHaveBeenCalled();
  });

  it("rejects request bodies larger than 32KB", async () => {
    const { POST } = await import("../examples/payload-host/app/api/feedback-intake/route");
    const response = await POST(new Request("http://localhost/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: `{"message":"${"x".repeat(40 * 1024)}"}` }));
    expect(response.status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });

  it("returns a minimal failure acknowledgement when persistence fails", async () => {
    state.create.mockRejectedValue(new Error("secret database internals"));
    const { POST } = await import("../examples/payload-host/app/api/feedback-intake/route");
    const response = await POST(new Request("http://localhost/api/feedback-intake", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.6" }, body: JSON.stringify({ name: "A User", email: "c@example.com", subject: "Failure", message: "Failure" }) }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(response.text).not.toContain("secret database internals");
  });

  it("does not trust spoofed forwarding headers when the proxy header is unset", async () => {
    delete process.env.PAYLOAD_TRUSTED_PROXY_HEADER;
    const { POST } = await import("../examples/payload-host/app/api/feedback-intake/route");
    const body = JSON.stringify({ name: "A User", email: "spoof@example.com", subject: "Forwarding", message: "Ignored header" });
    const first = await POST(new Request("http://localhost/api/feedback-intake", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.1" }, body }));
    const second = await POST(new Request("http://localhost/api/feedback-intake", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.2" }, body }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
  });
});

describe("feedback intake throttle", () => {
  it("deduplicates content for five minutes and expires the signature", () => {
    const body = { email: "dedupe@example.com", subject: "dedupe", message: "same" };
    const now = Date.now() + 60 * 60_000;
    expect(allowFeedbackIntake(body, now)).toBe(true);
    expect(allowFeedbackIntake(body, now + 1)).toBe(false);
    expect(allowFeedbackIntake(body, now + 5 * 60_000)).toBe(true);
  });

  it("enforces the global cap, ignores untrusted forwarded values, and bounds buckets", () => {
    const now = Date.now() + 2 * 60 * 60_000;
    for (let index = 0; index < 100; index += 1) expect(allowFeedbackIntake({ email: `cap${index}@example.com`, subject: "cap", message: "unique" }, now)).toBe(true);
    expect(allowFeedbackIntake({ email: "cap101@example.com", subject: "cap", message: "unique" }, now + 1)).toBe(false);
    expect(allowFeedbackIntake({ email: "proxy@example.com", subject: "proxy", message: "content" }, now + 16 * 60_000)).toBe(true);
    expect(allowFeedbackIntake({ email: "proxy@example.com", subject: "proxy", message: "content", trustedProxyValue: "spoofed" }, now + 16 * 60_000 + 1)).toBe(false);
    for (let index = 0; index < 1200; index += 1) allowFeedbackIntake({ email: `bounded${index}@example.com`, subject: "bounded", message: "unique" }, now + 32 * 60_000);
    expect(allowFeedbackIntake({ email: "expired@example.com", subject: "x", message: "x" }, now + 48 * 60_000)).toBe(true);
  });

  it("keeps the global cap after 1024 distinct per-key attempts", () => {
    const now = Date.now() + 100 * 60 * 60_000;
    for (let index = 0; index < 100; index += 1) {
      expect(allowFeedbackIntake({ email: `global${index}@example.com`, subject: "global", message: `unique-${index}` }, now)).toBe(true);
    }
    for (let index = 0; index < 1024; index += 1) {
      expect(allowFeedbackIntake({ email: `overflow${index}@example.com`, subject: "overflow", message: `unique-${index}` }, now + 1)).toBe(false);
    }
    expect(allowFeedbackIntake({ email: "after-overflow@example.com", subject: "overflow", message: "unique" }, now + 2)).toBe(false);
  });
});

describe("feedback collection access", () => {
  const access = Feedback.access!;
  const invoke = (operation: "create" | "read" | "update", user: unknown) => (access[operation] as (args: never) => unknown)({ req: { user } } as never);

  it("denies anonymous local API creates without overrideAccess", async () => {
    expect(await invoke("create", null)).toBe(false);
  });

  it("denies anonymous reads and updates, permits admin triage, and denies editor review", async () => {
    expect(await invoke("read", null)).toBe(false);
    expect(await invoke("update", null)).toBe(false);
    expect(await invoke("read", { id: "a", role: "editor" })).toBe(false);
    expect(await invoke("read", { id: "a", role: "admin" })).toBe(true);
    expect(await invoke("update", { id: "a", role: "admin" })).toBe(true);
  });
});
