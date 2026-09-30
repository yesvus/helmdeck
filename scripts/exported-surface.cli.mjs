// SPDX-License-Identifier: MIT
/**
 * `node scripts/exported-surface.cli.mjs check` fails on a removed export.
 * `node scripts/exported-surface.cli.mjs record` writes this build as the baseline.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check, exportedNames, indexPath, readLedger, readLedgerVersion, repoRoot, surfacePath, writeLedger } from "./exported-surface.mjs";

const mode = process.argv[2] ?? "check";
// Resolved from this file, not from the working directory, so the command means the same thing
// wherever it is run from. The release path shells out to it and cannot guarantee the caller's cwd.
const root = repoRoot();
const ledgerPath = surfacePath(root);
const packageVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
// The release being cut, which is not necessarily the version currently in package.json: `write` and
// `bump` move the version after recording, and the ledger has to name what it guards rather than what
// it was measured against.
const version = process.argv[3] ?? packageVersion;
const current = await exportedNames(indexPath(root));

if (mode === "record") {
  writeLedger(ledgerPath, current, version);
  console.log(`  recorded ${current.length} exports at ${version}`);
  process.exit(0);
}

const previous = readLedger(ledgerPath);
if (previous.length === 0) {
  writeLedger(ledgerPath, current, version);
  console.log(`  no ledger yet, recording ${current.length} exports at ${version} as the baseline`);
  process.exit(0);
}

const result = check({ previous, current, version });
const added = current.filter((name) => !previous.includes(name));

// The baseline names the release it was taken at, so a ledger nobody remembers recording is visibly
// older than the build it is being compared against rather than silently authoritative.
console.log(`  baseline: ${readLedgerVersion(ledgerPath) ?? "unrecorded"} (${previous.length} exports)`);
console.log(`  exports: ${previous.length} -> ${current.length}`);
if (added.length > 0) console.log(`  added:   ${added.length}`);
if (result.removals.length > 0) console.log(`  REMOVED: ${result.removals.join(", ")}`);
console.log(`  ${result.reason}`);
process.exit(result.fails ? 1 : 0);
