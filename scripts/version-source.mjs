#!/usr/bin/env node
// SPDX-License-Identifier: MIT

/**
 * The one place the version shape is defined, and the one that writes `src/version.ts`.
 *
 * `VERSION` is the canonical file and `scripts/release-version.mjs` keeps package.json and the
 * README beside it, but nothing read it into code: the value existed in three files and in no
 * program. This module closes that, so the constant the package exports is the file's value rather
 * than a copy somebody has to remember to bump.
 *
 * The generated file is committed as well as written by the build. Committing it is what lets a
 * fresh checkout typecheck and test without running a build first, and `check` failing on any
 * disagreement is what stops the committed copy from becoming the source of truth by accident.
 *
 * An unreadable or malformed `VERSION` throws here rather than producing a placeholder. A version
 * readout that says `0.0.0` is worse than none, because it looks like information, so the build
 * stops at the step that can still fix it instead of shipping a confident wrong answer.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const VERSION_PATH = resolve(root, "VERSION");
export const GENERATED_PATH = resolve(root, "src/version.ts");

// The semver tag rule, shared with the release script rather than restated beside it: two patterns
// would mean a version the release tool accepts and this module refuses, or the reverse.
export const semverIdentifier = "(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)";
const semverPattern = new RegExp(
  `^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-(${semverIdentifier}(?:\\.${semverIdentifier})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);
export const VERSION_TAG_PATTERN = new RegExp(`^v${semverPattern.source.slice(1, -1)}$`);

/**
 * The bare version a `VERSION` tag holds, which is the form `package.json` records.
 *
 * Throws rather than returning a default, because every caller here is on a path where a wrong
 * answer reaches a person rather than falling back to something sensible.
 */
export function versionFromTag(tag) {
  const trimmed = typeof tag === "string" ? tag.trim() : "";
  if (!VERSION_TAG_PATTERN.test(trimmed)) {
    throw new Error(`VERSION must be a valid v-prefixed semver tag, or the build cannot name itself: ${JSON.stringify(tag)}`);
  }
  return trimmed.slice(1);
}

/** The `VERSION` file's value, read and checked in one step. */
export function readVersion() {
  let contents;
  try {
    contents = readFileSync(VERSION_PATH, "utf8");
  } catch (cause) {
    throw new Error(
      `VERSION is missing, so the build has no version to report: ${VERSION_PATH} (${cause.message})`,
      { cause },
    );
  }
  return versionFromTag(contents);
}

/**
 * The exact text of the generated file, so `check` compares content rather than re-parsing it.
 *
 * Takes a tag rather than a bare version and validates it here, so no caller can write a file for a
 * version the `VERSION` file would have refused.
 */
export function versionSource(tag) {
  const version = versionFromTag(tag);
  return `// SPDX-License-Identifier: MIT
// Generated from the VERSION file by scripts/version-source.mjs. Do not edit: \`pnpm build\`
// rewrites it and \`pnpm version:check\` fails when it disagrees with VERSION.

/**
 * The version of Helmdeck that was built, exactly as the \`VERSION\` file recorded it when this
 * file was generated.
 *
 * It is a build artefact rather than a value read at runtime, so what a host sees is the version
 * they installed rather than whatever a file next to it happens to say. There is no fallback value:
 * a build whose VERSION file is missing or malformed fails in the generator, so the absence is
 * reported where it can still be fixed instead of being rendered as \`0.0.0\`.
 */
export const HELMDECK_VERSION = "${version}";
`;
}

/** Writes the generated file. Returns true when the file on disk already held this text. */
export function writeVersionSource() {
  const source = versionSource(readFileSync(VERSION_PATH, "utf8"));
  const unchanged = existsSync(GENERATED_PATH) && readFileSync(GENERATED_PATH, "utf8") === source;
  if (!unchanged) writeFileSync(GENERATED_PATH, source);
  return unchanged;
}

export function main() {
  const command = process.argv[2];

  if (command === "check") {
    const source = versionSource(readFileSync(VERSION_PATH, "utf8"));
    if (readFileSync(GENERATED_PATH, "utf8") !== source) {
      throw new Error(
        `src/version.ts does not hold VERSION (${readVersion()}).\nRun: node scripts/version-source.mjs write`,
      );
    }
    return;
  }

  if (command === "write" || command === undefined) {
    process.stdout.write(`src/version.ts ${writeVersionSource() ? "already holds" : "written with"} v${readVersion()}\n`);
    return;
  }

  throw new Error("Usage: version-source.mjs [check|write]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
