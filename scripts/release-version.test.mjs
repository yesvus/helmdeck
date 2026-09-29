import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextTag,
  rewriteChangelogHeading,
  rewriteInstallUrls,
  staleRegistryCommands,
} from "./release-version.mjs";

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

test("rewrites the registry install command to the new release", () => {
  // The invariant the release rewriter exists to hold is that the documented install command
  // never lags. When the registry command became the one the README leads with, the tarball
  // rewrite alone left it stale: `pnpm add @yesvus/helmdeck@0.4.0` would still read 0.4.0
  // after a 0.5.0 release, and nothing would fail.
  assert.equal(
    rewriteInstallUrls("pnpm add @yesvus/helmdeck@0.4.0", "0.5.0"),
    "pnpm add @yesvus/helmdeck@0.5.0",
  );
});

test("rewrites both install commands in one pass", () => {
  const readme = [
    "pnpm add @yesvus/helmdeck@0.4.0",
    "pnpm add https://github.com/yesvus/helmdeck/releases/download/v0.4.0/yesvus-helmdeck-0.4.0.tgz",
  ].join("\n");

  assert.equal(
    rewriteInstallUrls(readme, "0.4.1"),
    [
      "pnpm add @yesvus/helmdeck@0.4.1",
      "pnpm add https://github.com/yesvus/helmdeck/releases/download/v0.4.1/yesvus-helmdeck-0.4.1.tgz",
    ].join("\n"),
  );
});

test("promotes a registry prerelease to the stable version", () => {
  assert.equal(
    rewriteInstallUrls("pnpm add @yesvus/helmdeck@0.4.0-beta.2", "0.4.0"),
    "pnpm add @yesvus/helmdeck@0.4.0",
  );
});

test("never rewrites the package name, only the version", () => {
  // The name is a property of the registry, not of this release. A rewriter that could change
  // it would be able to turn a correct scoped name into a wrong one with a version bump.
  assert.equal(
    rewriteInstallUrls("pnpm add @someone-else/their-package@1.0.0", "2.0.0"),
    "pnpm add @someone-else/their-package@2.0.0",
  );
});

test("leaves a registry command with no version alone", () => {
  // `pnpm add @scope/name` is a valid instruction meaning "latest". Rewriting it would
  // invent a version, and inventing one is worse than leaving a range unpinned.
  const line = "pnpm add @yesvus/helmdeck";
  assert.equal(rewriteInstallUrls(line, "9.9.9"), line);
});

test("reports a registry install command left at the previous version", () => {
  // This is the whole reason the registry form is version-checked. Without it the documented
  // command silently lags, and a host that follows the README installs a two-release-old
  // build. The gate was originally inline in a function that reads the repository from disk,
  // so the only way to exercise it was to edit the working tree, and the mutation guard for
  // "the check stops verifying this" reported zero failures and proved nothing.
  assert.deepEqual(
    staleRegistryCommands("pnpm add @yesvus/helmdeck@0.4.0", "0.5.0"),
    ["pnpm add @yesvus/helmdeck@0.4.0"],
  );
  assert.deepEqual(
    staleRegistryCommands("pnpm add @yesvus/helmdeck@0.5.0", "0.5.0"),
    [],
  );
});

test("a registry command with no version is never reported as stale", () => {
  // `pnpm add @scope/name` means "latest" and is a legitimate instruction. Reporting it would
  // fail every release on a line that is not wrong, which trains a reader to ignore the gate.
  assert.deepEqual(staleRegistryCommands("pnpm add @yesvus/helmdeck", "9.9.9"), []);
});

test("reports a stale prerelease registry command against the stable it promotes to", () => {
  assert.deepEqual(
    staleRegistryCommands("pnpm add @yesvus/helmdeck@0.4.0-beta.2", "0.4.0"),
    ["pnpm add @yesvus/helmdeck@0.4.0-beta.2"],
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
