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

type GlobalArgs = { slug?: string; data?: Record<string, unknown>; [key: string]: unknown };

/** A store that persists: `set` writes, `get` returns what was written, so a round trip is real. */
function storingStub() {
  const stored: Record<string, unknown> = {};
  const calls: GlobalArgs[] = [];
  const get = async (slug: string) => {
    calls.push({ slug });
    return { ...stored };
  };
  const set = async (slug: string, data: unknown) => {
    calls.push({ slug, data } as GlobalArgs);
    Object.assign(stored, data as Record<string, unknown>);
    return { ...stored };
  };
  return { stored, calls, get, set };
}

describe("payload site settings denied reads and writes", () => {
  it("refuses read and write with no session before reaching the store", async () => {
    const { get, set, stored } = storingStub();
    await expect(
      readPayloadSiteSettings({ store: { get, set }, resolveUser: async () => null }),
    ).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(
      writePayloadSiteSettings({ store: { get, set }, resolveUser: async () => null }, { name: "X" }),
    ).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    expect(stored).toEqual({});
  });
});

describe("payload site settings persistence", () => {
  it("reads the global through the store, after the session settles", async () => {
    const { get, set, calls, stored } = storingStub();
    stored["name"] = "Helmdeck Payload Host";
    const result = await readPayloadSiteSettings({ store: { get, set }, resolveUser: async () => ({ id: "u1" }) });
    expect(result["name"]).toBe("Helmdeck Payload Host");
    expect(calls[0]!.slug).toBe(SITE_SETTINGS_GLOBAL);
  });

  it("writes the global with the allowlisted keys and the server stamps", async () => {
    const { get, set, calls } = storingStub();
    const values = {
      name: "Acme",
      accent: "#123456",
      support_email: "help@acme.test",
      density: "compact",
      role: "admin",
    };
    await writePayloadSiteSettings({ store: { get, set }, resolveUser: async () => ({ id: "u1" }) }, values);

    const args = calls.find((call) => call.data !== undefined)!;
    expect(args.slug).toBe(SITE_SETTINGS_GLOBAL);
    expect(args.data).toMatchObject({ name: "Acme", accent: "#123456", support_email: "help@acme.test", density: "compact" });
    // The caller's unlisted key does not travel, and the change stamps are the server's fact.
    expect(args.data!["role"]).toBeUndefined();
    expect(args.data!["updated_by"]).toBe("u1");
    expect(args.data!["updated_at"]).toContain("2026");
  });

  it("round trips: the read answers the written values from the store", async () => {
    const stub = storingStub();
    const adapter = createPayloadSiteSettings({ store: stub, resolveUser: async () => ({ id: "u1" }) });
    const written = { name: "Acme", accent: "#123456", support_email: "help@acme.test", density: "compact" };
    await adapter.write(written);
    const read = await adapter.read();
    expect(read).toMatchObject(written);
  });

  it("trims the text it stores, so what was validated is what lands", async () => {
    const { get, set, calls } = storingStub();
    await writePayloadSiteSettings(
      { store: { get, set }, resolveUser: async () => ({ id: "u1" }) },
      { name: "  Acme  ", accent: " #123456 ", support_email: "help@acme.test ", density: "compact" },
    );
    const data = calls.find((call) => call.data !== undefined)!.data!;
    expect(data["name"]).toBe("Acme");
    expect(data["accent"]).toBe("#123456");
    expect(data["support_email"]).toBe("help@acme.test");
  });
});

describe("payload site settings invalid values", () => {
  it("rejects invalid values with the named reasons before reaching the store", async () => {
    const { get, set, calls } = storingStub();
    await expect(
      writePayloadSiteSettings(
        { store: { get, set }, resolveUser: async () => ({ id: "u1" }) },
        { name: "", accent: "red", support_email: "nope", density: "huge" },
      ),
    ).rejects.toThrow("name: Name must be between 2 and 48 characters.");
    expect(calls).toHaveLength(0);
  });

  it("validate lists a problem per rejected field", () => {
    const problems = validatePayloadSiteSettings({ name: "", accent: "red", support_email: "nope", density: "huge" });
    expect(problems.map((problem) => problem.key)).toEqual(["name", "accent", "support_email", "density"]);
  });
});
