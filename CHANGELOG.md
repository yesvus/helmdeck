# Changelog

All notable changes to Helmdeck are recorded here. Versions follow the `VERSION` file, which is
canonical and must match `package.json` and the install command in the README.

Artifacts are distributed as GitHub release tarballs. npm publication is postponed indefinitely, so
upgrading means replacing the exact tarball URL and refreshing the lockfile.

## Unreleased

### Added

- **Saving a record in the starter left the person on the form with nothing to show for it.**
  `AdminResourceForm` writes through the store and then stops, and neither generated page passed
  `onSaved`, so creating a product left the form holding the values just submitted, with no message
  and no link to the record. The save worked; the page said nothing, which is what a person reports
  as "it did not save". Both pages now return to the list, where the row is, and
  `tests/starter-template.test.ts` fails if a generated form goes back to saying nothing.

  Found by driving a generated project in a browser, which is the only way this shows up: the store
  holds the row either way.

- **One command writes a project from the starter template.** `scripts/create-admin-app.mjs <dir>`
  copies `template/` into a directory, rewrites the manifest to pin `@yesvus/helmdeck` to the
  published release tarball rather than to `link:..`, mints `HELMDECK_SESSION_SECRET` into a
  `.env.local` the copied `.gitignore` already ignores, and writes a setup section describing the
  project it just wrote rather than the checkout it was copied from.

  The manifest a host received by copying the directory carried `link:..`, which resolves in this
  repository and nowhere else, so the copy installed a project that built here and failed anywhere
  else. Pinning the release tarball is what makes the starter's value the same question for a host as
  it is here.

  This is a script in the repository rather than `pnpm create` or a published `create-helmdeck`,
  because the package is distributed as a GitHub release tarball and npm publication is postponed, so
  there is no registry for `create-helmdeck` to be resolved from. `npx degit` was the alternative
  considered and rejected: it copies the directory and leaves the manifest holding `link:..`, which is
  the defect above, and it has no step in which to pin a version. A host with no checkout still needs
  one `git clone` first, which is the honest limit of this and the reason the README shows it.

  Options: `--version <tag>` for a release other than the checkout's `VERSION`, `--package-manager`
  for the install command, `--install` to run it, `--force` to write over a directory that already
  holds files, and `--help`. A directory that already holds files is refused with the names in it, and
  a missing template is refused naming every path it looked at, in the same shape as the migrations
  directory.

  Obtain it from a clone of the default branch rather than of a release tag. The command ships in the
  repository and a tag is cut at a release, so a checkout of a tag cut before this change has no
  `scripts/create-admin-app.mjs` in it. `--version` pins a release other than the branch's.

## 0.5.1

### Fixed

- **A write could carry any column the store accepted.** `createAdminResourceActions` authorized which
  operation a session may perform and never restricted which columns that operation reached the store
  with. A definition declaring `name` and `sku` stored whatever the adapter accepted:

  ```json
  {"id":"attacker-chosen","name":"Widget","sku":"W-1","role":"admin","is_privileged":true}
  ```

  Authorization passed because the operation was allowed, and reference checking passed because none of
  those keys name a row. **This is a behaviour change a host may notice**, because a write that used to
  succeed now refuses.

  The writable set is the definition's declared **`columns`**, because that is the stored shape. An
  undeclared key is **refused by name**, not dropped: a silently dropped column leaves the author
  believing a privilege column was written when it was not, which is the same defect pointed the other
  way. `id` is writable on a create, where a host may generate record keys in the browser, and refused
  on an update, where the route already named the record.

  **`writable?: string[]`** on `AdminResourceDefinition` is how a host declares columns its list does not
  show: timestamps, soft-delete flags, denormalised counters. It is additive, per definition, and never
  a global switch.

  A resource **no definition names** is not checked, because the host told the seam nothing about its
  shape, and a single settings row written by a site's own module is exactly that case. A definition
  declaring **no** columns is refused, which is a different statement: that host has said what it
  stores, and what it stores is nothing.

  Two hosts had each written this boundary privately, in their own adapter, which is why it survived:
  the demo and the starter template were protected and the shipped seam was not. Both copies are
  deleted. What the demo keeps is its own policy, that it names every record itself.

  The refusal is decided **after** every permission decision, which is load-bearing: it is a validation
  answer, and `checkReferences` carries a second one, so deciding validation first would let a caller
  learn which keys a definition declares by sending an undeclared one beside a forbidden reference and
  reading which refusal came back.

