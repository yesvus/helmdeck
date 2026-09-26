// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const extensionless = /from\s+["']next\/([a-z-]+)["']/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe("published package under Node ESM", () => {
  it("imports every next specifier with an explicit extension", () => {
    const offenders = sourceFiles(join(root, "src")).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return [...source.matchAll(extensionless)].map(() => path.slice(root.length + 1));
    });

    expect(offenders).toEqual([]);
  });

  describe("built barrel", () => {
    let buildDirectory: string;

    beforeAll(() => {
      buildDirectory = mkdtempSync(join(root, "node_modules", ".helmdeck-esm-"));
      execFileSync(
        process.execPath,
        [
          resolve(root, "node_modules", "typescript", "bin", "tsc"),
          "-p",
          "tsconfig.build.json",
          "--outDir",
          buildDirectory,
        ],
        { cwd: root, stdio: "ignore" },
      );
      copyFileSync(join(root, "src", "theme", "tokens.css"), join(buildDirectory, "theme", "tokens.css"));
    }, 120_000);

    afterAll(() => {
      rmSync(buildDirectory, { recursive: true, force: true });
    });

    it("resolves the package barrel without a bundler", () => {
      const entry = join(buildDirectory, "index.js");
      const script = `const m = await import(${JSON.stringify(`file://${entry}`)});`
        + "process.stdout.write(m.defaultAdminLocale);";

      expect(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" })).toBe("tr");
    }, 60_000);
  });
});
