// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

/**
 * The package documents two entry points, the bare name and the `./baseline` subpath, and a host
 * installs both. `vitest.config.ts` used to carry a single string alias, which is a prefix
 * replacement, so `@yesvus/helmdeck/baseline` was rewritten to `src/index.ts/baseline`, a file that
 * does not exist. Nothing imported the subpath, so the documented entry point was broken in the one
 * place that resolves the package by name, and a test written against the baseline had to reach into
 * `../../src` instead.
 *
 * Asserting that the subpath merely loads is not enough to catch that, and it is worth saying why:
 * the package resolves itself by name through its own `exports` map, so with the alias entry absent
 * the subpath still loads, from `dist/`. A test that only checked "it imported" would pass against a
 * stale build while the source under test was never exercised. Comparing against the source module
 * is what makes the assertion mean something: `dist` is a separate compiled copy, so a resolution
 * that lands there is a different function object.
 */
describe("the baseline subpath resolves to the source the suite tests", () => {
  it("is the same module the bare name and the source path give", async () => {
    const viaSubpath = (await import("@yesvus/helmdeck/baseline")) as Record<string, unknown>;
    const viaSource = (await import("../src/baseline")) as Record<string, unknown>;

    expect(typeof viaSubpath.createSessionAuthAdapter).toBe("function");
    expect(typeof viaSubpath.createCredentialAuthAdapter).toBe("function");
    expect(typeof viaSubpath.createPersistenceCredentialStore).toBe("function");
    expect(typeof viaSubpath.createMemoryPersistenceAdapter).toBe("function");
    expect(typeof viaSubpath.createSqlitePersistenceAdapter).toBe("function");

    expect(viaSubpath.createSessionAuthAdapter).toBe(viaSource.createSessionAuthAdapter);
    expect(viaSubpath.createCredentialAuthAdapter).toBe(viaSource.createCredentialAuthAdapter);
    expect(viaSubpath.createPersistenceCredentialStore).toBe(viaSource.createPersistenceCredentialStore);
    expect(viaSubpath.createMemoryPersistenceAdapter).toBe(viaSource.createMemoryPersistenceAdapter);
    expect(viaSubpath.createSqlitePersistenceAdapter).toBe(viaSource.createSqlitePersistenceAdapter);
  });

  it("resolves the bare name to the same module, so the two entry points cannot drift apart", async () => {
    const viaName = (await import("@yesvus/helmdeck")) as Record<string, unknown>;
    const viaSource = (await import("../src/index")) as Record<string, unknown>;

    expect(viaName.cn).toBe(viaSource.cn);
  });
});
