#!/usr/bin/env node
// SPDX-License-Identifier: MIT

/**
 * Writes a new admin project from `template/`, pinned to the published release tarball.
 *
 * The template is the one thing in this repository that is copied rather than read, and copying it by
 * hand is how a host ends up with a manifest carrying `link:..`, which resolves to a sibling
 * directory that does not exist in their project. This is the step that replaces the copy: it writes
 * the files, rewrites the manifest to the artifact a consumer installs, mints the session secret,
 * and says what is left.
 *
 * It reads its own checkout's `template/`, so the thing it writes is the thing
 * `tests/starter-template.test.ts` checks, at the version `VERSION` names rather than one restated
 * here. Nothing in it touches the network: a command that had to reach GitHub to copy a directory
 * could not finish on a machine that is offline, and the URL written here is the URL the install
 * then uses, which is where a version that was never published is reported.
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readVersion, root, versionFromTag } from "./version-source.mjs";

const TEMPLATE = join(root, "template");
const PACKAGE_NAME = "@yesvus/helmdeck";
const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"];

/** Exit 2, the code a shell reserves for a command line it could not read. */
class UsageError extends Error {}

const USAGE = `Usage: node scripts/create-admin-app.mjs <dir> [options]

Writes a new admin project into <dir> from this repository's starter template, with
${PACKAGE_NAME} pinned to a published release tarball rather than to a path.

  <dir>                     Where to write. Created if absent, refused if it already holds files
                            unless --force.
  --version <tag>           Release to pin, with or without the v. Default: this checkout's VERSION.
  --package-manager <name>  ${PACKAGE_MANAGERS.join(", ")}. Default: pnpm when it is on PATH, else npm.
  --install                 Run that package manager's install in the new directory.
  --force                   Write into a directory that already holds files.
  --help                    This text.

Still yours to do, in <dir>: create the first account, and read the list of what the template
deliberately leaves out before building on it.`;

/**
 * What a checkout of this repository accumulates and a host must not inherit.
 *
 * A generated project that arrived with `node_modules` from a developer's machine carries that
 * machine's platform-specific binaries, and one that arrived with `helmdeck.db` carries rows somebody
 * created. Both are also the files a copied directory is most likely to carry silently, so the
 * skipped names are reported rather than passed over quietly.
 */
const SKIPPED = new Set(["node_modules", ".next", "dist", "coverage", ".vercel", ".git", "next-env.d.ts"]);
const SKIPPED_PATTERNS = [/^\.env(\..*)?$/, /\.db(-journal|-wal|-shm)?$/, /\.tsbuildinfo$/, /^tsconfig\.tsbuildinfo$/];