## 0.5.0

The package now ships working authentication and server-side authorization, both of which it
previously documented as the host's job. A generated list can search, sort, filter and page, and a
CMS can be built on top of it. No exported name was removed: 139 names were exported at 0.4.0 and 283
are exported before the lifecycle, with none of the original 139 gone. The lifecycle adds 13 more
(296 in total) and removes nothing, so this is a minor transition.

The two additions that change what a host has to build are the reason to read this section. Before
them, a host that installed this package and wanted a person to sign in had to write the credential
store, the session store, the expiry and the revocation, and had to write the refusal itself, because
every permission decision the package made was made in a browser.

### Added

- **Visitor analytics: capture and query, over the persistence seam.** `adminAnalyticsRecord` and
  `createAdminAnalyticsRecorder` write a page view or a named event; `adminAnalyticsSeries`,
  `adminAnalyticsTopPaths` and `adminAnalyticsSources` read them back as views, unique visitors, top
  paths with a last-viewed time, and sources, per day. `adminAnalyticsRetain` prunes to a window the
  host names, and `adminAnalyticsRead` is the bounded read underneath. No new runtime dependency, and
  no second implementation of bucketing: every figure is `adminAggregate` over the rows the store
  returned, so the range discipline and the zero for a day nothing landed on are that function's
  rather than a second copy of it.
- **The two decisions on that path are the host's, and the API makes them so rather than saying so.**
  The visitor key is the only way an identity reaches the table, nothing derives or hashes one, and
  there is no default retention window. An event with no key counts as a view and as no visitor, and
  is reported in `totals.unattributed`, because folding unkeyed events into one shared visitor reports
  a unique count of 1 for a busy day and counting each as its own makes "unique" a synonym for
  "views". A host that has decided no row may be written without a key passes `unkeyed: "drop"`.
- **A failed write does not fail the page, and is not swallowed.** `createAdminAnalyticsRecorder`'s
  `record` never throws and never returns a rejected promise, and every failure reaches the host
  through the `onError` sink and the bounded `recorder.failures`. `adminAnalyticsRecord` is the
  strict half for a host that wants the rejection on the request.
- **A range read covers its range or refuses, and never answers from part of one.** The bounds are
  pushed into the store's query where it has a paged one, and that read pages until the range is
  covered, because a store is free to return fewer rows than the window it was asked for and the first
  version read one window and reported whatever came back. Four views of nine, a ranking that was not a
  ranking, and nothing on the chart to say so. Paging is oldest first with the id as the tiebreak, so
  an offset stays correct while the table is being written to; a row that arrives with a backdated
  moment sorts into the gap and arrives as an id seen twice, which is refused rather than absorbed.
  `ADMIN_ANALYTICS_MAX_EVENTS_PER_READ` is `ADMIN_RESOURCE_MAX_LIMIT`, the query contract's own window
  cap, reused so the two cannot drift apart, and it is a ceiling on a whole answer rather than on one
  round trip. Above it the read refuses and names itself. A store that can sum in SQL is the way past
  it.
- **An analytics report: the figures of a range as a file, with a permission check that fits them.**
  `adminAnalyticsReport` writes one row per day, per path and per source with the totals stated in the
  file beside them, `adminAnalyticsReportResponse` is the same file as the response a route hands back,
  and `adminAnalyticsReportFigures` reads a report back as the figures it states. No new runtime
  dependency, and no second implementation of anything the query layer already does: the report reads
  the range through `adminAnalyticsRead`, hands the rows the policy allowed to
  `adminAnalyticsSeries`, `adminAnalyticsTopPaths` and `adminAnalyticsSources`, and every figure in the
  file is the figure a chart would draw. A range is required, because a file of figures with no period
  beside them is a number about an unknown span.
