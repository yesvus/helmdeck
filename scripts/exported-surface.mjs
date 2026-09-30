// SPDX-License-Identifier: MIT

/**
 * The exported surface, recorded, so a release cannot quietly take a name away.
 *
 * A host upgrading finds out about a removed export the way nobody wants to find out: at runtime, in
 * production, on the page that happens to import it. This makes the removal a build failure on this
 * repository instead, which is the only moment anyone can act on it.
 *
 * **The rule is semver, not preference.** A name removed in a minor or a patch is a failure here, and
 * the fix is either to restore it or to cut a major. `0.x` is exempt from semver's own rules, which is
 * exactly why this gate exists for it: at `0.4.0` a consumer has no signal about what a `0.5.0` might
 * take, and the convention that `0.x` allows anything is a convention nobody reads.
 *
 * Additions are recorded but not policed, because adding is what a minor is for.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const LEDGER = "scripts/exported-surface.json";
const INDEX = "dist/index.js";

/** Every name a host can import, from the built root entry. */
export async function exportedNames(indexModule) {
  const module = await import(indexModule);
  return Object.keys(module).sort();
}

function isPreOne(version) {
  return version.startsWith("0.");
}

/**
 * The names this version is not allowed to drop, given the last recorded release.
 *
 * Returns the removals rather than throwing, so the caller decides whether it is a gate or a report.
 */
export function removedNames(previous, current) {
  const present = new Set(current);
  return previous.filter((name) => !present.has(name));
}

export function check({ previous, current, version }) {
  const removals = removedNames(previous, current);

  if (removals.length === 0) {
    return { removals, fails: false, reason: `${current.length} exports, none removed` };
  }

  // `0.x` has no compatibility promise of its own, so the promise here is stricter than semver's.
  const sentence = `${removals.length} export(s) removed: ${removals.join(", ")}`;
  if (isPreOne(version)) {
    return {
      removals,
      fails: true,
      reason:
        `${sentence}. Restore the name, or cut a major: below 1.0 there is no signal to a ` +
        "consumer about what a minor may take, so this repository makes the removal a build " +
        "failure instead.",
    };
  }

  return { removals, fails: true, reason: `${sentence}. Restore the name, or cut a major.` };
}

/** Reads the ledger, or an empty list when there is none yet, which is a first run rather than a failure. */
export function readLedger(path) {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")).exports ?? [];
}

export function writeLedger(path, names) {
  writeFileSync(path, `${JSON.stringify({ exports: names }, null, 2)}\n`);
}

export function surfacePath(root = process.cwd()) {
  return join(root, LEDGER);
}

export function indexPath(root = process.cwd()) {
  return join(root, INDEX);
}