function isSkipped(name) {
  return SKIPPED.has(name) || SKIPPED_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * The release artifact for a version, derived from this repository's own manifest.
 *
 * Owner, repository and asset naming are read rather than written here, because they are facts the
 * manifest holds and a second copy of them here is a second thing to forget. A repository URL this
 * cannot read is refused rather than guessed at, because a guessed URL installs nothing and says
 * only that a package is missing.
 */
export function releaseTarballUrl(version, manifest) {
  const repository = manifest.repository?.url ?? "";
  const match = /^(?:git\+)?(https:\/\/github\.com\/[^/]+\/[^/]+?)(?:\.git)?$/.exec(repository);
  if (!match) {
    throw new Error(
      `Cannot work out the release tarball URL: package.json has repository.url ` +
        `${JSON.stringify(repository) || "(nothing)"}, and this script reads ` +
        `"https://github.com/<owner>/<repository>" or that with a "git+" prefix and a ".git" suffix.`,
    );
  }
  const asset = `${manifest.name.replace(/^@/, "").replace(/\//g, "-")}-${version}.tgz`;
  return `${match[1]}/releases/download/v${version}/${asset}`;
}

/** The version to pin, from a flag or from this checkout's `VERSION`. */
function pinnedVersion(requested) {
  if (!requested) return readVersion();
  const tag = requested.startsWith("v") ? requested : `v${requested}`;
  try {
    return versionFromTag(tag);
  } catch (cause) {
    throw new Error(
      `--version takes a release tag such as v0.5.1, not ${JSON.stringify(requested)}. ` +
        `Run \`node scripts/create-admin-app.mjs --help\` for the rest.`,
      { cause },
    );
  }
}

/** A package name a manifest can carry, from the directory it is being written into. */
function appName(destination) {
  const cleaned = basename(resolve(destination))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : "helmdeck-admin";
}

function detectPackageManager(requested, onPath) {
  if (requested && !PACKAGE_MANAGERS.includes(requested)) {
    throw new UsageError(
      `--package-manager takes ${PACKAGE_MANAGERS.join(", ")}, not ${JSON.stringify(requested)}.`,
    );
  }
  if (requested) return requested;
  return onPath("pnpm") ? "pnpm" : "npm";
}

/**
 * Whether a command is on PATH, read from the environment rather than by running a shell.
 *
 * `sh -c "command -v pnpm"` answers the same question and needs a shell this project does not
 * otherwise require, so the lookup is over the PATH entries themselves. The suffixes are there
 * because a package manager on Windows is a `.cmd` and a bare name would answer no, which would fall
 * every Windows host back to npm without saying so.
 *
 * Exported for the test that drives the lookup against a PATH it controls, since a detection this
 * project cannot exercise on its own platform is a detection nobody should rely on.
 */
export function onPath(command, { platform = process.platform, path = process.env.PATH } = {}) {
  const windows = platform === "win32";
  const names = windows ? [command, `${command}.cmd`, `${command}.exe`, `${command}.ps1`] : [command];
  return (path ?? "")
    .split(windows ? ";" : ":")
    .some((directory) =>
      names.some((name) => {
        try {
          return statSync(join(directory, name)).isFile();
        } catch {
          return false;
        }
      }),
    );
}

/**
 * The setup section, rewritten to be true of the directory that was just written.
 *
 * The template's own section describes a checkout: a manifest linked to a sibling directory, and a
 * secret the person mints themselves. Both are wrong here, and a README that is wrong about how to
 * start the project it sits in costs more than the two lines it would save. Everything below the
 * section is left alone, because that is the part a host reads before building on the project.
 */
function setupSection({ version, url, name, packageManager, secretPath }) {
  const install = packageManager === "npm" ? "npm install" : `${packageManager} install`;
  return `## Getting started

Written by \`scripts/create-admin-app.mjs\` from the Helmdeck starter, version **${version}**, with
\`${PACKAGE_NAME}\` pinned to the published release tarball:

\`\`\`
${url}
\`\`\`

The manifest is named \`${name}\`, and a fresh \`HELMDECK_SESSION_SECRET\` is in \`${secretPath}\`, which
\`.gitignore\` already ignores. Every instance that has to agree on a session needs the same value, so
carry that one into your environment rather than minting a second.

\`\`\`sh
${install}
node scripts/create-user.mjs you@example.com admin
${packageManager} run dev
\`\`\`

\`create-user.mjs\` asks for the password and does not echo it. The second argument is a role, and
the roles are the keys of \`ROLE_OPERATIONS\` in \`lib/rules.ts\`. Then open
<http://localhost:3000>, which redirects to \`/admin\` and then to the sign-in page.

The database is \`./helmdeck.db\`, created on the first query, so there is nothing to migrate and
nothing to configure. Read [What you still have to add](#what-you-still-have-to-add) before building
on this, and [The one rule](#the-one-rule) before adding a check anywhere.

To move to a later release, replace the URL above with that release's tarball and refresh the
lockfile.

`;
}

const SETUP_HEADING = /^## Setup$/m;

function rewriteReadme(contents, generated, readmePath) {
  const heading = SETUP_HEADING.exec(contents);
  if (!heading) {
    throw new Error(
      `The copied README has no \`## Setup\` section to replace, so it would describe a checkout ` +
        `rather than the project this command just wrote.\nLooked in: ${readmePath} and ` +
        `${join(TEMPLATE, "README.md")}, which is the file it was copied from.\nEither restore the ` +
        `heading there or change setupSection() in ${fileURLToPath(import.meta.url)}.`,
    );
  }
  const body = contents.slice(heading.index + heading[0].length);
  const next = /^## /m.exec(body);
  const end = next ? heading.index + heading[0].length + next.index : contents.length;
  return contents.slice(0, heading.index) + generated + contents.slice(end);
}

/** A copy of the template, with the three files a generated project needs differently. */
function copyTemplate(source, destination) {
  const files = [];
  const skipped = [];

  const walk = (from, to) => {
    for (const entry of readdirSync(from, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (isSkipped(entry.name)) {
        skipped.push(relative(source, join(from, entry.name)));
        continue;
      }
      if (entry.isDirectory()) {
        mkdirSync(join(to, entry.name), { recursive: true });
        walk(join(from, entry.name), join(to, entry.name));
        continue;
      }
      copyFileSync(join(from, entry.name), join(to, entry.name));
      files.push(relative(destination, join(to, entry.name)).split("\\").join("/"));
    }
  };

  mkdirSync(destination, { recursive: true });
  walk(source, destination);
  return { files, skipped };
}

function readManifest(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`Cannot read a JSON manifest at ${path}: ${cause.message}`, { cause });
  }
}

