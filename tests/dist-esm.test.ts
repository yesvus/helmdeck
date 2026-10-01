// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const packageName = "@yesvus/helmdeck";
// Matches any next specifier literal that is not immediately followed by a file extension,
// so side-effect, dynamic, and nested imports such as next/font/google are covered too.
const extensionless = /["'`](next\/[^"'`\s]+?)(?<!\.[a-z0-9]+)["'`]/gi;
// Comments are stripped before matching. Prose that names a specifier, such as a doc comment
// referring to `next/headers`, is not an import and was being reported as one.
//
// `//` only counts as a comment at the start of a line or after whitespace, and never straight
// after a colon. Matching it anywhere would truncate a line at a `//` inside a string or regex
// literal, which is how a real extensionless import later on that line would go unnoticed.
const withoutComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^[^\S\n]*|[^\S\n])\/\/[^\n]*/g, "$1");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * The runtime exports `src/baseline.ts` declares, sorted.
 *
 * **Not a list written out here.** A hand-kept list is a check nobody updates: adding an export
 * meant editing this file, and forgetting meant the subpath silently shipping without it while the
 * test stayed green. Deriving it from the source cannot catch a name *removed* from the subpath,
 * because both sides of that comparison move together, which is why this function is only ever used
 * to prove the packaged subpath is non-empty and carries the names the source declares, and why the
 * removal half of that is covered by `pnpm surface:check` against the recorded release surface.
 *
 * `export type { ... }` is erased by the build and names nothing at runtime. The pattern deliberately
 * does not tolerate `type` between `export` and the brace, so a type-only block is not matched at all
 * rather than being filtered out afterwards.
 */
function baselineExportNames(): string[] {
  const source = readFileSync(join(root, "src", "baseline.ts"), "utf8");
  const names = [...withoutComments(source).matchAll(/export\s+\{([^}]*)\}\s+from/g)].flatMap(
    (match) =>
      match[1]
        .split(",")
        .map((entry) => entry.trim().split(/\s+as\s+/).pop()!.trim())
        .filter(Boolean),
  );

  // A parser that stopped matching, or started matching the type-only blocks, would produce a list
  // that looks plausible. Both bounds are what the file actually satisfies, so a regex that quietly
  // changes what it matches fails here rather than agreeing with whatever the build happened to emit.
  expect(names.length, "runtime exports parsed out of src/baseline.ts").toBeGreaterThan(20);
  expect(names.length, "type-only exports leaked into the runtime list").toBeLessThan(45);

  return [...new Set(names)].sort();
}