- **A permission check for a figure is a decision about a path, taken before the figure exists.** A
  row-scoped rule answers "may this session read these products", and an analytics report has no row to
  ask about: it has a path, and nine views of `/admin/billing` in a download is the same shape of leak
  as a reference to a row a role may not read. So `pathPolicy` is asked about the path, once per
  distinct path in the range, and a path it refuses contributes to no figure in the file at all, which
  is what lets the daily series, the paths, the sources and the totals agree with one another. A
  whole-report check cannot do this job: it either gives over everything, including a path the role
  may not read, or refuses everything.
- **No policy is not permission, and the file says so.** A host that has not said which paths a session
  may see gets every path withheld, and `manifest,path_policy,none` beside the count of rows the
  policy held back. `rows_withheld` is the row that keeps a refusal from reading as a quiet week, and a
  policy that answers something which is not `true` or `false` is refused rather than read as a
  decision. A `visitorKey` is in the file only when a host names the `visitors` section, which is not
  one of `ADMIN_ANALYTICS_REPORT_DEFAULT_SECTIONS`.
- **Nothing in a report is rounded, and the file says that too.** Every figure is a count and is
  written as the whole number it is, so a column can be summed and held against the total it states;
  there is deliberately no percentage column, because a column of shares does not add up to 100. A
  report is refused rather than truncated above `ADMIN_ANALYTICS_REPORT_MAX_ROWS`, which is left for the
  one thing a host can make a report large with: its own range. The read's own refusal is the report's
  refusal, from the same call with the same error, so a range above
  `ADMIN_ANALYTICS_MAX_EVENTS_PER_READ` produces no file at all.

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
- **The sign-in bound covers attempts that arrive together, and a report names its own attempt.**
  `AdminLoginThrottle.check` was a read: a client firing twenty attempts at once had all twenty of
  them read the count before any of them had recorded a failure, so all twenty reached the password
  and the bound did nothing to the only shape a fast attacker uses. `check` now answers with either
  a refusal and its message or the **reservation** the attempt holds, and `failed` and `succeeded`
  name the reservation they are reporting about, so at most `limit` of a burst reach the comparison
  and a report retires one named attempt rather than a slot off the key's shared count. Naming it
  is what makes the accounting order-independent: without it, two attempts from one key whose
  reports arrived in either order left it in two different states, because a success arriving last
  erased a failure that really happened and a success arriving first left that failure counted
  against a key it had just cleared. Ageing out now retires one named reservation and cannot
  discard a recorded failure filed against a different one, and a report for a reservation the
  store no longer holds is still counted, because the slot it was holding has already been handed
  back and ignoring the report is a free attempt for anyone who can hold a connection open. A
  success forgives the failures recorded before its own attempt was admitted and not the ones after
  it, and retires only its own reservation, so a concurrent attempt still running keeps its slot.

  **This changes the interface, and it is a breaking change to a preview shape rather than to a
  released one.** `check` returns `{ ok: true; reservation } | { ok: false; message }` instead of
  `string | null`, and `failed` and `succeeded` take a second argument. A host with its own
  throttle gets a compile error at `check` naming the union, which is the point: an implementation
  that counts correctly but does not reserve and does not name what it reserved is silently the
  throttle that bounds nothing, and nothing but a type error was ever going to say so. `failed` and
  `succeeded` do not produce one on their own, because TypeScript accepts a function of fewer
  parameters, so a host that fixes only `check` still compiles; the requirement is written on the
  type, and a host whose reports ignore the reservation is the one that has to read it. A
  reservation is an opaque `string`, so a host mints one from whatever its store makes cheaply and
  unique: a row id, a UUID, a Redis `INCR`. Nothing in the package interprets it, and it never
  leaves the server, so it does not have to be unguessable. `createLoginThrottle` ages a
  reservation out with the window by default and takes `reservationMs` for a host that wants it
  shorter.
