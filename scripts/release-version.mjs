#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = resolve(root, "package.json");
const versionPath = resolve(root, "VERSION");
const semverIdentifier = "(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)";
const semverPattern = new RegExp(
  `^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-(${semverIdentifier}(?:\\.${semverIdentifier})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);
const tagPattern = new RegExp(`^v${semverPattern.source.slice(1, -1)}$`);
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

function writeTag(tag) {
  if (!tagPattern.test(tag)) {
    fail(`Invalid release tag: ${tag}`);
  }

  const { packageJson } = readState();
  packageJson.version = tag.slice(1);
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(versionPath, `${tag}\n`);
}

export function main(args = process.argv.slice(2)) {
  const [command, value] = args;

  if (command === "check") {
    readState();
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