describe("published package under Node ESM", () => {
  it("imports every next specifier with an explicit extension", () => {
    const offenders = sourceFiles(join(root, "src")).flatMap((path) => {
      const specifiers = [...withoutComments(readFileSync(path, "utf8")).matchAll(extensionless)].map(
        (match) => match[1],
      );
      return specifiers.map((specifier) => `${path.slice(root.length + 1)}: ${specifier}`);
    });

    expect(offenders).toEqual([]);
  });

  describe("installed package", () => {
    let packageDirectory: string;

    beforeAll(() => {
      packageDirectory = mkdtempSync(join(root, "node_modules", ".helmdeck-esm-"));
      try {
        execFileSync(
          process.execPath,
          [
            resolve(root, "node_modules", "typescript", "bin", "tsc"),
            "-p",
            "tsconfig.build.json",
            "--outDir",
            join(packageDirectory, "dist"),
          ],
          { cwd: root, encoding: "utf8" },
        );
      } catch (error) {
        const { stdout = "", stderr = "" } = error as { stdout?: string; stderr?: string };
        rmSync(packageDirectory, { recursive: true, force: true });
        throw new Error(
          `Package build failed for the ESM resolution check:\n${stdout}${stderr}`,
          { cause: error },
        );
      }

      const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      writeFileSync(
        join(packageDirectory, "package.json"),
        `${JSON.stringify({ name: manifest.name, version: manifest.version, type: manifest.type, exports: manifest.exports }, null, 2)}\n`,
      );
      copyFileSync(join(root, "src", "theme", "tokens.css"), join(packageDirectory, "dist", "theme", "tokens.css"));
    }, 120_000);

    afterAll(() => {
      rmSync(packageDirectory, { recursive: true, force: true });
    });

    it("exports every name, and names every export it promises", () => {
      // An exports map typo would ship an entry point nothing can import, and the root entry
      // resolving says nothing about the subpath.
      const script = `const m = await import(${JSON.stringify(`${packageName}/baseline`)});`
        + "process.stdout.write(Object.keys(m).sort().join(','));";
      expect(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: packageDirectory,
        encoding: "utf8",
      })).toBe(baselineExportNames().join(","));
    }, 60_000);

    it("keeps node:async_hooks out of the baseline subpath, which a browser bundle reaches", () => {
      // **This is a regression that broke the fixture build once already.** A Next.js app imports
      // `@yesvus/helmdeck/baseline` for its components, so anything that entry point reaches is
      // bundled for the browser. `AsyncLocalStorage` there failed the build outright:
      // "the chunking context (unknown) does not support external modules (request: node:async_hooks)".
      //
      // The fix was to move the ambient scope to `./tenant-scope` and leave the rules behind. The
      // check walks the real import graph from the entry point rather than grepping for the string,
      // because the failure was never the import itself: it was the import being reachable from here.
      const reachable = new Set<string>();
      const queue = [join(root, "src", "baseline.ts")];

      while (queue.length > 0) {
        const file = queue.pop()!;
        if (reachable.has(file)) continue;
        reachable.add(file);

        let source: string;
        try {
          source = readFileSync(file, "utf8");
        } catch {
          continue;
        }
        for (const match of withoutComments(source).matchAll(/from\s+"(\.[^"]+)"/g)) {
          const resolved = resolve(file, "..", match[1]).replace(/\.js$/, ".ts");
          if (existsSync(resolved)) queue.push(resolved);
        }
      }

      // Matched as an import rather than searched as a substring, and deliberately without stripping
      // comments first. Prose that names a module is not an import of it, and the comment in
      // `src/baseline.ts` explaining why the scope lives elsewhere says `node:async_hooks` outright.
      //
      // The strip-then-search approach was tried first and is wrong twice over: it reads a comment
      // about the rule as a violation of it, and `withoutComments` removes the newline before a
      // comment when a match ends at a line above, so a `//` at column 0 sometimes survives
      // depending on what precedes it. Anchoring on the import form asks the question directly and
      // does not depend on comment stripping being exact.
      const imported = [...reachable].filter((file) =>
        /\bfrom\s+["']node:async_hooks["']|\bimport\s+["']node:async_hooks["']|\brequire\(\s*["']node:async_hooks["']/.test(
          readFileSync(file, "utf8"),
        ),
      );

      expect(imported.map((file) => file.slice(root.length + 1))).toEqual([]);
      // And the scope module is genuinely not reachable from here, rather than merely free of the
      // import: a copy of the scope that used a different mechanism would still pull Node in.
      expect([...reachable].some((file) => file.endsWith(`tenancy.ts`))).toBe(false);
    }, 60_000);

    it("resolves each store this package ships, through the packaged subpath", () => {
      // One import per name rather than a count, because a subpath resolving to a module that exports
      // nothing would satisfy a length check and fail every host on the first line they wrote.
      const names = [
        "createSqlitePersistenceAdapter",
        "createPostgresPersistenceAdapter",
        "createMemoryPersistenceAdapter",
        "assertAdminTenant",
        "AdminTenantError",
      ];

      for (const name of names) {
        const script = `const m = await import(${JSON.stringify(`${packageName}/baseline`)});`
          + `process.stdout.write(String(typeof m[${JSON.stringify(name)}]))`;

        expect(
          execFileSync(process.execPath, ["--input-type=module", "-e", script], {
            cwd: packageDirectory,
            encoding: "utf8",
          }),
          `${name} did not resolve through the packaged subpath`,
        ).toBe("function");
      }
    }, 60_000);

    it("resolves the published entry point by package name without a bundler", () => {
      // Run inside the staged package so Node resolves the name through the real exports map.
      const script = `const m = await import(${JSON.stringify(packageName)});`
        + "process.stdout.write(m.defaultAdminLocale);";

      expect(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: packageDirectory,
        encoding: "utf8",
      })).toBe("tr");
    }, 60_000);
  });
});
