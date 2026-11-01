// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { AdminPayloadAccessRefused } from "../src/payload/bridge";
import {
  createPayloadSiteSettings,
  readPayloadSiteSettings,
  writePayloadSiteSettings,
  validatePayloadSiteSettings,
  SITE_SETTINGS_GLOBAL,
} from "../examples/payload-host/lib/payload/settings";

type PayloadArgs = { slug?: string; [key: string]: unknown };

function makeSpy(answer: (args: PayloadArgs) => Promise<unknown> = async () => ({ name: "Helmdeck Payload Host" })) {
  const calls: PayloadArgs[] = [];
  const fn = async (args: PayloadArgs) => {
    calls.push(args);
    return answer(args);
  };
  (fn as unknown as { calls: PayloadArgs[] }).calls = calls;
  return fn as unknown as ((args: PayloadArgs) => Promise<unknown>) & { calls: PayloadArgs[] };
}

function payloadStub(overrides: Partial<Record<string, (args: PayloadArgs) => Promise<unknown>>> = {}) {
  const base: Record<string, unknown> = {
    findGlobal: makeSpy(async () => ({ name: "Helmdeck Payload Host", accent: "#b45309", support_email: "support@example.com", density: "comfortable" })),
    updateGlobal: makeSpy(async (args) => ({ ...(args.data as object), updated: true })),
  };
  for (const [key, value] of Object.entries(overrides)) {
    (base as Record<string, unknown>)[key] = makeSpy(value);
  }
  return base;
}

describe("payload site settings denied reads and writes", () => {
  it("refuses read and write with no session before reaching payload", async () => {
    const payload = payloadStub();
    await expect(readPayloadSiteSettings({ payload: payload as never, resolveUser: async () => null })).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(writePayloadSiteSettings({ payload: payload as never, resolveUser: async () => null }, { name: "X" })).rejects.toBeInstanceOf(AdminPayloadAccessRefused);

    expect((payload as { findGlobal: { calls: unknown[] } }).findGlobal.calls).toHaveLength(0);
    expect((payload as { updateGlobal: { calls: unknown[] } }).updateGlobal.calls).toHaveLength(0);
  });
});

describe("payload site settings persistence", () => {
  it("reads the global with overrideAccess false and the session user", async () => {
    const payload = payloadStub();
    const result = await readPayloadSiteSettings({ payload: payload as never, resolveUser: async () => ({ id: "u1" }) });
    expect(result).toBeTruthy();
    const args = (payload as { findGlobal: { calls: PayloadArgs[] } }).findGlobal.calls[0]!;
    expect(args.slug).toBe(SITE_SETTINGS_GLOBAL);
    expect(args.overrideAccess).toBe(false);
    expect(args.user).toEqual({ id: "u1" });
  });

  it("writes the global with overrideAccess false and the session user", async () => {
    const payload = payloadStub();
    const values = { name: "Acme", accent: "#123456", support_email: "help@acme.test", density: "compact" };
    await writePayloadSiteSettings({ payload: payload as never, resolveUser: async () => ({ id: "u1" }) }, values);

    const args = (payload as { updateGlobal: { calls: PayloadArgs[] } }).updateGlobal.calls[0]!;
    expect(args.slug).toBe(SITE_SETTINGS_GLOBAL);
    expect(args.overrideAccess).toBe(false);
    expect(args.user).toEqual({ id: "u1" });
    expect(args.data).toMatchObject(values);
  });

  it("round trips through the adapter", async () => {
    const payload = payloadStub();
    const adapter = createPayloadSiteSettings({ payload: payload as never, resolveUser: async () => ({ id: "u1" }) });
    await adapter.write({ name: "Acme", accent: "#123456", support_email: "help@acme.test", density: "compact" });
    const read = await adapter.read();
    expect(read).toBeTruthy();
  });
});

describe("payload site settings invalid values", () => {
  it("rejects invalid values before reaching payload", async () => {
    const payload = payloadStub();
    await expect(
      writePayloadSiteSettings({ payload: payload as never, resolveUser: async () => ({ id: "u1" }) }, { name: "", accent: "red", support_email: "nope", density: "huge" }),
    ).rejects.toThrow();
    expect((payload as { updateGlobal: { calls: unknown[] } }).updateGlobal.calls).toHaveLength(0);
  });

  it("validate lists problems", () => {
    const problems = validatePayloadSiteSettings({ name: "", accent: "red", support_email: "nope", density: "huge" });
    expect(problems.length).toBeGreaterThan(0);
  });
});