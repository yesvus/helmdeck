# Changelog

All notable changes to Helmdeck are recorded here. Versions follow the `VERSION` file, which is
canonical and must match `package.json` and the install command in the README.

Artifacts are distributed to npm and, for hosts that cannot reach a registry, as GitHub release
tarballs. Upgrading means bumping the exact version and refreshing the lockfile.

## Unreleased

### Added

- **Published to npm.** A release now publishes the same tarball to the registry, with npm
  provenance minted from the workflow's OIDC identity, in the same run that cuts the GitHub
  release, so the two cannot describe different builds. Prereleases go out under `next` and
  releases under `latest`, so `pnpm add @yesvus/helmdeck` keeps resolving to the newest stable.
  The publish step is idempotent, because a re-run must not fail on a version npm already has.
  Requires either trusted publishing for this package or an `NPM_TOKEN` repository secret.

### Changed

- **The registry is the documented install path.** `pnpm add @yesvus/helmdeck@<version>` leads the
  README; the release tarball stays documented for hosts that cannot reach a registry. Installing
  a release tarball by URL makes pnpm cache a `release-assets.githubusercontent.com` redirect signed
  with a short-lived JWT, and when that signature expires `--frozen-lockfile` fails on a build
  that changed nothing. Hosts already vendoring a tarball are unaffected.

- **The documented install command is version-checked in both forms.** The release rewriter keeps
  the README's install command from lagging a release; it now handles the registry specifier as
  well as the tarball URL. Previously only the tarball was rewritten, so when the registry command
  became the one the README led with, a release would have left a stale version in it and
  `pnpm version:check` would have passed.

- CI checks on every pull request that `pnpm pack` produces a tarball npm accepts, as a dry run
  with no credentials. A scope or naming mistake surfaces there rather than after a tag exists.

No exported name was removed and no adapter contract changed.

## 0.4.0

A host can now assemble a working admin from the package alone: a session contract, a permission
layer, generated resource views, and a preconfigured baseline. Theming and the surface primitives
were brought onto one set of tokens, and the theme now resolves on every route rather than only
inside the shell.

No exported name was removed, and no adapter contract changed, so this is a minor transition. The
changes below alter rendering and composition rather than signatures: nothing here requires a major
version, but a host that relies on the old rendering will see a difference.

### Changed behaviour that a host may notice

- **`AdminModalContent` bounds the height and clips; `AdminModalBody` is the scroll container.**
  Previously both declared `overflow-y-auto`, so a tall dialog ran two live scrollbars at once, the
  inner one rendering inside the body's right padding, and the header scrolled away despite the
  pinned-region contract. Content placed directly in the dialog without a body is now clipped rather
  than scrolled. Compose `AdminModalHeader`, `AdminModalBody` and `AdminModalFooter` for anything
  taller than the dialog.
- **`AdminModalContent` reserves room for its close button.** With a close button shown, it applies
  right padding to its first child. This replaces the per-consumer `pr-14` that
  `AdminMediaPicker` and `AdminDestructiveAction` had to pass, and which `AdminDestructiveAction`
  did not pass at all, leaving its close button on the confirm dialog's description. If you were
  compensating yourself, remove that padding.
- **`AdminListItemCard` exposes its subtitle through contextual help** rather than as permanent
  copy, which is how every other card already handled secondary text. Relying on the subtitle being
  visible needs a change.
- **A collapsible `AdminFormCard` renders its action in a footer** instead of at the top of the
  body. It cannot live in the header, because a summary row is the disclosure control and a button
  inside it toggles the card as well as activating itself.

### Added

- `AdminAuthProvider`, `useAdminSession`, `AdminRequireSession`, `adminReturnTo`, `useAdminReturnTo`
  for session state, a guarded layout, and a validated return-to path.
- `AdminProfilePage` and `AdminSettingsPage`.
- `AdminCan`, `useAdminPermission`, `useAdminCan`, `useAdminPermittedNav` and
  `AdminPermissionsProvider`. A permission that is not declared is treated as not granted, so
  actions fail closed; navigation stays permissive.
- `@yesvus/helmdeck/baseline`, exporting `createSessionAuthAdapter`, `createMemoryPersistenceAdapter`,
  `createAuditAdapter`, `createCacheAdapter`, `MemoryRecord` and `AdminSessionCookieIO`. The session
  adapter is server-side, because `next/headers` is server-only.
- `defineAdminResource`, `AdminResourceList`, `AdminResourceForm`, `absentRequired` and
  `adminResourceValues` for generated list and detail views.
- Action and menu extension slots on the card and profile menu.
- `--admin-control-radius`, `--admin-inverted-surface` and `--admin-inverted-text` tokens. The
  inverted pair expresses "the opposite of the page" so a text token is never used as a
  background, which is what renders white-on-white in dark mode.
- `pnpm verify:layout`, which measures the built fixture app in a real browser. The unit tests read
  class attributes, which cannot see a utility missing from the stylesheet or losing to another by
  source order. It asserts dialog geometry at two viewports, the theme resolving on the landing page
  at both colour schemes, and carries positive controls so a detector that stopped matching fails
  rather than passing unnoticed.

### Changed

- Card primitives share one surface contract: a single radius token, one border, one surface, and
  separated header and footer regions. They had drifted across three radius values and two surfaces.
- Dialog defaults follow shadcn/ui: 32rem from the `sm` breakpoint up, and a height cap of
  `min(56rem, 100dvh - 4rem)` replacing `90dvh`, which made the top and bottom margin a percentage
  of the viewport and matched nothing else on the page.
- The dialog shares the card radius, and its close button is aligned with the content padding.
- `AdminStatCard` sits on the page surface like every other card, and the icon wells share a radius
  token instead of carrying two different values for the same element.
- The theme provider moved to the root layout, so the landing page resolves the same stored
  preference. It previously sat in the shell layout, and the landing page rendered the light default
  regardless of the operating system or the shell's selection. A pre-paint script establishes the
  value before first paint.
- The tooltip uses the inverted surface pair, so it reads as an overlay in both modes.

### Fixed

- Control boundaries meet 3:1 against the adjacent surface. The decorative border token had been
  used for interactive element edges, where it is 1.26:1.
- Colours that could not flip, or that inverted in dark mode, across the shipped components and the
  fixture app. A `bg-brand-100` used as a background under theme-aware text was among them.
- The colour guard now matches arbitrary values, not only palette names, so a literal such as
  `bg-[#18181b]` can no longer pass it. Two were live: one on the landing page and one in the
  tooltip. Its variant grammar also accepts bracketed variants such as `data-[state=open]:`.
- A consumer's `w-` or `max-w-` utility now replaces the dialog's built-in sizing at any breakpoint
  rather than competing with it. The base cap used to ship in the same class list as the consumer's
  utility, and the winner was whichever Tailwind ordered last, so a dialog could not reliably be
  widened.
- `inset-x-*` no longer suppresses the vertical centring anchor, nor `inset-y-*` the horizontal one.
- The theme boot script falls back to the system preference when storage is unavailable, rather than
  leaving the page unthemed until the provider mounts.