- **A configured limit is the limit that is enforced, including at zero.** `check` created the
  entry for a key it had never seen and admitted the attempt that arrived first, comparing against
  the limit only from the second attempt onwards, so `limit: 0` still let one password comparison
  happen. A key nobody has looked at yet has spent nothing, so the same comparison now decides the
  first attempt as every one after it, and a limit of zero is zero attempts. `0` is legal and means
  refuse everything, so a form a host has turned off says so through the throttle's own named
  refusal rather than admitting one guess. A limit that is not a whole number is refused at
  construction with a message naming the field, and `NaN` is the reason that check exists: every
  comparison against it is false, so a throttle built with one refuses nothing and bounds nothing.
  `windowMs` and `reservationMs` get the same rule, since a window of zero lapses every key on the
  next read and a lease of zero lapses every reservation on the next read. Hosts that pass a
  mis-sourced number now see a throw at startup rather than a bound that quietly does not exist.
- **A reservation is charged at most once, whichever path its report arrives by.** A report reaches
  the accounting in five states: still reserved, past its lease, a repeat of either, one this
  process never minted, and one whose key has been forgotten. Only the first charged once, and every
  repeat after that charged again, so a request whose report was delivered three times cost a
  visitor three guesses' worth of budget. That charges **more**, not less, so it cannot be used to
  bypass the bound; it locks a slow honest visitor out on the strength of requests they did not make.
  The failures are now keyed by the reservation that reported them rather than held as a list of
  positions, so the record of what has been charged and the failures are one structure and a repeat
  finds it and stops there. The invariant is written on `failed`. It is exact for as long as the
  store remembers the reservation, which is to the end of the key's window, and approximate past
  that: a report more than one `windowMs` after its attempt is charged again, because it cannot be
  told from a first report for a handle from a process that restarted. Making it exact past the
  window would mean remembering every reservation for ever, which is what a window exists to avoid.
  A host with a shared store holds the same map in a hash and gets the same property with the same
  bound, so `reservation` doubles as the key the charged failures are indexed by.
- **A late report is charged where no sign-in can forgive it.** A success forgives the failures
  recorded before its own attempt was admitted, which are compared by the position the attempt was
  admitted at, so a report for a reservation the store no longer holds had to be given a position
  to be filed under. It was given the next value of the same counter the reservations come from,
  which is the reservation the following attempt is about to be handed: the failure and a live
  attempt shared a position, and the next correct password on that key forgave a guess it had
  nothing to do with, so an attacker could take a slot, let its lease lapse, get the slot back, and
  have the resulting failure forgiven by the victim's own sign-in. A late report is now filed above
  every position the throttle can hand out, so it is charged once, stands until the window closes,
  and no `succeeded` forgives it, whichever attempt signed in. A reservation's own serial is the
  ordering, so a host's store has the rule for free: file the report for a row it does not hold at
  one number the store never mints as a row id, and do not draw it from the row counter, whose next
  value belongs to the next attempt. Both halves are written on `failed` and `succeeded`, and the
  invariant itself is unchanged: a reservation is charged at most once whichever path its report
  arrives by, and a charge is charged.
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

