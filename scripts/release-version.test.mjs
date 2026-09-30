import assert from "node:assert/strict";
import { join as joinPath } from "node:path";
import { test } from "node:test";
import { nextTag, recordExportedSurface, rewriteChangelogHeading, rewriteInstallUrls } from "./release-version.mjs";

/** Records the call instead of shelling out, so the release path is asserted rather than exercised. */
function fakeSpawn(status = 0) {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return { status };
  };
  return { spawn, calls };
}

test("records the exported surface as part of moving the version", () => {
  const { spawn, calls } = fakeSpawn();
  recordExportedSurface("v0.5.0", { root: "/repo", spawn });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0], joinPath("/repo", "scripts", "exported-surface.cli.mjs"));
  assert.equal(calls[0].args[1], "record");
});

test("records the release being cut, not the version package.json still holds", () => {
  // `write` and `bump` move the version after recording, so the version package.json holds at the
  // moment of the call is the one before. A ledger labelled with that one names a release it is not
  // the baseline of, which is the whole thing the label exists to prevent.
  const { spawn, calls } = fakeSpawn();
  recordExportedSurface("v0.5.0", { root: "/repo", spawn });

  assert.equal(calls[0].args[2], "v0.5.0");
});

test("runs the recorder from the repository, not the caller's directory", () => {
  const { spawn, calls } = fakeSpawn();
  recordExportedSurface("v0.5.0", { root: "/repo", spawn });

  assert.equal(calls[0].options.cwd, "/repo");
});

test("refuses to move the version when the surface cannot be recorded", () => {
  // A release whose baseline was never captured is a release whose removals cannot be checked
  // afterwards, and the failure has to land before the version moves rather than after it.
  const { spawn } = fakeSpawn(1);

  assert.throws(() => recordExportedSurface("v0.5.0", { root: "/repo", spawn }), /record mode exited 1/);
});

test("a failing recorder never reaches the filesystem it was pointed at", () => {
  const { spawn, calls } = fakeSpawn(1);

  try {
    recordExportedSurface("v0.5.0", { root: "/repo", spawn });
  } catch {
    // the refusal above is the assertion
  }

  assert.equal(calls.length, 1, "one attempt, then stop");
});

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

test("does not rewrite another project's release link", () => {
  const other = "https://github.com/other/tool/releases/download/v1.2.3/other-tool-1.2.3.tgz";
  const readme = `pnpm add https://github.com/yesvus/helmdeck/releases/download/v0.3.0/yesvus-helmdeck-0.3.0.tgz\n\nSee ${other}.\n`;

  assert.equal(
    rewriteInstallUrls(readme, "0.3.1"),
    readme.replace("v0.3.0/yesvus-helmdeck-0.3.0.tgz", "v0.3.1/yesvus-helmdeck-0.3.1.tgz"),
  );
  assert.ok(rewriteInstallUrls(readme, "0.3.1").includes(other));
});

test("repairs an install command whose tag and artifact name disagree", () => {
  const readme = "pnpm add https://github.com/yesvus/helmdeck/releases/download/v0.3.0/yesvus-helmdeck-0.2.0.tgz\n";

  assert.equal(
    rewriteInstallUrls(readme, "0.3.1"),
    "pnpm add https://github.com/yesvus/helmdeck/releases/download/v0.3.1/yesvus-helmdeck-0.3.1.tgz\n",
  );
});

test("the committed README install command matches the released version", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const version = readFileSync(resolve(root, "VERSION"), "utf8").trim().slice(1);
  const readme = readFileSync(resolve(root, "README.md"), "utf8");

  const command = /pnpm add (\S+\.tgz)/.exec(readme)?.[1];
  assert.ok(command, "README has no install command");
  assert.ok(
    command.includes(`/download/v${version}/`) && command.endsWith(`-${version}.tgz`),
    `README install command is not v${version}: ${command}`,
  );
});

test("stamps the pending changelog section with the version being cut", () => {
  const changelog = ["# Changelog", "", "## Unreleased", "", "- Something new", "", "## 0.3.2", "", "- Older"].join("\n");

  // The section is authored as Unreleased and renamed by the release, so the changelog can never
  // announce a release the rest of the repository does not agree has happened.
  assert.equal(rewriteChangelogHeading(changelog, "0.4.0"), changelog.replace("## Unreleased", "## 0.4.0"));
});

test("stamps only the pending section and leaves released ones alone", () => {
  const changelog = ["## Unreleased", "", "- New", "", "## 0.3.2", "", "- Old"].join("\n");
  const stamped = rewriteChangelogHeading(changelog, "0.4.0");

  assert.match(stamped, /^## 0\.4\.0$/m);
  assert.match(stamped, /^## 0\.3\.2$/m);
  assert.doesNotMatch(stamped, /Unreleased/);
});

test("refuses to cut a release with no pending changelog section", () => {
  // Failing loudly beats stamping nothing: a silent skip would leave the changelog describing a
  // release that never got notes, which is the state this exists to prevent.
  assert.throws(() => rewriteChangelogHeading("## 0.3.2\n", "0.4.0"), /Unreleased/);
});
