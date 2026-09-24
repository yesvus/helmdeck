# Phase 6 - Release v0.1.0

- [x] Build, types, lint clean. `pnpm build` (tsc to `dist`), `pnpm typecheck`,
  `pnpm lint`.
- [x] README usage example with `AdminShell`.
- [x] LICENSE headers correct. `SPDX-License-Identifier: MIT` on every shipped
  file under `src/`, plus the LICENSE file and the `license` field.
- [x] Publish a GitHub prerelease tarball with the built `dist/` output.

## Notes

- `exports` point at `dist`, so consumers no longer need
  `transpilePackages`. `dist/` is built, not committed.
- Fixture app consumes the package export, so run `pnpm build` before `pnpm dev` when working from a clean checkout.
