# Changelog

All notable changes to Helmdeck are recorded here. Versions follow the `VERSION` file, which is
canonical and must match `package.json` and the install command in the README.

Artifacts are distributed as GitHub release tarballs. npm publication is postponed indefinitely, so
upgrading means replacing the exact tarball URL and refreshing the lockfile.

## Unreleased

The package now ships working authentication and server-side authorization, both of which it
previously documented as the host's job. A generated list can search, sort, filter and page, and a
CMS can be built on top of it. No exported name was removed: 142 names were exported at 0.4.0 and
238 are exported now, with none of the original 142 gone, so this is a minor transition.

The two additions that change what a host has to build are the reason to read this section. Before
them, a host that installed this package and wanted a person to sign in had to write the credential
store, the session store, the expiry and the revocation, and had to write the refusal itself, because
every permission decision the package made was made in a browser.

### Security

- **Column names arriving from the browser are checked against the schema on writes, not only on
  reads.** `AdminPersistenceAdapter` implementations bound record values as parameters but pasted the
  caller's own keys into the `INSERT` and `SET` lists, so a key carrying an assignment was read as
  one. A write to any exposed table was a way to read any other table, including `users` with its
  password hashes. Values are still parameterised; only names are now validated, against the table's
  own columns, so a record naming a field that does not exist is an error rather than a statement that
  silently means something else. Hosts that wrote records with keys their table does not have will
  now see those writes refused.
- **The write boundary reads only the fields the definition declares.** The generated forms always
  did, because `adminResourceValues` is what they call, but a request that does not go through a form
  handed its value straight to the adapter. A column check is not a substitute: it asks whether a name
  is a column of the table, and `id`, `created_at` and `updated_at` all are. A host should run its
  incoming value through `adminResourceValues` on the server. The README shows the shape, and notes
  that this also means the server names the record, so a caller cannot choose an id and write over a
  row that already exists.
- **A decision carries the record the call names.** `read`, `update` and `delete` are decided per
  record; `query` is the collection question, and the host's own query does the row scoping. That
  last part is a deliberate limitation rather than an oversight, and it is stated where the code is.
- **The sign-in bound covers attempts that arrive together.** `AdminLoginThrottle.check` was a read:
  a client firing twenty attempts at once had all twenty of them read the count before any of them
  had recorded a failure, so all twenty reached the password and the bound did nothing to the only
  shape a fast attacker uses. It now takes a slot for the key when it lets an attempt through, and
  `failed` and `succeeded` are how that slot comes back, so at most `limit` of a burst reach the
  comparison. The three methods and their signatures are unchanged, so nothing fails to compile and
  no call site changes. A host with its own throttle is the one this asks something of, and it is
  written on the type: `check` has to take the slot in the same operation that refuses, so a Redis
  implementation is a script or a conditional `UPDATE` rather than a `GET` and a `SET`, and it has
  to age out a slot that is never reported back, or a request that dies between `check` and the
  comparison holds the key below its limit for ever. `createLoginThrottle` ages one out with the
  window by default and takes `reservationMs` for a host that wants it shorter.
- **`endAllSessions` takes no account argument.** It resolves the caller from the signed cookie and
  acts on that account, and it refuses unless the host supplies `mayEndAllSessions`. There is no
  capability here that a caller can point at somebody else, which is the shape the previous version
  had: it took an email and authorized nothing, so a host's own check sat one layer above the thing
  it protected and any other caller skipped it.

### Changed behaviour that a host may notice

- **The package ships a credential store.** `createCredentialAuthAdapter`,
  `createPersistenceCredentialStore`, `hashPassword`, `verifyPassword`, `authenticate`,
  `normalizeEmail` and `generateSessionSecret` are new. At 0.4.0 the package shipped a signed cookie
  with nothing behind it, and its own documentation said credential verification, user lookup and
  session storage all stayed with the host. A host with a different identity system keeps using its
  own; a host without one no longer has to build the part that must not be hand-rolled. The secret
  is a design question rather than a default, and the answer and its cost are written down.
- **Authorization can be decided on the server.** `createAdminPermissionCheck`,
  `createAdminPermissionGuard`, `createAdminResourceActions` and `evaluateAdminPermission` are new.
  `check` is the server action the client's `AdminPermissionsAdapter.can` calls, so the browser holds
  no verdict of its own, and `createAdminResourceActions` returns five calls that are structurally an
  `AdminPersistenceAdapter`, so they drop into `AdminResourceList` as its `persistence` prop. A
  missing rule denies on the server and the view hides, so a misconfiguration looks like a refusal
  rather than like a product that works.
