// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { HELMDECK_VERSION } from "../src/index";
import { versionSource, versionFromTag } from "../scripts/version-source.mjs";

/**
 * The version the package exports is the `VERSION` file's value, not a constant somebody remembers
 * to bump.
 *
 * The file already existed and was already kept in step with package.json and the README by
 * `release-version.mjs check`, and none of that reached code: the value sat in three files that no
 * program read. A hand-written version constant is a bug waiting for the next release, so the claim
 * under test here is not that the number is right today but that the two cannot disagree tomorrow.
 *
 * The generated module is evaluated rather than imported, because an import would compare the
 * export against itself: the file could be edited and `HELMDECK_VERSION` would follow the edit
 * without complaint. Re-deriving it from what the generator writes for the file's own contents is
 * what makes a hand edit fail.
 */

const ROOT = process.cwd();
const VERSION_FILE = readFileSync(join(ROOT, "VERSION"), "utf8");
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };

/**
 * What the package's own export yields at runtime, evaluated from the generated source.
 *
 * TypeScript rather than a regex, because the claim is about a module's value and a regex would
 * pass against a file that also computed the version from somewhere else.
 */
function evaluateGenerated(): unknown {
  const source = readFileSync(join(ROOT, "src/version.ts"), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // A self-contained module: no imports to resolve, so the export is the whole return value.
  return new Function(`${js.replace(/^export\s+/gm, "")}; return HELMDECK_VERSION;`)();
}

describe("the version the package exports", () => {
  it("is the VERSION file's value, read at build time rather than restated by hand", () => {
    // The expectation is built from the file the way the generator builds it, so a hand-edited
    // src/version.ts has nothing to agree with.
    expect(evaluateGenerated()).toBe(versionFromTag(VERSION_FILE));
    expect(HELMDECK_VERSION).toBe(versionFromTag(VERSION_FILE));
  });

  it("holds the whole file's text, so trimming and a stray character cannot pass", () => {
    // `toContain` on the raw contents: a file holding `0.4.0` alongside `0.4.1` would satisfy a
    // substring search on the number alone.
    expect(readFileSync(join(ROOT, "src/version.ts"), "utf8")).toBe(versionSource(VERSION_FILE));
  });

  it("agrees with package.json, which release-version.mjs already checked", () => {
    // Three places held the version and only two of them were compared. This is the third pairing,
    // and it is what makes the exported constant the same fact as the published package version.
    expect(HELMDECK_VERSION).toBe(PACKAGE_JSON.version);
  });

  it("is a version and not a placeholder, because 0.0.0 reads as information and is not", () => {
    // The failure mode this guards is a build that could not read VERSION and emitted something
    // shaped like an answer. There is no fallback string in the generated file to rule out, so the
    // assertion is that the value is a real release tag and that the generator refuses otherwise.
    expect(HELMDECK_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(HELMDECK_VERSION).not.toBe("0.0.0");
    expect(HELMDECK_VERSION).not.toBe("");
  });

  it("is compiled into the module rather than read from disk when it runs", () => {
    // What separates "the version that was built" from "the version in the working tree": the
    // module carries a literal and touches no filesystem. A generated file that read VERSION at
    // runtime would report whatever sits next to node_modules on the host's machine.
    const source = readFileSync(join(ROOT, "src/version.ts"), "utf8");
    expect(source).not.toMatch(/\bimport\b|require\(|readFile|process\.|node:fs/);
  });
});

describe("a build that cannot name itself stops instead of guessing", () => {
  // The absent case is the one worth stating, because a version readout that says `0.0.0` or
  // `undefined` is worse than no readout at all: it looks like information. So the generator throws
  // where the mistake can still be fixed, rather than emitting a value and shipping it.
  const refused: Array<[string, string]> = [
    ["a missing file", ""],
    ["whitespace where the tag should be", "   \n"],
    ["a version with no v prefix", "0.4.0"],
    ["a two-part version", "v0.4"],
    ["a leading zero in a numeric part", "v0.04.0"],
    ["a word", "latest"],
    ["the file a shell would have written", "v0.4.0\nnext\n"],
  ];

  for (const [what, contents] of refused) {
    it(`refuses ${what} rather than producing a value`, () => {
      expect(() => versionFromTag(contents)).toThrow(/VERSION must be a valid v-prefixed semver tag/);
    });
  }

  it("still finds the version this repository is on", () => {
    // The refusals above pass against a generator that refuses everything, so the accepting path is
    // checked here against the file the repository actually ships.
    expect(versionFromTag(VERSION_FILE)).toBe(HELMDECK_VERSION);
    expect(versionFromTag("v1.2.3-alpha.4")).toBe("1.2.3-alpha.4");
  });
});