- **`src/lifecycle/`**: `createAdminLifecycle`, with no new dependency. Revision history, a soft delete
  with a trash, and a restore from both: the three things a resource engine does not have and a CMS
  cannot be built without. It runs over `AdminPersistenceAdapter`, so a trashed row is gone from every
  ordinary read by being absent rather than by being filtered out of one.

  **A revision is a row the host already has.** `AdminRevisionStore` names the columns a host's own
  history table uses and gives `read` and `write` the projection, so there is no table for this package
  to create and no migration to apply. A flat row of real columns and a single JSON document are one
  `read` and one `write` apart, and neither needs a migration the other does not. The demo's
  `post_revisions` fits as it stands: every column the declaration names is one
  `0005_post_revisions.sql` defines, and the cause a restore writes (`restore`) is one its own `CHECK`
  already admits. **No migration file was changed.** Ordering is a whole number rather than a clock,
  and the revision id derives from the position, so two callers racing for one position ask the store
  for the same id and the second write is refused rather than overwriting the first.

  **A restore answers in three places, and none of them silently.** A revision records the whole row,
  because a revision recording only what changed cannot restore a field somebody deliberately cleared,
  since a cleared field and an untouched one look the same. A field the revision holds and the record
  has is written back. A field the record holds and the revision does not, which is a column added
  since, is **retained** as it is and named in the result: there is no older value to bring back, and
  the two options are keeping the current one or quietly nulling it. A field the revision holds and the
  record no longer has, which is a column dropped since, is **refused by name before anything is
  written**, because writing it would either fail or discard a value without saying which. A caller who
  means it passes `dropFields`, and the loss comes back in `dropped`, so an accepted loss is still a
  stated one. The restore is itself recorded, under the cause `restore`, before the write it replaces,
  so it is reversible by restoring what it replaced. The write is the whole record rather than the
  fields being put back, because a partial write drops every field it did not name on both shipped
  adapters, which is the case this exists not to lose quietly.

  **A soft delete moves a row rather than flagging it.** `softDelete` moves the record into the
  resource named by `trash`. It does not write a `deleted_at` column, because a flag cannot make a
  count agree with its rows: both shipped adapters filter `isNull` and `notNull` on the stored value
  rather than on the field's presence, so a flag-based exclusion misses exactly the rows that were
  never flagged. Moving the row means a live list's count and its rows cannot disagree about a row
  that is not in the table, and a search or a window agrees with a bare list because there is nothing
  to exclude. The row keeps its id, so references stay intact. **Rows pointing at a record being
  taken away are refused by default and named**, because the write boundary refuses a value that names
  a row the store does not hold, so orphaning rows makes them uneditable by anyone afterwards; a host
  declares `on: "trash"` to bring them along or `on: "keep"` to state that losing the target is
  intended. The whole cascade is read before anything is written, so a refusal never leaves rows half
  moved. `lifecycle.trash(resource)` returns an adapter for the generated list which refuses writes
  and routes its `delete` through the guarded `purge` rather than a raw one.

  **`AdminResourceLifecycleOperation` is a separate union from `AdminResourceOperation`, on purpose.**
  Its five members (`readRevisions`, `restoreRevision`, `softDelete`, `restoreFromTrash`, `purge`)
  could have been added to the existing four, and doing so would break every host that switches
  exhaustively over it at compile time. Below 1.0 a consumer has no signal about what a minor may
  take, which is why this repository's exported-surface gate treats removals as build failures; a
  widening is a removal of the guarantee that those four are all of them. The default permission name
  is `resource.operation`, so `posts.restoreRevision` and `posts.softDelete` are separate decisions.

  **`recordRevision` asks no permission**, because it decides nothing about whether a change may
  happen. A host calls it beside its content action, after its own rule has allowed the write, which
  is the difference from recording history inside an audit write: that makes the history depend on the
  audit sink being wired and puts a history entry in the path of every change whether or not anybody
  reads it.

  A trash and a history are independent: declare `trash` for a trash, leave it out and the resource
  keeps its revision history and refuses a soft delete rather than demanding a table the host has not
  built. Trashing something already trashed, restoring something never trashed, and operating on
  something that is not there are all refusals with the state named (`live`, `trashed`, `missing`,
  `both`), and a refused call records no audit event and invalidates no cache key.

  **Publish snapshots are deliberately not here.** A publish snapshot is the row projected onto the
  fields the public site renders, at a moment a workflow chose, and both are host decisions. A host
  that wants them records a revision with the cause `publish` and keeps its own published copy.

- **`src/charts/`**: `AdminTimeSeriesChart`, `AdminRankChart`, `AdminChartTable`,
  `AdminChartFrame` and the scales, ticks and formatters behind them, with no new dependency. A chart
  reads `--admin-brand-500`, so it follows a host's accent and dark mode.
