#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { VERSION_TAG_PATTERN as tagPattern, GENERATED_PATH, versionSource } from "./version-source.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = resolve(root, "package.json");
const versionPath = resolve(root, "VERSION");
const readmePath = resolve(root, "README.md");
const changelogPath = resolve(root, "CHANGELOG.md");
const UNRELEASED_HEADING = /^## Unreleased$/m;
// Anchored on the documented install command so an unrelated release link elsewhere in the
// README is never rewritten. The capture keeps owner, repository, and asset naming owned by
// the README, so only the version moves.
const installUrlPattern = /(pnpm add https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/releases\/download\/v[^/\s]+\/[^/\s]+\.tgz)/g;
// Splits a release asset into its stable prefix and its trailing version, so the prefix
// stays owned by the README while the version is replaced.
const assetPattern = /\/([^/\s]+)-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)\.tgz$/;
const bumpTypes = new Set(["alpha", "beta", "stable", "patch", "minor", "major"]);

function fail(message) {
  throw new Error(message);
}

function parseTag(tag) {
  const match = tagPattern.exec(tag);
  if (!match) {
    fail(`Invalid version tag: ${tag}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
  };
}

function readState() {
  const tag = readFileSync(versionPath, "utf8").trim();
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

  if (!tagPattern.test(tag)) {
    fail(`VERSION must be a valid v-prefixed semver tag: ${tag}`);
  }

  const version = tag.slice(1);
  if (packageJson.version !== version) {
    fail(`Version drift: VERSION is ${version}, package.json is ${packageJson.version}`);
  }

  return { tag, version, packageJson };
}

// Separate from readState so that a bump can repair the install command. Enforcing the
// README here would make drift unrecoverable, because the repair path runs this same gate.
function assertReadmeInSync(version) {
  const readme = readFileSync(readmePath, "utf8");
  const commands = installCommands(readme);

  if (commands.length === 0) {
    fail("README has no `pnpm add` install command to verify");
  }

  for (const command of commands) {
    if (versionInUrl(command) !== version || !command.endsWith(`-${version}.tgz`)) {
      fail(`README install command does not point at v${version} in both the tag and the artifact name.\n`
        + `Found: ${command}\nRun: pnpm version:bump <type>`);
    }
  }
}

function installCommands(readme) {
  return [...readme.matchAll(installUrlPattern)].map((match) => match[1]);
}

/**
 * The constant the package exports is the file's value, so the file holding it is gated here too.
 * `writeTag` below writes it in the same commit as VERSION, which makes drift a mistake rather
 * than a state, and this is what catches a VERSION edited by hand.
 */
function assertGeneratedSourceInSync(tag) {
  if (readFileSync(GENERATED_PATH, "utf8") !== versionSource(tag)) {
    fail(`src/version.ts does not hold VERSION (${tag}).\nRun: node scripts/version-source.mjs write`);
  }
}

// Keeps the owner, repository, and asset naming already in the README and moves only the
// version. The tag and the artifact filename are rewritten independently, because a
// half-updated URL points at a release asset that does not exist.
export function rewriteInstallUrls(readme, version) {
  return readme.replace(installUrlPattern, (match, command) => {
    const current = versionInUrl(command);
    const rewritten = current
      ? command.replace(/\/download\/v[^/]+\//, `/download/v${version}/`).replace(assetPattern, `/$1-${version}.tgz`)
      : command;

    return match.replace(command, rewritten);
  });
}

function versionInUrl(url) {
  return /\/download\/v([^/]+)\//.exec(url)?.[1] ?? "";
}

function formatTag({ major, minor, patch, prerelease }) {
  const base = `v${major}.${minor}.${patch}`;
  return prerelease ? `${base}-${prerelease}` : base;
}

function getPrereleaseNumber(prerelease, expected) {
  if (!prerelease) {
    return null;
  }

  const match = prerelease.match(new RegExp(`^${expected}\\.(\\d+)$`));
  return match ? Number(match[1]) : null;
}

export function nextTag(currentTag, bump) {
  if (!bumpTypes.has(bump)) {
    fail(`Unknown bump type: ${bump}`);
  }

  const current = parseTag(currentTag);
  const base = {
    major: current.major,
    minor: current.minor,
    patch: current.patch,
  };

  if (bump === "alpha") {
    const currentAlpha = getPrereleaseNumber(current.prerelease, "alpha");
    if (currentAlpha !== null) {
      return formatTag({ ...base, prerelease: `alpha.${currentAlpha + 1}` });
    }
    return formatTag({
      ...base,
      patch: current.patch + 1,
      prerelease: "alpha.1",
    });
  }

  if (bump === "beta") {
    const currentBeta = getPrereleaseNumber(current.prerelease, "beta");
    if (currentBeta !== null) {
      return formatTag({ ...base, prerelease: `beta.${currentBeta + 1}` });
    }
    if (getPrereleaseNumber(current.prerelease, "alpha") !== null) {
      return formatTag({ ...base, prerelease: "beta.1" });
    }
    return formatTag({
      ...base,
      patch: current.patch + 1,
      prerelease: "beta.1",
    });
  }

  if (bump === "stable") {
    if (!current.prerelease) {
      fail(`Version ${currentTag} is already stable`);
    }
    return formatTag(base);
  }

  if (bump === "patch") {
    return formatTag({
      major: current.major,
      minor: current.minor,
      patch: current.prerelease ? current.patch : current.patch + 1,
    });
  }

  if (bump === "minor") {
    return formatTag({
      major: current.major,
      minor: current.minor + 1,
      patch: 0,
    });
  }

  return formatTag({
    major: current.major + 1,
    minor: 0,
    patch: 0,
  });
}

// Stamps the pending section with the version being cut, so the changelog can never announce a
// release the rest of the repository does not agree has happened. The section is authored as
// "Unreleased" and renamed here, in the same commit as VERSION and package.json.
export function rewriteChangelogHeading(content, version) {
  if (!UNRELEASED_HEADING.test(content)) {
    fail("CHANGELOG.md has no '## Unreleased' section to stamp");
  }
  return content.replace(UNRELEASED_HEADING, `## ${version}`);
}

function writeTag(tag) {
  if (!tagPattern.test(tag)) {
    fail(`Invalid release tag: ${tag}`);
  }

  const { packageJson } = readState();
  const version = tag.slice(1);
  packageJson.version = version;
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(versionPath, `${tag}\n`);
  writeFileSync(readmePath, rewriteInstallUrls(readFileSync(readmePath, "utf8"), version));
  writeFileSync(changelogPath, rewriteChangelogHeading(readFileSync(changelogPath, "utf8"), version));
  // Last, and in the same call, so a release cannot move VERSION without moving the constant the
  // package exports. A half-completed bump is the drift this gate exists to catch.
  writeFileSync(GENERATED_PATH, versionSource(tag));
}

export function main(args = process.argv.slice(2)) {
  const [command, value] = args;

  if (command === "check") {
    const { tag, version } = readState();
    assertReadmeInSync(version);
    assertGeneratedSourceInSync(tag);
    return;
  }

  if (command === "next") {
    if (!value) {
      fail("Usage: release-version.mjs next <alpha|beta|stable|patch|minor|major>");
    }
    process.stdout.write(`${nextTag(readState().tag, value)}\n`);
    return;
  }

  if (command === "write") {
    if (!value) {
      fail("Usage: release-version.mjs write <version>");
    }
    writeTag(value);
    return;
  }

  if (command === "bump") {
    if (!value) {
      fail("Usage: release-version.mjs bump <alpha|beta|stable|patch|minor|major>");
    }
    writeTag(nextTag(readState().tag, value));
    return;
  }

  fail("Usage: release-version.mjs <check|next|write|bump> [value]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
