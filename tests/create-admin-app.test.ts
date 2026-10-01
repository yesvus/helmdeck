// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { createAdminApp, releaseTarballUrl } from "../scripts/create-admin-app.mjs";
import { readVersion } from "../scripts/version-source.mjs";

/**
 * The one command a host runs to get the starter, and the properties that make what it writes the
 * thing this repository ships and tests.
 *
 * `tests/starter-template.test.ts` proves the template compiles, decides permission in one file and
 * ships no credential. It runs against `template/`, so it cannot say anything about the directory a
 * host receives, and a command that copies a directory can differ from it in four ways that all
 * matter and none of which the template's own test would notice: a file left behind, a manifest
 * still pointing at a sibling directory, a secret nobody minted, and a README describing a checkout
 * rather than the project it sits in. Those four are what this file checks.
 */

const root = resolve(import.meta.dirname, "..");
const template = join(root, "template");
const script = join(root, "scripts", "create-admin-app.mjs");
const version = readVersion();
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const url = releaseTarballUrl(version, manifest);

/**
 * What a checkout accumulates and a generated project must not receive. Mirrors the script's own
 * list, matched against both a path the walk reported and a path inside a file listing, because the
 * script names a skipped directory by its own path and a skipped file by its path under the copy.
 */
const SKIPPED_NAMES = ["node_modules", ".next", "dist", "coverage", ".vercel", ".git"];
const SKIPPED_ARTEFACTS = new RegExp(
  `(^|/)(${SKIPPED_NAMES.join("|")})(/|$)` +
    `|(^|/)(next-env\\.d\\.ts|\\.env(\\..*)?|[^/]*\\.db(-journal|-wal|-shm)?|tsconfig\\.tsbuildinfo)$`,
);

function workspace(): string {
  return mkdtempSync(join(tmpdir(), "helmdeck-create-"));
}

/** Runs the command as a host runs it, so the exit code and the message are the ones a person sees. */
function run(args: string[], cwd = root) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status: number | null; stdout: string; stderr: string };
    return { code: failure.status ?? 1, stdout: failure.stdout, stderr: failure.stderr };
  }
}

function filesIn(directory: string): string[] {
  const found: string[] = [];
  const walk = (from: string) => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const path = join(from, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(relative(directory, path).split("\\").join("/"));
    }
  };
  walk(directory);
  return found.sort();
}

function readApp(directory: string, path: string): string {
  return readFileSync(join(directory, path), "utf8");
}

