// SPDX-License-Identifier: MIT

/**
 * The database guard, and the call sites that are supposed to invoke it.
 *
 * The shape of these tests is chosen by one rule: **each one has to fail when the thing it names is
 * removed.** `assertDemoPersistenceConfigured` already existed and already threw, and the suite was green
 * with it stubbed out in every test that touched it, because nothing in the demo ever called it. A guard
 * with no call site is a function nobody runs.
 *
 * So the call-site tests do not stub the guard. They run the real one against a real environment that says
 * this is a deployment, and assert the refusal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertDemoPersistenceConfigured, demoPersistenceRequired } from "../fixtures/lib/demo-persistence";

const CONFIGURED = {
  HELMDECK_TURSO_URL: "libsql://example.turso.io",
  HELMDECK_TURSO_TOKEN: "token",
};

const UNCONFIGURED = {};

/** A deployment that has lost its database variables. `VERCEL` is the one it cannot also have lost. */
const DEPLOYED_WITHOUT_DATABASE = { VERCEL: "1" };

describe("whether this process must have a database", () => {
  it("insists in a deployment, because VERCEL is set there and losing the database loses nothing else", () => {
    expect(demoPersistenceRequired(DEPLOYED_WITHOUT_DATABASE)).toBe(true);
  });

  it("does not insist in a local run, where an in-memory store is the intended thing", () => {
    expect(demoPersistenceRequired({})).toBe(false);
    expect(demoPersistenceRequired({ NODE_ENV: "production" })).toBe(false);
  });

  it("does not insist on NODE_ENV alone, because next build sets it with no database present", () => {
    // `pnpm build:fixtures` runs `next build`, which sets NODE_ENV=production and connects to nothing.
    // Keying the refusal on NODE_ENV would fail every build in this repository, which is a louder and
    // more expensive version of the same defect.
    expect(demoPersistenceRequired({ NODE_ENV: "production" })).toBe(false);
  });

  it("takes an explicit opt-in for a deployment on a platform that does not set VERCEL", () => {
    expect(demoPersistenceRequired({ HELMDECK_DEMO_REQUIRE_DATABASE: "1" })).toBe(true);
  });
});

describe("the guard itself", () => {
  it("passes when the database is configured", () => {
    expect(() => assertDemoPersistenceConfigured(CONFIGURED)).not.toThrow();
  });

  it("refuses, and names both variables", () => {
    expect(() => assertDemoPersistenceConfigured(UNCONFIGURED)).toThrow(/HELMDECK_TURSO_URL/);
    expect(() => assertDemoPersistenceConfigured(UNCONFIGURED)).toThrow(/HELMDECK_TURSO_TOKEN/);
  });

  it("refuses on one variable alone, because half a database is not a database", () => {
    expect(() => assertDemoPersistenceConfigured({ HELMDECK_TURSO_URL: "libsql://x" })).toThrow();
    expect(() => assertDemoPersistenceConfigured({ HELMDECK_TURSO_TOKEN: "t" })).toThrow();
  });
});

describe("the call site in the boot path, which is the part that was missing", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    for (const key of ["VERCEL", "HELMDECK_DEMO_REQUIRE_DATABASE", "HELMDECK_TURSO_URL", "HELMDECK_TURSO_TOKEN"]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  it("refuses to seed a deployment that has no database", async () => {
    process.env.VERCEL = "1";
    const { ensureDemoSeeded } = await import("../fixtures/lib/ensure-seeded");
    await expect(ensureDemoSeeded()).rejects.toThrow(/HELMDECK_TURSO_URL/);
  });

  it("leaves a local run alone, because an in-memory store is what it asked for", async () => {
    const { ensureDemoSeeded } = await import("../fixtures/lib/ensure-seeded");
    // Reaches the store rather than the guard, so it resolves or fails on its own terms rather than on
    // the refusal. Asserted only that it did not throw the guard's message.
    await ensureDemoSeeded().catch((error: unknown) => {
      expect(String(error)).not.toMatch(/HELMDECK_TURSO_URL and HELMDECK_TURSO_TOKEN are not set/);
    });
  });
});

describe("the boot hook", () => {
  it("insists at boot in a deployment, and is the reason the refusal does not wait for a visitor", async () => {
    vi.resetModules();
    process.env.VERCEL = "1";
    delete process.env.HELMDECK_TURSO_URL;
    delete process.env.HELMDECK_TURSO_TOKEN;
    const { register } = await import("../fixtures/instrumentation");
    expect(() => register()).toThrow(/HELMDECK_TURSO_URL/);
  });

  it("does nothing at all in a local run", async () => {
    vi.resetModules();
    delete process.env.VERCEL;
    const { register } = await import("../fixtures/instrumentation");
    expect(() => register()).not.toThrow();
  });
});