/**
 * Writes a project, and reports what it did.
 *
 * Exported so a test can drive it over a fixture tree, which is the only way to check the skipping
 * without a developer's `node_modules` and a `helmdeck.db` in the way.
 *
 * @param {{
 *   destination?: string,
 *   version?: string,
 *   packageManager?: string,
 *   install?: boolean,
 *   force?: boolean,
 *   source?: string,
 *   packageRoot?: string,
 *   run?: (file: string, args: string[], options: { cwd?: string, stdio?: string }) => unknown,
 *   onPath?: (command: string) => boolean,
 * }} [options]
 */
export function createAdminApp({
  destination,
  version: requestedVersion,
  packageManager: requestedPackageManager,
  install = false,
  force = false,
  source = TEMPLATE,
  packageRoot = root,
  run = execFileSync,
  onPath: detect = onPath,
} = {}) {
  if (!destination) throw new UsageError("No directory given.\n\n" + USAGE);

  const target = resolve(destination);
  const sourcePath = resolve(source);

  // The template is checked before the destination, because "there is nothing to copy from" is the
  // answer a person cannot act on by choosing a different directory, and it is the one that means
  // this was not run from a checkout.
  if (!existsSync(sourcePath)) {
    throw new Error(
      `There is no starter template at ${sourcePath}.\nLooked for: ${join(sourcePath, "package.json")} ` +
        `and ${join(sourcePath, "README.md")}.\nThis command copies the template out of a checkout of ` +
        `this repository, so run it from one, or pass a directory to copy.`,
    );
  }

  // `sep`, and not a literal "/": on Windows `resolve` answers with backslashes, so a forward-slash
  // prefix answers false and the copy walks into the directory it is writing.
  if (target === sourcePath || target.startsWith(sourcePath + sep)) {
    throw new Error(
      `${target} is inside the template being copied, so the copy would read its own output. ` +
        `Give a directory outside ${sourcePath}.`,
    );
  }

  const existing = existsSync(target) ? readdirSync(target) : [];
  if (existing.length > 0 && !force) {
    throw new Error(
      `${target} already holds ${existing.length} entr${existing.length === 1 ? "y" : "ies"}: ` +
        `${existing.slice(0, 5).map((entry) => `\n  ${entry}`).join("")}` +
        `${existing.length > 5 ? `\n  ... and ${existing.length - 5} more` : ""}\n` +
        `Nothing was written. Choose another directory, empty this one, or pass --force to write ` +
        `over it.`,
    );
  }

  const version = pinnedVersion(requestedVersion);
  const manifest = readManifest(join(packageRoot, "package.json"));
  const url = releaseTarballUrl(version, manifest);
  const packageManager = detectPackageManager(requestedPackageManager, detect);
  const name = appName(target);
  const { files, skipped } = copyTemplate(sourcePath, target);

  const appManifestPath = join(target, "package.json");
  const appManifest = readManifest(appManifestPath);
  appManifest.name = name;
  appManifest.dependencies ??= {};
  appManifest.dependencies[PACKAGE_NAME] = url;
  if (packageManager === "pnpm" && manifest.packageManager) appManifest.packageManager = manifest.packageManager;
  writeFileSync(appManifestPath, `${JSON.stringify(appManifest, null, 2)}\n`);

  const secretPath = ".env.local";
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(
    join(target, secretPath),
    `# Minted by scripts/create-admin-app.mjs for ${name}. Every instance that has to agree on a\n` +
      `# session needs this same value; mint a new one to invalidate every session at once.\n` +
      `HELMDECK_SESSION_SECRET=${secret}\n`,
  );

  const readmePath = join(target, "README.md");
  writeFileSync(
    readmePath,
    rewriteReadme(
      readFileSync(readmePath, "utf8"),
      setupSection({ version, url, name, packageManager, secretPath }),
      readmePath,
    ),
  );

  const report = { destination: target, name, version, url, packageManager, files, skipped, secretPath };
  if (install) {
    // `shell` on Windows, where a package manager is a `.cmd` batch file rather than an executable,
    // so `CreateProcessW` alone answers ENOENT for a command that is installed and working.
    run(packageManager, ["install"], {
      cwd: target,
      stdio: "inherit",
      ...(process.platform === "win32" ? { shell: true } : {}),
    });
    report.installed = true;
  }
  return report;
}

