// SPDX-License-Identifier: MIT

/**
 * The types for `scripts/version-source.mjs`, which `tests/version.test.ts` imports.
 *
 * A declaration beside the script rather than beside the test, because the script is the thing that
 * needs describing: it is a Node program, so the build configs leave `allowJs` off, and a test that
 * imports it directly gets no shape at all. Declared here rather than turned on globally because
 * `allowJs` across `tests/` would pull every JavaScript file in reach of the program into the type
 * check, which is a different change to the one this needs.
 *
 * Only the exports a test reads. A name added to the script is a type error here rather than a
 * silent `any`, which is the direction that makes the declaration worth keeping.
 */
declare module "*/scripts/version-source.mjs" {
  export const root: string;
  export const VERSION_PATH: string;
  export const GENERATED_PATH: string;
  export const semverIdentifier: string;
  export const VERSION_TAG_PATTERN: RegExp;

  /** Throws on anything that is not a v-prefixed semver tag, rather than returning a default. */
  export function versionFromTag(tag: unknown): string;

  /** The `VERSION` file's value, read and validated. Throws when the file cannot be read. */
  export function readVersion(): string;

  /** The exact text of the generated file for a tag, so a comparison is content rather than a parse. */
  export function versionSource(tag: string): string;

  /** Writes the generated file. True when the file already held that text. */
  export function writeVersionSource(): boolean;

  export function main(): void;
}