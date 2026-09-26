// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const packageName = "@yesvus/helmdeck";
// Matches any next specifier literal that is not immediately followed by a file extension,
// so side-effect, dynamic, and nested imports such as next/font/google are covered too.
const extensionless = /["'`](next\/[^"'`\s]+?)(?<!\.[a-z0-9]+)["'`]/gi;

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
      const specifiers = [...readFileSync(path, "utf8").matchAll(extensionless)].map((match) => match[1]);
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
        throw new Error(`Package build failed for the ESM resolution check:\n${stdout}${stderr}`);
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
