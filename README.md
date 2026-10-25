# Helmdeck

Helmdeck is a reusable, MIT-licensed admin dashboard engine for Next.js App Router applications. Install it to get a working admin shell, generated resource lists and forms, dashboard tiles, analytics, media and content-lifecycle workflows, and the shared interaction patterns around them. You configure resources and connect host-owned services through typed adapters and callbacks instead of building each admin surface from scratch. It is batteries included: the admin interface itself ships with the package, and what you write is the part that belongs to your product.

Helmdeck takes care of the admin interface and its reusable workflows. It does not own your application backend:

| Helmdeck provides | Your host provides |
| --- | --- |
| Responsive admin shell, navigation, profile and sign-in presentation | User identity, credentials, and session policy |
| Resource registry, generated lists and forms, search, filters, sorting, paging, import and export | Resource definitions, validation and domain rules |
| Dashboard tiles, charts, analytics views, media workflows, inbox and content lifecycle views | Data storage, media storage, authorization rules, and server-side enforcement |
| Theme, localization, accessible states, and reusable interaction patterns | Application routes, deployment, and public-facing rendering |

The adapters define where the host connects its services. UI permission filtering and client callbacks are presentation boundaries; every server read or write still needs host-side authentication, authorization, and input validation. The [starter template](https://helmdeck-web.vercel.app/catalog/quick-start) shows a working host with a local SQLite store and generated resource pages. The [independent host](https://github.com/yesvus/helmdeck/tree/main/examples/independent-host) demonstrates integrating the package into a separate Next.js application.

The next major version changes this arrangement: Payload becomes the CMS under Helmdeck, and Helmdeck's own resource engine is retired. [Payload under the hood](https://helmdeck-web.vercel.app/catalog/payload) states the shape and the six steps that get there.

[Component primitives](https://helmdeck-web.vercel.app/catalog/primitives) lists what the package already ships, and the [integration contracts](https://helmdeck-web.vercel.app/catalog/contracts) describe the adapter seams a host connects to.

## Documentation

Every topic below is its own page in the [documentation catalog](https://helmdeck-web.vercel.app/catalog), written from these sections rather than summarized, with the package's catalogue rendering every export live.

| Page | The topic it carries |
| --- | --- |
| [Quick start](https://helmdeck-web.vercel.app/catalog/quick-start) | The starter template, then the routes, dialogs, search params and tests that follow it. |
| [Payload as the CMS](https://helmdeck-web.vercel.app/catalog/payload) | Batteries included, what that does not mean, the six steps, and the surfaces that read Payload. |
| [The admin baseline](https://helmdeck-web.vercel.app/catalog/baseline) | Session and route protection, the sign-in, the accounts, the secret, the store and the schema. |
| [Permissions and resources](https://helmdeck-web.vercel.app/catalog/permissions) | Resource definitions, generated lists and forms, the store's seams, the adapters. |
| [Content lifecycle](https://helmdeck-web.vercel.app/catalog/lifecycle) | Editing a typed collection, revisions, restore, soft delete and the permissions behind them. |
| [Integration contracts](https://helmdeck-web.vercel.app/catalog/contracts) | The adapter seams a host connects to, and localization. |
| [Themes and settings](https://helmdeck-web.vercel.app/catalog/theme) | The tokens, the host settings that feed them, and the tone vocabulary. |
| [Charts](https://helmdeck-web.vercel.app/catalog/charts) | Points from store rows, series, money, bucketing, the axis, and reading without a mouse. |
| [Visitor analytics](https://helmdeck-web.vercel.app/catalog/analytics) | Recording events, retention, querying what was captured, and a report as a file. |
| [Dashboard tiles](https://helmdeck-web.vercel.app/catalog/dashboard) | Tiles over any store, the four states every tile has, and declaring your own. |
| [Media](https://helmdeck-web.vercel.app/catalog/media) | Media adapters and the media library page. |
| [Component primitives](https://helmdeck-web.vercel.app/catalog/primitives) | The component reference by area, from form controls to overlays, tables, dates and loading states. |
| [Development](https://helmdeck-web.vercel.app/catalog/development) | Contextual help and the deploy check, with what the smoke check cannot detect. |
| [Getting started](https://helmdeck-web.vercel.app/catalog/getting-started) | The install command and shell setup, with the package's catalogue beside it. |

## Migrating to Payload

The next major version retires the resource engine, and
[MIGRATION.md](MIGRATION.md) says what a host replaces each retired export
with, and what a host keeps.

## Quick start

Install the package (below), import the theme tokens into the host stylesheet (under Pinning), and follow the
[quick start](https://helmdeck-web.vercel.app/catalog/quick-start) through the starter template and the routes it carries.

## Install

```bash
pnpm add https://github.com/yesvus/helmdeck/releases/download/v1.2.0/yesvus-helmdeck-1.2.0.tgz
```

Release artifacts are distributed through GitHub releases. npm publication is postponed indefinitely.

## Releases

`VERSION` is the canonical release version and must match `package.json` and the install command above. The release workflow accepts explicit alpha, beta, stable, patch, minor, and major transitions, runs the full quality gate, tags the release, and attaches the package tarball with a SHA-256 checksum. Alpha and beta releases are marked as GitHub prereleases. Stable releases move the floating `v0` tag; prereleases leave it unchanged. Consumers should upgrade by replacing the exact release tarball URL and refreshing the lockfile.

A release rewrites the install command in the same commit as the version bump, so the documented URL never lags a release. Run `pnpm version:check` to verify version metadata locally; it fails when the three disagree. Use `pnpm version:next <bump>` to preview a transition without changing files. Notable changes for every version are recorded in [CHANGELOG.md](./CHANGELOG.md). Write pending notes under `## Unreleased`: the release stamps that heading with the version it is cutting, in the same commit as `VERSION`, `package.json` and the install command above, so the changelog cannot announce a release the rest of the repository does not agree has happened. A release with no `## Unreleased` section fails rather than cutting one silently.

### Pinning, upgrades, and rollback

Install an immutable release artifact by exact version and URL. Do not pin consumers to a moving branch, `latest`, or the floating `v0` tag. Verify the downloaded tarball against the SHA-256 checksum attached to its GitHub release, then commit the updated dependency and lockfile together. Deploy the same lockfile artifact through environments.

To upgrade, review the [release notes](./CHANGELOG.md) and the compatibility notes below, update the exact tarball URL, refresh the lockfile, and run the host's typecheck, tests, and production build before deployment. Roll back by restoring the previous exact artifact URL and lockfile from version control, then redeploy. Helmdeck does not modify its installed code or migrate host data.

Patch and minor releases preserve existing public APIs and adapter behavior. A breaking public API or adapter contract change requires a major-version transition and a migration note; prereleases may introduce such changes and are intended for evaluation. Release notes identify public API and adapter additions, deprecations, and breaking changes. Consumers should treat the TypeScript declarations shipped in each artifact as the contract for that version.

Import the theme tokens once in the host stylesheet, and point Tailwind at the installed package:

```css
@import "tailwindcss";
@source "../node_modules/@yesvus/helmdeck/dist";
@import "@yesvus/helmdeck/theme.css";
```

Keep these directives in the host's CSS entry point, with the theme import after `@import "tailwindcss";`. Tailwind v4 evaluates the theme tokens while processing that stylesheet, so importing `theme.css` from a React component does not register them.

The `@source` line is what makes the components lay out. Helmdeck's own components are written with
Tailwind utilities, and Tailwind only generates a utility it finds in scanned source, so without this
line a host gets the design tokens and none of the layout: cards with no padding, grids that do not
grid, modals that do not centre. The path is relative to the stylesheet that declares it.
