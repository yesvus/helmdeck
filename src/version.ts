// SPDX-License-Identifier: MIT
// Generated from the VERSION file by scripts/version-source.mjs. Do not edit: `pnpm build`
// rewrites it and `pnpm version:check` fails when it disagrees with VERSION.

/**
 * The version of Helmdeck that was built, exactly as the `VERSION` file recorded it when this
 * file was generated.
 *
 * It is a build artefact rather than a value read at runtime, so what a host sees is the version
 * they installed rather than whatever a file next to it happens to say. There is no fallback value:
 * a build whose VERSION file is missing or malformed fails in the generator, so the absence is
 * reported where it can still be fixed instead of being rendered as `0.0.0`.
 */
export const HELMDECK_VERSION = "0.5.1";
