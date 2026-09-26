import assert from "node:assert/strict";
import { test } from "node:test";
import { nextTag, rewriteInstallUrls } from "./release-version.mjs";

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

test("rewrites the README install command to the new release", () => {
  const readme = [
    "## Install",
    "",
    "```bash",
    "pnpm add https://github.com/yesvus/helmdeck/releases/download/v0.3.0/yesvus-helmdeck-0.3.0.tgz",
    "```",
    "",
  ].join("\n");

  assert.equal(
    rewriteInstallUrls(readme, "0.3.1"),
    readme.replace("v0.3.0/yesvus-helmdeck-0.3.0.tgz", "v0.3.1/yesvus-helmdeck-0.3.1.tgz"),
  );
});

test("promotes a prerelease install command to the stable version", () => {
  const url = "https://github.com/yesvus/helmdeck/releases/download/v0.4.0-beta.2/yesvus-helmdeck-0.4.0-beta.2.tgz";

  assert.equal(
    rewriteInstallUrls(`pnpm add ${url}`, "0.4.0"),
    "pnpm add https://github.com/yesvus/helmdeck/releases/download/v0.4.0/yesvus-helmdeck-0.4.0.tgz",
  );
});

test("leaves unrelated README content untouched", () => {
  const readme = "See https://example.com/next/navigation for details.\n";

  assert.equal(rewriteInstallUrls(readme, "9.9.9"), readme);
});