describe("one command writes a project a host can install", () => {
  it("writes every file the template holds, and none of what a checkout accumulated", () => {
    const directory = workspace();
    try {
      // Copied rather than dirtied in place, because `template/` is read concurrently by
      // `starter-template.test.ts` and a test that creates a `node_modules` inside it to prove a
      // skip is a test that breaks its neighbour.
      const source = join(directory, "checkout", "template");
      mkdirSync(join(directory, "checkout"), { recursive: true });
      cpSync(template, source, { recursive: true });

      // A developer's installed packages, a database with somebody's rows in it, and the two
      // generated files an editor leaves behind. A project carrying any of them is a project a host
      // has to clean before they can trust it.
      mkdirSync(join(source, "node_modules", "@yesvus"), { recursive: true });
      writeFileSync(join(source, "node_modules", "@yesvus", "stale"), "a link the checkout made");
      writeFileSync(join(source, "helmdeck.db"), "rows somebody created");
      writeFileSync(join(source, "next-env.d.ts"), "// generated\n");
      writeFileSync(join(source, ".env.local"), "HELMDECK_SESSION_SECRET=someone-elses-value");
      mkdirSync(join(source, ".next"), { recursive: true });
      writeFileSync(join(source, ".next", "build"), "compiled output");

      const destination = join(directory, "my-admin");
      const result = createAdminApp({ destination, source });

      expect(result.files).toContain("lib/rules.ts");
      expect(result.files).toContain("app/admin/products/page.tsx");
      expect(result.files).toContain("scripts/create-user.mjs");
      expect(result.files).toContain(".gitignore");

      // Every file the source holds is in the copy, so a file added to the template and missed here
      // is a file the next host does not receive. Compared as lists rather than counted, so a copy
      // that dropped one file and duplicated another cannot balance out.
      const kept = filesIn(source).filter((path) => !SKIPPED_ARTEFACTS.test(path));
      expect(filesIn(destination).filter((path) => path !== ".env.local")).toEqual(kept);

      // And none of the checkout's artefacts came along, named rather than counted.
      for (const artefact of ["node_modules", ".next", "helmdeck.db", "next-env.d.ts"]) {
        expect(existsSync(join(destination, artefact)), `${artefact} reached the generated project`).toBe(false);
      }
      // The secret is the one `.env.local` the command wrote, so the checkout's did not survive.
      expect(readApp(destination, ".env.local")).not.toContain("someone-elses-value");

      // Reported rather than passed over quietly, so a host who expected a file knows it was
      // dropped and why. Every planted artefact is named, and nothing outside the skip list is
      // named, because the copy is of the real template and whatever that checkout happens to be
      // holding is in the source too.
      const skipped = [...result.skipped].sort();
      for (const planted of [".env.local", ".next", "helmdeck.db", "next-env.d.ts", "node_modules"]) {
        expect(skipped, planted).toContain(planted);
      }
      expect(skipped.filter((path) => !SKIPPED_ARTEFACTS.test(path)), "skipped, but not a skip-list name").toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it("pins the published release tarball, which is the whole point of running a command", () => {
    const directory = workspace();
    try {
      // A manifest carrying `link:..` is the defect this command exists to remove: it resolves in
      // this repository and in nothing else, so a host who installed it got a project that builds
      // here and nowhere.
      const destination = join(directory, "my-admin");
      createAdminApp({ destination });
      const app = JSON.parse(readApp(destination, "package.json"));
      expect(app.dependencies["@yesvus/helmdeck"]).toBe(url);
      expect(app.dependencies["@yesvus/helmdeck"]).not.toMatch(/^(link|file):/);
      expect(readApp(destination, "package.json")).not.toContain("link:");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("pins the URL the README tells a consumer to install, so the two cannot drift apart", () => {
    // The URL is derived from `VERSION` and this repository's own manifest rather than written out
    // twice, and `release-version.mjs check` already keeps `VERSION` and the documented install
    // command in step. So the two cannot disagree, and this asserts the link rather than the
    // derivation.
    const documented = readFileSync(join(root, "README.md"), "utf8").match(
      /pnpm add (https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/releases\/download\/v[^/\s]+\/[^/\s]+\.tgz)/,
    )?.[1];
    expect(documented, "the README's install command").toBe(url);
    expect(url).toBe(`https://github.com/yesvus/helmdeck/releases/download/v${version}/yesvus-helmdeck-${version}.tgz`);
  });

  it("mints a session secret into a file the generated .gitignore already ignores", () => {
    // Without it the app refuses to load and the refusal is a wall of prose, so this is the one
    // manual step the command removes. A secret that were committed would be a secret in a
    // repository, which is why it lands in `.env.local` rather than in the manifest.
    const first = workspace();
    const second = workspace();
    try {
      const one = join(first, "my-admin");
      const two = join(second, "my-admin");
      createAdminApp({ destination: one });
      createAdminApp({ destination: two });

      const secret = readApp(one, ".env.local").match(/^HELMDECK_SESSION_SECRET=(.+)$/m)?.[1];
      expect(secret, "a secret in .env.local").toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(readApp(one, ".env.local")).not.toMatch(/postgres|mysql|libsql|:\/\//);

      // Two projects from the same command do not share a secret, or rotating one would end every
      // session in the other.
      expect(readApp(two, ".env.local")).not.toContain(secret ?? "");

      // And the file is ignored, checked against the .gitignore the command copied rather than a
      // line written here, since that file is the one the host gets.
      const ignored = readApp(one, ".gitignore").split("\n").map((line) => line.trim());
      expect(ignored).toContain(".env");
      expect(ignored.some((line) => line === ".env.*" || line === ".env*")).toBe(true);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });

  it("leaves a README that describes the project it sits in, and keeps the list of omissions", () => {
    const directory = workspace();
    try {
      const destination = join(directory, "my-admin");
      const result = createAdminApp({ destination });
      const readme = readApp(destination, "README.md");

      // The checkout's own setup section tells a reader to change `link:..` and to mint their own
      // secret, both of which are false here and both of which are the first two things a host
      // would try.
      expect(readme).not.toContain("link:..");
      expect(readme).not.toContain("## Setup");
      expect(readme).toContain("## Getting started");
      expect(readme).toContain(url);
      expect(readme).toContain(`version **${result.version}**`);

      // The part a host reads before building anything is not the part this command rewrites, and
      // `tests/starter-template.test.ts` checks the omission list against the code, so a list that
      // lost an item here would leave that test asserting against a list nobody reads.
      const omissions = [...readme.matchAll(/^\d+\. \*\*([^*]+)\*\*/gm)].map((match) => match[1]);
      expect(omissions).toEqual(
        [...readFileSync(join(template, "README.md"), "utf8").matchAll(/^\d+\. \*\*([^*]+)\*\*/gm)].map(
          (match) => match[1],
        ),
      );
      expect(omissions.length).toBeGreaterThan(5);

      // And the rest of the document survives, so the section it replaced is a section rather than
      // everything from there to the end.
      for (const heading of ["## What is where", "## The one rule", "## What you still have to add"]) {
        expect(readme, heading).toContain(heading);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it("names the directory a host asked for, because the command takes a path", () => {
    const directory = workspace();
    try {
      const destination = join(directory, "Fulfilment Console");
      createAdminApp({ destination });
      // A directory name is not always a manifest name, and a name `npm install` refuses is a
      // failure a host meets after the command reported success.
      const app = JSON.parse(readApp(destination, "package.json"));
      expect(app.name).toBe("fulfilment-console");
      expect(app.name).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("the command says where it got to, because a wall of prose is not a message", () => {
  it("reports the destination, the version and what is left, on one run", () => {
    const directory = workspace();
    try {
      const result = run([join(directory, "my-admin")]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(join(directory, "my-admin"));
      expect(result.stdout).toContain(url);
      // The two commands a host still runs, so the report is the next step rather than a summary.
      expect(result.stdout).toContain("create-user.mjs");
      expect(result.stdout).toContain("run dev");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it("refuses a directory that already holds files, naming what it found", () => {
    // Writing over a directory that holds a project is not recoverable from the message alone: the
    // names are what tells a person whether they pointed at the wrong path or meant to.
    const directory = workspace();
    try {
      mkdirSync(join(directory, "my-admin", "app"), { recursive: true });
      writeFileSync(join(directory, "my-admin", "app", "page.tsx"), "a project somebody started");
      const result = run([join(directory, "my-admin")]);
      expect(result.code).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(join(directory, "my-admin"));
      expect(result.stderr).toContain("app");
      expect(result.stderr).toContain("--force");
      // Nothing was written, so the refusal is not also a partial copy.
      expect(readdirSync(join(directory, "my-admin"))).toEqual(["app"]);

      // And --force is the documented way through, so a host who means to overwrite is not stuck.
      const forced = run([join(directory, "my-admin"), "--force"]);
      expect(forced.code).toBe(0);
      expect(existsSync(join(directory, "my-admin", "app", "page.tsx")), "the file that was there").toBe(true);
      expect(existsSync(join(directory, "my-admin", "lib", "rules.ts")), "the template's own file").toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it("refuses a command line it cannot read, and prints the usage that would have worked", () => {
    const refused: Array<[string, string[]]> = [
      ["no directory", []],
      ["a flag it does not have", ["--tailwind", join("/tmp", "x")]],
      ["a flag with no value", ["--version"]],
      ["two directories", ["/tmp/one", "/tmp/two"]],
    ];

    for (const [what, args] of refused) {
      const result = run(args);
      expect(result.code, `${what}: ${result.stderr}`).toBe(2);
      expect(result.stderr, what).toContain("Usage: node scripts/create-admin-app.mjs");
    }
  }, 120_000);

  it("refuses a version that is not a release tag, rather than pinning something that cannot exist", () => {
    const directory = workspace();
    try {
      // A URL built from `latest` or from a branch is exactly what the README tells a host not to
      // install, so a version this cannot turn into a tag has to be refused rather than guessed at.
      for (const requested of ["latest", "0.4", "v0.5.1-"]) {
        const result = run([join(directory, "app"), "--version", requested]);
        expect(result.code, requested).toBe(1);
        expect(result.stderr, requested).toContain("--version takes a release tag");
      }
      expect(existsSync(join(directory, "app")), "a refused run wrote anyway").toBe(false);

      // And the one it accepts, with and without the v, because both are what a person types.
      for (const requested of ["v0.4.0", "0.4.0"]) {
        const destination = join(directory, `app-${requested.replace(/\W/g, "")}`);
        const result = run([destination, "--version", requested]);
        expect(result.code, requested).toBe(0);
        expect(JSON.parse(readApp(destination, "package.json")).dependencies["@yesvus/helmdeck"]).toBe(
          releaseTarballUrl("0.4.0", manifest),
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it("refuses to write into the template it is copying, which would read its own output", () => {
    const result = run([join(template, "generated")]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("inside the template");
    expect(existsSync(join(template, "generated"))).toBe(false);
  });

  it("names every path it looked for when the template is not there", () => {
    // The discipline the migrations directory already uses: a missing file that says where it looked
    // is a five-second fix, and a message that does not is a search. Driven through the exported
    // function so the message is the one the command prints, not a shape it prints for a test.
    const directory = workspace();
    try {
      const source = join(directory, "not-a-checkout", "template");
      let thrown: Error | undefined;
      try {
        createAdminApp({ destination: join(directory, "app"), source });
      } catch (error) {
        thrown = error as Error;
      }
      expect(thrown, "a missing template produced a project anyway").toBeDefined();
      expect(thrown?.message).toContain(source);
      expect(thrown?.message).toContain(join(source, "package.json"));
      expect(thrown?.message).toContain(join(source, "README.md"));
      expect(existsSync(join(directory, "app"))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses a repository URL it cannot derive an artifact name from, instead of guessing", () => {
    // A guessed URL installs nothing and reports only that a package is missing, so the shape of the
    // manifest is checked rather than assumed.
    expect(() => releaseTarballUrl("0.5.1", { ...manifest, repository: { url: "git@github.com:o/r.git" } })).toThrow(
      /Cannot work out the release tarball URL/,
    );
    expect(() => releaseTarballUrl("0.5.1", { ...manifest, repository: undefined })).toThrow(
      /Cannot work out the release tarball URL/,
    );
    // The forms that are read: bare https, `git+` prefixed, and with the `.git` suffix, because the
    // manifest in this repository is written by hand and could reasonably be any of the three.
    for (const url of [
      "https://github.com/yesvus/helmdeck",
      "git+https://github.com/yesvus/helmdeck.git",
    ]) {
      expect(releaseTarballUrl("0.5.1", { ...manifest, repository: { url } })).toBe(
        "https://github.com/yesvus/helmdeck/releases/download/v0.5.1/yesvus-helmdeck-0.5.1.tgz",
      );
    }
  });
});

describe("what a host is told about running it", () => {
  it("prints a usage that names every option the command accepts", () => {
    const result = run(["--help"]);
    expect(result.code).toBe(0);
    for (const option of ["--version", "--package-manager", "--install", "--force", "--help"]) {
      expect(result.stdout, option).toContain(option);
    }
    expect(result.stdout).toContain("read the list of what the template");
  });

  it("reaches no network, so a machine without one can still get a directory", () => {
    // The command's only claim to being one step is that it needs nothing a host may not have. A
    // fetch here would mean a copy that fails offline, which is the one situation where a person
    // cannot work around it.
    const source = readFileSync(script, "utf8");
    expect(source).not.toMatch(/\bfetch\(|node:https?|node:dns|https\.request/);
  });
});

describe("the tree a generated project is compiled from", () => {
  it("has no import that leaves the project, which is what makes it copyable", () => {
    // The template's own test proves this about `template/`. This asserts it about the directory a
    // host receives, because that is the copy a person inherits, and a rewritten manifest is exactly
    // the place a path into the source repository would creep back in.
    const directory = workspace();
    try {
      const destination = join(directory, "my-admin");
      createAdminApp({ destination });

      const offenders: string[] = [];
      const walk = (from: string) => {
        for (const entry of readdirSync(from, { withFileTypes: true })) {
          const path = join(from, entry.name);
          if (entry.isDirectory()) {
            walk(path);
            continue;
          }
          if (!/\.(ts|tsx|mjs)$/.test(entry.name)) continue;
          const relativePath = relative(destination, path);
          const contents = readFileSync(path, "utf8");
          for (const match of contents.matchAll(/\bfrom\s*["']([^"']+)["']/g)) {
            const specifier = match[1];
            if (specifier.startsWith(".") && !specifier.startsWith("@/")) {
              const resolved = resolve(from, specifier);
              if (resolved !== destination && !resolved.startsWith(destination + sep)) {
                offenders.push(`${relativePath}: ${specifier}`);
              }
            }
          }
        }
      };
      walk(destination);
      expect(offenders, "an import out of the generated project").toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
