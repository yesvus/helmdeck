# Changelog

All notable changes to Helmdeck are recorded here. Versions follow the `VERSION` file, which is
canonical and must match `package.json` and the install command in the README.

Artifacts are distributed as GitHub release tarballs. npm publication is postponed indefinitely, so
upgrading means replacing the exact tarball URL and refreshing the lockfile.

## Unreleased

Roles are enforced, the dashboard reads the database, and a SQL injection in the demo's write paths
is closed. No exported name was removed and no adapter contract changed.

### Security

- **Column names arriving from the browser are checked against the schema on writes, not only on
  reads.** `AdminPersistenceAdapter` implementations bound record values as parameters but pasted the
  caller's own keys into the `INSERT` and `SET` lists, so a key carrying an assignment was read as
  one. A write to any exposed table was a way to read any other table, including `users` with its
  password hashes. Values are still parameterised; only names are now validated, against the table's
  own columns, so a record naming a field that does not exist is an error rather than a statement that
  silently means something else. Hosts that wrote records with keys their table does not have will
  now see those writes refused.

### Changed behaviour that a host may notice

- **`AdminCollectionEditor` provides its own drag context.** It previously rendered drag handles and
  called the sortable hook while providing no `DndContext`, so every handle was an inert button that
  still carried a role, a label and a tab stop. A host that wrapped the editor in
  `AdminSortableDndContext` to make it work should drop that wrapper; nesting still works but the
  outer context is now redundant. `AdminSortableDndContext` accepts an optional `id`, which fixes the
  ids dnd-kit generates for its screen reader instructions: left unset they come from a module-level
  counter, which makes them differ between a server render and the browser, leaving the handle
  pointing at an element that does not exist.
- **The three tone types are one union, `AdminTone`.** `AdminStatCardTone`, `AdminStatusTone` and
  `AdminBannerTone` are each `AdminTone`, so `"danger"` and `"error"` are accepted everywhere and
  render identically, and a function mapping a domain state to a tone can be typed against all
  three. `AdminTone` is the name to import for new code; the three existing names remain valid. This
  is additive: no previously accepted value stops compiling. `AdminToastTone` is unchanged and is
  still narrower.

### Added

- **`AdminTone`**, the shared severity vocabulary for the status pill, the stat card and the banner.
- **`AdminSortableDndContext` accepts an `id`**, for stable screen reader instruction ids.
- **`createSqlitePersistenceAdapter`** covering both a local `file:` database and hosted Turso, so a
  host gets persistence without writing an adapter. This reverses the package's previous contract,
  which said the adapter types are a seam and do not imply a backend; the seam is still there, it
  just has a default now.

### Fixed

- **`AdminDashboardTiles` reloads per tile.** The memo keyed on the loader's identity, so a loader
  written inline in the caller's render reloaded on every rerender, and a settled dashboard issued
  one more load per rerender than a mounted one.
- **`AdminCollectionEditor` handles were inert** without a host-supplied drag context, as above.

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
