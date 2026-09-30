// SPDX-License-Identifier: MIT
/**
 * Compile the example host against the working tree, from a checkout that has never installed it.
 *
 * The example is not a workspace member, so `pnpm install` at the repository root does not install
 * anything inside it. Its `node_modules/@yesvus/helmdeck` exists only if somebody ran an install in
 * that directory by hand, and on a clean machine the link is simply absent, so a gate that runs
 * `tsc` there fails on "cannot find module" without having checked a single line of the example.
 *
 * That is what this script exists to stop. It builds `dist` so the package self-resolves, creates
 * the link itself, and then compiles. Every failure it reports is a failure in the example.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const example = join(root, "examples", "independent-host");
const scope = join(example, "node_modules", "@yesvus");
const link = join(scope, "helmdeck");

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: ["ignore", "inherit", "inherit"] });

// The package resolves itself through `dist`, so a stale build makes this check meaningless rather
// than strict. Building it here is the difference between checking the example and checking whatever
// was last built.
run("pnpm", ["build"], root);

if (!existsSync(join(root, "dist", "index.d.ts"))) {
  console.error("  dist/index.d.ts is missing after the build, so the example cannot resolve the package.");
  process.exit(1);
}

mkdirSync(scope, { recursive: true });
rmSync(link, { force: true });
symlinkSync(root, link, "dir");

try {
  run("tsc", ["--noEmit", "-p", "tsconfig.json"], example);
} catch {
  console.error("  The example host does not compile against the working tree.");
  console.error("  Every line above is a failure in examples/independent-host, not in the package.");
  process.exit(1);
}

console.log("  the example host compiles against the working tree");
