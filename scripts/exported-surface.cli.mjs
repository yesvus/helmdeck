// SPDX-License-Identifier: MIT
/**
 * `node scripts/exported-surface.cli.mjs check` fails on a removed export.
 * `node scripts/exported-surface.cli.mjs record` writes this build as the baseline.
 */
import { readFileSync } from "node:fs";
import { check, exportedNames, indexPath, readLedger, surfacePath, writeLedger } from "./exported-surface.mjs";

const mode = process.argv[2] ?? "check";
const ledgerPath = surfacePath();
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const current = await exportedNames(indexPath());

if (mode === "record") {
  writeLedger(ledgerPath, current);
  console.log(`  recorded ${current.length} exports at ${version}`);
  process.exit(0);
}

const previous = readLedger(ledgerPath);
if (previous.length === 0) {
  writeLedger(ledgerPath, current);
  console.log(`  no ledger yet, recording ${current.length} exports at ${version} as the baseline`);
  process.exit(0);
}

const result = check({ previous, current, version });
const added = current.filter((name) => !previous.includes(name));

console.log(`  exports: ${previous.length} -> ${current.length}`);
if (added.length > 0) console.log(`  added:   ${added.length}`);
if (result.removals.length > 0) console.log(`  REMOVED: ${result.removals.join(", ")}`);
console.log(`  ${result.reason}`);
process.exit(result.fails ? 1 : 0);