- **A session can be resolved from server code.** `createAdminSessionGuard` and `readAdminSession` are
  new, and `adminReturnTo` moved out of the client module so a guard can validate its own
  destination; the old path re-exports it and the two are asserted to be the same function. Before
  this, `src/shell/auth.tsx` was a client module, so a server component, a route handler and a server
  action each had to write the same read-and-redirect. The refusal is the host's: the package imports
  no navigation module.
- **`AdminRequireSession` validates a return destination with the stricter rule.** It used a bare
  same-site-path check while the sign-in page read the same value with the layer-peeling validator, so
  the client half could write a `next` its own reader then discarded. One rule now applies wherever a
  destination is read, for both halves.
- **A generated list can query the store.** `AdminPersistenceAdapter` gains an **optional**
  `queryPage`, answering rows and a required pre-window `total`. It is optional so that an adapter
  written against 0.4.0 satisfies the interface unchanged, and its absence is how a list knows not to
  draw a search box, sort buttons, filters, a pager or a count that would do nothing. The existing
  `query` member keeps its exact-field-match reading and its parameter type, deliberately: typing it as
  a list query would stop compiling a call that works today in every host that has one, and would read
  as valid a call that today silently matches nothing. `adminResourceQuery` and
  `parseAdminResourceQuery` are exported so a host need not assemble a query by hand.
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
- **A column's `format` is a name rather than a function.** It was
  `(value, row) => ReactNode`, which cannot be serialised: a host that put a definition in a server
  component and rendered `AdminResourceList` on it failed at prerender with `Functions cannot be
  passed directly to Client Components`, and no test, typecheck or lint noticed, because the value is
  valid TypeScript and the failure is in a build step. It is now `"money" | "count" | { name: string }`,
  the first two printed by the list itself and the rest resolved from a new `formatters` prop on
  `AdminResourceList`. A name nothing answers is refused while the table is built rather than falling
  back to the stored value, so a misspelled name cannot put a raw number on a page. Hosts that wrote
  `format: (value) => ...` move the function into that prop. `AdminResourceColumnFormat` and
  `AdminResourceFormatter` are exported for the prop's type.
- **A field's `render` and `parse`, and a filter's `parse`, stay functions, and are documented as
  what they are.** A custom control and a custom comparison are not expressible as a name, so a
  definition declaring one still cannot cross the client boundary and its page still has to be a
  client component. This is now said in the types and the README rather than discovered at prerender.
- **`createSqlitePersistenceAdapter`** covering both a local `file:` database and hosted Turso, so a
  host gets persistence without writing an adapter. This reverses the package's previous contract,
  which said the adapter types are a seam and do not imply a backend; the seam is still there, it
  just has a default now.
- **Theme settings are a validated contract.** `density` and `accent` are declared, defaulted and
  validated, and a setting that would break the contrast guarantee refuses the value rather than
  accepting it. `useAdminBranding` returns nothing for an accent it would previously have made
  unreadable, and sets `--admin-brand-text`, which it did not before.

### Added

- **`src/charts/`**: `AdminTimeSeriesChart`, `AdminRankChart`, `AdminChartTable`,
  `AdminChartFrame` and the scales, ticks and formatters behind them, with no new dependency. A chart
  reads `--admin-brand-500`, so it follows a host's accent and dark mode.
- **The dashboard widget engine** (`src/dashboard/`, `src/widgets/`): a placement model, a grid, a
  tile loader that reloads per tile rather than per rerender, and a widget registry a host extends.
- **A collection editor** (`src/collections/`) for arranging ordered records over real storage.
- **The credential store and the server-side permission seam**, described above.
- **A typed resource query** with a builder and a parser, described above.
- **A server-safe session guard** and a non-redirecting sibling, described above.
- **`AdminTone`**, the shared severity vocabulary for the status pill, the stat card and the banner.
- **`AdminSortableDndContext` accepts an `id`**, for stable screen reader instruction ids.
- **Theme settings**: `resolveAdminThemeSettings`, `adminThemeSettingsStyle`,
  `AdminThemeSettingsProvider`, `useAdminThemeSettings`, `adminBrandVariables`, `adminDensityScale`
  and `describeAccentRejection`.

### Fixed

- **`AdminDashboardTiles` reloads per tile.** The memo keyed on the loader's identity, so a loader
  written inline in the caller's render reloaded on every rerender, and a settled dashboard issued
  one more load per rerender than a mounted one.
- **`AdminCollectionEditor` handles were inert** without a host-supplied drag context, as above.
- **A debounced search term no longer crosses resources.** A list that carried the previous
  resource's term into the next resource's first query would filter the wrong collection for as long
  as the timer ran.

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
