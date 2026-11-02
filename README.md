# Helmdeck

> **Maintenance status: retired.** No further releases. This package is not published to npm; it is consumed by one project through a pinned release tarball. New work should use [shadcn/ui](https://ui.shadcn.com/) primitives plus the admin surface the host framework ships (for example Medusa's dashboard) instead of building on Helmdeck. The repository is archived, so issues and pull requests are closed; tags and the v1.6.0 release tarball remain available to the pinned consumer. See [#503](https://github.com/yesvus/helmdeck/issues/503).

Helmdeck is an opinionated Next.js application framework and admin platform for developers and coding agents building content and commerce sites. It provides a cohesive starter, admin shell, and reusable workflows, so a project can spend less time assembling admin foundations and more time on its product. Its WordPress-like convenience is an analogy for an integrated workflow, not a claim to replace WordPress or the systems below.

## System boundaries

- **Helmdeck** owns the scaffold, admin shell, and reusable workflows. It owns neither content nor commerce tables by default.
- **Payload**, when enabled, owns editorial content and its tables.
- **Medusa**, when enabled, owns commerce and its tables.
- **The host application** owns product rules, authorization, and deployment, and connects the systems.

Helmdeck is agent-friendly in concrete ways: typed adapter contracts define integration seams; the [component catalog](https://helmdeck-web.vercel.app/catalog) makes exports discoverable; labels and i18n provide explicit interface wording; and the release workflow documents versioned artifacts and upgrades. These support developers and coding agents working in the project. They do not imply autonomous behavior or integrations that are not shipped.

### Shipped today

- Admin shell, accessible UI primitives, tables, dashboards, and charts.
- Typed host adapter contracts for permissions, media, and data access.
- Payload adapters for content and media, plus the reference Payload host.
- Documented release artifacts and a starter template.

### Planned direction

These four direction issues were shipped and closed before retirement: [#382](https://github.com/yesvus/helmdeck/issues/382) incrementally adopts mature shadcn/ui primitives; [#383](https://github.com/yesvus/helmdeck/issues/383) adds a change-aware sticky form action panel; [#384](https://github.com/yesvus/helmdeck/issues/384) adds an optional Payload-powered blog starter; [#385](https://github.com/yesvus/helmdeck/issues/385) adds a read-only Medusa host example. No further direction work is planned.

UI permission filtering and client callbacks are presentation boundaries; every server read or write still needs host-side authentication, authorization, and input validation. The [starter template](https://helmdeck-web.vercel.app/catalog/quick-start) shows a working host with a local SQLite store and generated resource pages. The [independent host](https://github.com/yesvus/helmdeck/tree/main/examples/independent-host) demonstrates integrating the package into a separate Next.js application.

`buildAdminUrlPath` and `resolveAdminUrlHierarchy` provide framework-neutral hierarchical path construction and resolution, and `AdminBreadcrumbs` accepts optional host-resolved `resolvedCrumbs`. Hosts own route registration, browser URL changes, and query-state navigation; these helpers do not modify the address bar.

The optional, host-owned assistant contract and provider notes are in [docs/assistant.md](./docs/assistant.md).

For a vendor-neutral production deployment of the Payload reference host, see the [Docker guide](examples/payload-host/deploy/docker.md).

Payload is the CMS in the reference host: it owns its collections, fields, auth, access control, versions, trash and uploads. Helmdeck's own resource engine was retired in 1.0.0. [Payload under the hood](https://helmdeck-web.vercel.app/catalog/payload) describes the integration and its six steps.

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

Map each host media record to an `AdminMediaItem`, including its opaque host-owned `id`, `publicUrl`, and display metadata. Opt into `AdminMediaField`'s `idName` to submit that identifier alongside the URL, then persist the relationship by ID and retain the URL as a robust, re-resolvable fallback.
| [Getting started](https://helmdeck-web.vercel.app/catalog/getting-started) | The install command and shell setup, with the package's catalogue beside it. |

## Feedback

Feedback is welcome through GitHub issue forms: report defects with the [bug report form](https://github.com/yesvus/helmdeck/issues/new?template=bug_report.yml) and propose capabilities with the [feature request form](https://github.com/yesvus/helmdeck/issues/new?template=feature_request.yml). For open-ended feedback that does not fit either form, open a [blank issue](https://github.com/yesvus/helmdeck/issues/new). Blank issues remain enabled, so there is always a path for general questions and discussion.

## Migrating to Payload

The resource engine was retired in 1.0.0, and
[MIGRATION.md](MIGRATION.md) says what a host replaces each retired export
with, and what a host keeps.

## Quick start

Install the package with the exact release URL below, import the theme tokens into the host stylesheet (under Pinning), and follow the [quick start](https://helmdeck-web.vercel.app/catalog/quick-start) through the starter template and its routes. Keep the generated session secret private, configure it through the environment, and replace any starter placeholders before deployment.

## Install

```bash
pnpm add https://github.com/yesvus/helmdeck/releases/download/v1.6.0/yesvus-helmdeck-1.6.0.tgz
```

Release artifacts are distributed through GitHub releases. npm publication is postponed indefinitely.

## Releases

Releases ended with the project's retirement; this section is retained as a reference for the existing pinned consumer.

While the project was maintained, `VERSION` was the canonical release version and matched `package.json` and the install command above. The release workflow accepted explicit alpha, beta, stable, patch, minor, and major transitions, ran the full quality gate, tagged the release, and attached the package tarball with a SHA-256 checksum. Alpha and beta releases were marked as GitHub prereleases. Stable releases moved the floating major-version tag, `v1` since 1.0 and `v0` only for 0.x releases; prereleases moved no floating tag. Consumers upgraded by replacing the exact release tarball URL and refreshing the lockfile.

A release rewrote the install command in the same commit as the version bump, so the documented URL never lagged a release. The `pnpm version:check` command verified version metadata locally and failed when the three disagreed; `pnpm version:next <bump>` previewed a transition without changing files. Notable changes for every version were recorded in [CHANGELOG.md](./CHANGELOG.md). Pending notes were written under `## Unreleased`; each release stamped that heading with the version it was cutting, in the same commit as `VERSION`, `package.json` and the install command above, so the changelog could not announce a release the rest of the repository did not agree had happened. A release with no `## Unreleased` section failed rather than cutting one silently.

### Pinning, upgrades, and rollback

Install an immutable release artifact by exact version and URL. Do not pin consumers to a moving branch, `latest`, or the floating major-version tag. Verify the downloaded tarball against the SHA-256 checksum attached to its GitHub release, then commit the updated dependency and lockfile together. Deploy the same lockfile artifact through environments.

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
