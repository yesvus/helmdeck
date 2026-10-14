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

  it("does not insist during a production build, which runs with VERCEL set and no database", () => {
    // `next build` on Vercel has VERCEL=1 and connects to nothing on purpose. Keying the refusal on the
    // host rather than on the phase would fail every build there, and it would look like a database
    // outage rather than like a build that was never supposed to have one.
    expect(demoPersistenceRequired({ VERCEL: "1", NEXT_PHASE: "phase-production-build" })).toBe(false);
    expect(demoPersistenceRequired({ HELMDECK_DEMO_REQUIRE_DATABASE: "1", NEXT_PHASE: "phase-production-build" })).toBe(
      false,
    );
  });

  it("still insists while serving, which is the phase a deployment actually runs in", () => {
    expect(demoPersistenceRequired({ VERCEL: "1", NEXT_PHASE: "phase-production-server" })).toBe(true);
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
    for (const key of ["VERCEL", "HELMDECK_DEMO_REQUIRE_DATABASE", "HELMDECK_TURSO_URL", "HELMDECK_TURSO_TOKEN", "NEXT_PHASE"]) {
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
  const original = { ...process.env };

  // Every discriminator is cleared, not just VERCEL. A test whose outcome depends on ambient variables
  // passes here and fails on a machine that happens to set them, which is the worst way for a test to be
  // wrong: it looks like the suite is broken rather than the test.
  beforeEach(() => {
    vi.resetModules();
    for (const key of [
      "VERCEL",
      "HELMDECK_DEMO_REQUIRE_DATABASE",
      "HELMDECK_TURSO_URL",
      "HELMDECK_TURSO_TOKEN",
      "NEXT_PHASE",
    ]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  it("insists at boot in a deployment, and is the reason the refusal does not wait for a visitor", async () => {
    process.env.VERCEL = "1";
    const { register } = await import("../fixtures/instrumentation");
    expect(() => register()).toThrow(/HELMDECK_TURSO_URL/);
  });

  it("does nothing at all in a local run", async () => {
    const { register } = await import("../fixtures/instrumentation");
    expect(() => register()).not.toThrow();
  });

  it("does nothing during a production build, even with VERCEL set", async () => {
    process.env.VERCEL = "1";
    process.env.NEXT_PHASE = "phase-production-build";
    const { register } = await import("../fixtures/instrumentation");
    expect(() => register()).not.toThrow();
  });
});