- **`src/aggregate/`**: `adminAggregate`, `adminAggregateTotals` and `adminWholeNumber`, with no new
  dependency. A host installing this package got the charts and the tiles but had to write its own
  measuring: which rows are which period, what a day with no rows is, and a total that agrees with
  the points it is read out loud beside. `adminAggregate` takes rows, a key naming the period a row
  falls on, and any number of measures, over an explicit range. Every period in the range comes back
  holding a zero where nothing landed on it, so a day with no rows is a zero rather than a hole a
  chart draws a straight line across. A row outside the range, or one the key cannot place, reaches
  neither the buckets nor the totals, and is reported as `outOfRange` or `unkeyed` rather than
  dropped. The totals are summed off the buckets rather than accumulated beside them, so a range
  total cannot drift from the series it sits next to. Exactness is checked on every addition, not
  only on each value and not only on the finished answer: two thousand rows of `9_000_000_000_000`
  are each exactly representable and add up to a figure no number holds, and a signed measure that
  goes past the boundary and comes back finishes inside it having dropped the difference on the way.
  Both are refused with the measure and the period named, and a measure of fractions is left alone
  because `0.1 + 0.2` is not `0.3` for reasons unrelated to a boundary. It runs in memory over the rows a host has
  already read, which is the whole of the cost: thirty points can come from a million orders, but
  they come from reading all million of them, and a host whose table outgrows one dashboard range
  needs a query contract rather than a larger array.
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
- **The operator surface over a credential store**: `createAccountAdmin`, for creating an account,
  changing a role, turning one off and back on, listing accounts and live sessions, and ending a
  session by its id. Every operation asks the host's own policy before the store is reached.
  `AccountAlreadyExistsError` makes a duplicate refusal recognisable rather than a string to match.
  `createUserIfAbsent` is the one store write that is safe under concurrency: on the SQLite adapter it
  creates a partial unique index scoped to the resource, which is a constraint appearing in a table the
  host did not write and therefore outlives the call that made it. `createUser` is documented as **not**
  concurrency-safe and says why.
- **A bound on failed sign-ins**: `createLoginThrottle`, `forwardedClientKey`, `loginHeader` and the
  three defaults, passed as `throttle` on the auth adapter. The refusal arrives before the password is
  compared and names itself, so a throttled visitor is not left guessing why. **Its scope is one
  process**, stated rather than implied: a scaled host implements `AdminLoginThrottle` over what its
  processes share.
- **A starter template** (`template/`): a Next.js admin with one rule in `lib/rules.ts`, nothing
  stubbed, and `scripts/create-user.mjs` as the only way to make a first account, so a copied template
  carries no fixture, no demo password and no open registration path.
- **Export and import over a resource**, with no dependency: `adminResourceExport` streams rows a host
  has already authorised through `queryPage`, bounded by `ADMIN_RESOURCE_EXPORT_MAX_ROWS` because a
  file holding the first thousand rows is a file claiming to be the list.
- **`HELMDECK_VERSION`**, generated from the `VERSION` file at build time rather than read at runtime,
  so what a host sees is the version they installed. `pnpm version:check` fails when the two disagree.
- **Theme settings reach the shell.** The settings page offers the declared surface, density and
  accent, and nothing else about the theme: colour mode, the brand variables, the radius and the type
  scale are derived from those two keys, so a control for one is a second place to set a value that
  gets overwritten on the next render. An accent the contract refuses is refused **before it is
  stored**, the reason is shown in a `role="alert"` naming the contrast ratio that decided it, and the
  field shows the accent that is actually stored rather than the one turned down.

### Fixed

- **`AdminDashboardTiles` reloads per tile.** The memo keyed on the loader's identity, so a loader
  written inline in the caller's render reloaded on every rerender, and a settled dashboard issued
  one more load per rerender than a mounted one.
- **`AdminCollectionEditor` handles were inert** without a host-supplied drag context, as above.
- **A debounced search term no longer crosses resources.** A list that carried the previous
  resource's term into the next resource's first query would filter the wrong collection for as long
  as the timer ran.
- **The demo brings its own schema up to date at boot** (`fixtures/lib/migrate.ts`). Seven migration
  files had shipped while the deployed database sat at migration two, so a deploy of code reading
  `landing_sections` met a table the database had never had, and every request that touched the seed
  failed, sign-in included. `scripts/apply-migrations` already existed and did this correctly; nothing
  referenced it, and it needs a named target and the `turso` CLI, so only a person who knew to could run
  it. The runner applies the same files against the same `schema_migrations` ledger at boot.
- **A settings row falls back per value** rather than being treated as unread when one field is
  unrecognised. A row written before `density` existed, or carrying a density this build does not know,
  still held a good site name and a good accent, and both were replaced by the defaults.

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
