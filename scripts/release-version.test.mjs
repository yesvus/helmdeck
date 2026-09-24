import assert from "node:assert/strict";
import { test } from "node:test";
import { nextTag } from "./release-version.mjs";

test("increments an alpha prerelease", () => {
  assert.equal(nextTag("v0.1.0-alpha.1", "alpha"), "v0.1.0-alpha.2");
});

test("promotes alpha and beta releases to stable versions", () => {
  assert.equal(nextTag("v0.1.0-alpha.3", "stable"), "v0.1.0");
  assert.equal(nextTag("v0.1.0-beta.2", "stable"), "v0.1.0");
});

test("starts a beta from the current alpha base", () => {
  assert.equal(nextTag("v0.1.0-alpha.3", "beta"), "v0.1.0-beta.1");
});

test("bumps stable versions with semver transitions", () => {
  assert.equal(nextTag("v1.2.3", "patch"), "v1.2.4");
  assert.equal(nextTag("v1.2.3", "minor"), "v1.3.0");
  assert.equal(nextTag("v1.2.3", "major"), "v2.0.0");
});

test("rejects unknown transitions", () => {
  assert.throws(() => nextTag("v1.2.3", "release"), /Unknown bump type/);
});

test("rejects noncanonical numeric prerelease identifiers", () => {
  assert.throws(() => nextTag("v0.1.0-alpha.01", "stable"), /Invalid version tag/);
});
