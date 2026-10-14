#!/usr/bin/env node
// SPDX-License-Identifier: MIT

/**
 * The one place `.nvmrc` and `@types/node` are read together, and the one that fails when they disagree.
 *
 * `.nvmrc` pins every workflow to a Node version, and `@types/node` describes the Node API surface the
 * compiler allows. They are two hand-maintained declarations of one fact, and nothing connected them: a
 * pull request could raise `@types/node` to a major the gate never runs, and code would type-check against
 * APIs that are then executed for the first time in production. Dependabot proposed exactly that bump
 * here, and the refusal was only ever a reviewer's memory.
 *
 * So the disagreement is a build failure rather than a review comment. Reading the runtime floor from
 * `.nvmrc` and the types from the manifest, this fails if the majors differ, and names both.
 *
 * It deliberately does not compare against the Node running the gate. Running a newer Node than the floor
 * is ordinary and correct; a *types* package newer than the floor is a claim about code the gate has
 * never executed.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The Node major `.nvmrc` pins every workflow to. */
export function nodeFloor(contents) {
  const major = String(contents).trim().match(/^v?(\d+)/);
  if (!major) {
    throw new Error(
      `.nvmrc does not hold a version, so no workflow has a runtime to pin: ${JSON.stringify(String(contents))}`,
    );
  }
  return major[1];
}

/**
 * The Node major the manifest's `@types/node` describes.
 *
 * Takes the raw range rather than the package, so this reads the declaration. The range is what a
 * maintainer edits and what Dependabot rewrites, which is the moment the two can drift.
 */
export function nodeTypesMajor(range) {
  const major = String(range).trim().match(/^[\^~]?(\d+)/);
  if (!major) {
    throw new Error(
      `@types/node is not a major range, so the version it describes cannot be compared to .nvmrc: ${JSON.stringify(String(range))}`,
    );
  }
  return major[1];
}

/** Reads both declarations from disk. */
export function readFloorAndTypes() {
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const range = manifest.devDependencies?.["@types/node"] ?? manifest.dependencies?.["@types/node"];
  if (!range) {
    throw new Error("package.json has no @types/node, so nothing records which Node API this code may use.");
  }
  return {
    floor: nodeFloor(readFileSync(resolve(root, ".nvmrc"), "utf8")),
    types: nodeTypesMajor(range),
    range,
  };
}

/**
 * Throws when the types describe a Node the gate does not run.
 *
 * Returns a line naming both on success, so a passing check still prints the fact it just verified. A
 * check that says nothing is a check nobody trusts after the first surprise.
 */
export function assertFloorMatchesTypes({ floor, types, range }) {
  if (floor === types) {
    return `Node ${floor} pinned by .nvmrc, described by @types/node ${range}`;
  }
  const described = Number(types) > Number(floor) ? "newer than" : "older than";
  throw new Error(
    `.nvmrc pins Node ${floor} and @types/node is ^${types}, which describes a Node ${described} the gate runs.\n` +
      `  Code would type-check against APIs no workflow executes.\n` +
      `  Set both in one commit: .nvmrc to the runtime, and @types/node to ^${floor}.`,
  );
}

export function main() {
  process.stdout.write(`${assertFloorMatchesTypes(readFloorAndTypes())}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}