function report(result) {
  const lines = [
    `Wrote ${result.files.length} files to ${result.destination}`,
    `  name:                ${result.name}`,
    `  ${PACKAGE_NAME}: ${result.url}`,
    `  session secret:      ${join(result.destination, result.secretPath)}`,
  ];
  if (result.skipped.length > 0) {
    lines.push(`  skipped:             ${result.skipped.join(", ")}`);
  }
  if (result.installed) {
    lines.push(`  installed with:      ${result.packageManager}`);
  }
  lines.push(
    "",
    "Still to do, in that directory:",
    `  node scripts/create-user.mjs you@example.com admin`,
    `  ${result.packageManager} run dev`,
    "",
    "And read What you still have to add in its README before building on it.",
  );
  return `${lines.join("\n")}\n`;
}

function parse(argv) {
  const options = { destination: undefined, force: false, install: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--force") {
      options.force = true;
      continue;
    }
    if (argument === "--install") {
      options.install = true;
      continue;
    }
    if (argument === "--version" || argument === "--package-manager") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`${argument} needs a value.\n\n${USAGE}`);
      }
      options[argument === "--version" ? "version" : "packageManager"] = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) {
      throw new UsageError(
        `No such option: ${argument}. This command takes --version, --package-manager, --install, ` +
          `--force and --help.\n\n${USAGE}`,
      );
    }
    if (options.destination !== undefined) {
      throw new UsageError(
        `Two directories given: ${options.destination} and ${argument}. One is enough.\n\n${USAGE}`,
      );
    }
    options.destination = argument;
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parse(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${USAGE}\n`);
    } else {
      process.stdout.write(report(createAdminApp(options)));
    }
  } catch (error) {
    // A failure a person has to act on is a message naming the paths involved, not a stack trace:
    // the same discipline the migrations directory uses, where a missing file that lists what it
    // looked for is a five-second fix and a stack trace is a search.
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
