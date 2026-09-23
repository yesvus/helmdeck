# Phase 6 - Publish v0.1.0

- [x] Build, types, lint clean. `pnpm build` (tsc to `dist`), `pnpm typecheck`,
  `pnpm lint`.
- [x] README usage example with `AdminShell`.
- [x] LICENSE headers correct. `SPDX-License-Identifier: MIT` on every shipped
  file under `src/`, plus the LICENSE file and the `license` field.
- [ ] Publish under the final name, deferred until you pick it up.

## Notes

- `exports` point at `dist`, so consumers no longer need
  `transpilePackages`. `dist/` is built, not committed.
- Fixture app imports source directly, so `pnpm dev` works without a build.
