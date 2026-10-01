// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { payloadDatabaseOptions, payloadMigrationsDir } from "../fixtures/lib/payload-db";

/**
 * Payload's migrations directory, resolved the way the demo's own migrations are.
 *
 * This exists because the path only misbehaves on a machine that is not this one. `process.cwd()` is the
 * repository root locally and a different directory entirely on Vercel, because the build sets
 * `outputDirectory`. Both times this project got that wrong it was a deploy that failed with a bare
 * `ENOENT` on a path nobody had ever seen, and no test failed, because every test ran on the layout that
 * happens to work here.
 *
 * So each candidate is built by hand under a temporary root and that root is passed in, which is the only
 * way to hold the deployed layout and the local one in the same test. Passing `process.cwd()` instead
 * would make every case below pass for the same reason, which is the mistake this file is guarding against
 * in the tests as much as in the code.
 */
function withRoot(paths: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "payload-migrations-"));
  for (const path of paths) mkdirSync(join(root, path), { recursive: true });
  return root;
}

describe("where Payload's migrations are looked for", () => {
  it("finds them under fixtures, which is the development layout", () => {
    const root = withRoot(["fixtures/payload-migrations"]);
    try {
      expect(payloadMigrationsDir(root)).toBe(join(root, "fixtures", "payload-migrations"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds them at the top level, which is a common deploy layout", () => {
    const root = withRoot(["payload-migrations"]);
    try {
      expect(payloadMigrationsDir(root)).toBe(join(root, "payload-migrations"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds them under lib, which is a single-file output layout", () => {
    const root = withRoot(["lib/payload-migrations"]);
    try {
      expect(payloadMigrationsDir(root)).toBe(join(root, "lib", "payload-migrations"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prefers fixtures when more than one candidate exists", () => {
    // Ordering is the whole of the resolution: an unordered search would pass every single-layout case
    // and silently pick differently between a laptop and a deployment.
    const root = withRoot(["fixtures/payload-migrations", "payload-migrations", "lib/payload-migrations"]);
    try {
      expect(payloadMigrationsDir(root)).toBe(join(root, "fixtures", "payload-migrations"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("names every path it tried when none of them exists", () => {
    // A missing file that says where it looked is a five-second fix. One that names a path the reader has
    // no reason to believe in is the outage this exists to prevent.
    expect(() => payloadMigrationsDir("/nowhere/at/all")).toThrow(
      /not at any of: .*\/nowhere\/at\/all\/fixtures\/payload-migrations/,
    );
    expect(() => payloadMigrationsDir("/nowhere/at/all")).toThrow(/Working directory was \/nowhere\/at\/all/);
  });

  it("does not accept a file where a directory belongs", () => {
    const root = withRoot([]);
    try {
      mkdirSync(join(root, "fixtures"), { recursive: true });
      expect(() => payloadMigrationsDir(root)).toThrow(/not at any of/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
describe("the option the adapter is actually built with", () => {
  it("resolves the migrations directory for the working directory it is given", () => {
    // The case the previous version of this file missed. Every test above passed a temporary root to the
    // resolver, so the *call site* inside `payloadDatabaseOptions` was never asserted: replacing it with
    // the assumed `process.cwd()` path failed nothing, and the deploy bug returned with a green suite.
    const root = withRoot(["payload-migrations"]);
    try {
      const options = payloadDatabaseOptions({}, root);
      expect(options.migrationDir).toBe(join(root, "payload-migrations"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is not a path assembled from process.cwd()", () => {
    // Stated as its own test because the assertion above can only fail if `cwd` is threaded through, and
    // that is the seam. If someone re-hardcodes the literal and leaves the parameter unused, this is the
    // test that says so.
    const root = withRoot(["lib/payload-migrations"]);
    try {
      expect(payloadDatabaseOptions({}, root).migrationDir).not.toContain(process.cwd());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
