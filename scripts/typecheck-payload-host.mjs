// SPDX-License-Identifier: MIT
/**
 * Compiles `examples/payload-host/` the way a host's `tsc` would, after making the package
 * resolvable there.
 *
 * The reference host is the thing a host copies, so nothing here may be the only place it is
 * checked. An example nobody compiles rots silently, and a stale example is worse than none because
 * the person who copies it inherits the rot.
 *
 * Two things are done before the compiler runs, and both are why this is a script rather than a line
 * of shell in `package.json`:
 *
 * - `@yesvus/helmdeck` is linked into `examples/payload-host/node_modules` as the repository root.
 *   The host names the package, never a path into `src/`, and this link is what makes that name
 *   resolve without an install. Every other dependency the host declares is a dependency of the
 *   root package, or a peer of it, and resolves by walking up to the root `node_modules`, which the
 *   root install provides.
 * - The root `dist` is built, because the package resolves its own types through it. A typecheck
 *   against a stale `dist` reports on the previous release.
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = join(root, "examples", "payload-host");
const packageDirectory = join(host, "node_modules", "@yesvus");

/** Where the link points, as a path relative to the directory holding it. */
const linkTarget = relative(packageDirectory, root);

function tsc(args) {
  execFileSync(resolve(root, "node_modules", "typescript", "bin", "tsc"), args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * The link, created or repaired.
 *
 * Repaired rather than assumed, because a worktree or a checkout that has been moved resolves the
 * same relative link somewhere else. An existing link pointing somewhere real is left alone, so
 * running this twice does not rebuild anything.
 */
function linkPackage() {
  mkdirSync(packageDirectory, { recursive: true });
  const existing = join(packageDirectory, "helmdeck");
  if (existsSync(existing) || lstatSync(existing, { throwIfNoEntry: false })) {
    if (lstatSync(existing).isSymbolicLink() && resolve(packageDirectory, readlinkSync(existing)) === root) {
      return;
    }
    rmSync(existing, { recursive: true, force: true });
  }
  symlinkSync(linkTarget, join(packageDirectory, "helmdeck"), "dir");
}

/**
 * Builds the package, links it into the host, and compiles the host.
 *
 * `execFileSync` captures the compiler's output and attaches it to the thrown error, which a person
 * reading a CI log never sees: the log has the script's stack trace and not the line naming the file
 * that failed. Written out here so both callers, the script and the test, report the same way.
 */
export function typecheckPayloadHost() {
  tsc(["-p", "tsconfig.build.json"]);
  linkPackage();
  try {
    tsc(["--noEmit", "-p", join(host, "tsconfig.json")]);
  } catch (cause) {
    const { stdout = "", stderr = "" } = cause;
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    throw cause;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  typecheckPayloadHost();
}
