# Migrating to Payload as the CMS

The next major version, `1.0.0`, retires the resource engine. Payload does what
that engine did, and does it better: the collections, the fields, the versions,
the drafts, the trash, the uploads and the accounts are all Payload's, and
Helmdeck keeps the half Payload has no answer for: the shell, the primitives,
the theme, the dashboard, the charts, the analytics, the activity trail, the
media library and the inbox.

**This note says what a host replaces each retired export with, and what a host
keeps.** It is written before the removals, so that a host can read it against
the version it is on.

## What a host keeps

- The shell, the primitives, the theme, the dashboard, the charts, the
  analytics, the activity trail, the media library and the inbox.
- The auth contract. A host still decides who is signed in, how long the
  session lasts and how it is revoked; the session is now a row in Payload's
  users collection and the auth strategy reads it. A host that signs its own
  cookie keeps `createSessionAuthAdapter`, `generateSessionSecret` and the
  `AdminSessionCookieIO` type from `@yesvus/helmdeck/baseline`.
- The permission contract. A host still decides what a session may do; the
  rule is Payload's access function and the permission adapter asks it.
- **The query contract**: `AdminResourceQuery`, `AdminResourceFilter`,
  `AdminResourceSort`, `AdminResourceWindow`, `AdminResourcePage`,
  `adminResourceQuery`, `parseAdminResourceQuery` and
  `ADMIN_RESOURCE_MAX_LIMIT`. It is not the engine's, it is the shape every
  store answers: `createAdminPayloadPersistenceAdapter` returns it, the scope
  provider parses a request through it, and a host's own store implements it.
- **The persistence contract**: `AdminPersistenceAdapter` and
  `AdminResourceReadOnlySource`, with `createReadOnlyPersistenceAdapter`. A host
  that shows a table that is not a Payload collection keeps the read-only path:
  it is a source of rows for a list, with no writes and no form.
- **The collections model and editor**: `AdminCollectionEntry`, the
  `adminCollection*` helpers, `AdminCollectionEditor` and
  `adminDashboardCollection`. The dashboard's arrangement is a collection of
  placements, and the editor that reorders it is the same editor as before.
- **The aggregate helpers**: `adminAggregate`, `adminAggregateTotals` and
  `adminWholeNumber`. The analytics module computes its figures with them, and
  a host's own tiles can too: they take the persistence contract, not the
  engine.
- **The activity trail**: `AdminActivityTimeline`, `AdminActivityPage`,
  `adminActivityTone` and the activity messages. The trail reads events; they
  arrive from `createAdminPayloadActivityLoader` or from the host's own loader,
  so the component and its wording stay.
- **The tenancy rules**: `AdminTenantError`, `assertAdminTenant`,
  `resolveAdminTenant`, `runWithAdminTenant` and
  `createTenantScopedPersistenceAdapter`, on the `@yesvus/helmdeck/baseline`
  and `@yesvus/helmdeck/tenant-scope` entry points. A tenant scope wraps any
  adapter, including one over Payload.

## The six steps

The procedure a host follows is on the documentation catalog, under the six
steps that put Payload under Helmdeck: <https://helmdeck-web.vercel.app/catalog/payload>.
Each step names the file in the demo that implements it and what goes wrong
when the step is skipped.

The one to not skip is the call site. Payload's `overrideAccess` **defaults to
`true`**, so a call that forgets it reads and writes with no access control at
all and behaves exactly as though it were correct. There is no error, no
warning and no log line for the omission. So every call goes through
`createAdminPayloadContent`, which passes `overrideAccess: false` and the
session's user together, and a request with no session is refused before it
reaches Payload.

## The retired exports

### The generated resource views

The collection, the field and the form are Payload's own admin panel. A host
that keeps a table of its own keeps the read-only path in "What a host keeps"
above.

- `AdminResourceFieldError`
- `AdminResourceForm`
- `AdminResourceList`
- `AdminResourceNotExposedError`
- `absentRequired`
- `adminResourceValues`
- `adminResourceValuesFromRecord`

### The resource definitions and the references

The fields are Payload's, and a relation is a field on a collection rather than
a definition the package resolves.

- `ADMIN_RESOURCE_REFERENCE_LIMIT`
- `AdminResourceReferenceError`
- `adminResourceFilters`
- `adminResourcePath`
- `adminResourceRecordId`
- `adminResourceReference`
- `adminResourceReferenceChoices`
- `adminResourceReferenceKey`
- `adminResourceReferenceLabel`
- `adminResourceReferenceResolution`
- `adminResourceReferenceValue`
- `defaultAdminResourceReferenceLabels`
- `defineAdminResource`

### The write boundary

A write is Payload's, refused by an access function before it runs. The action
handlers that wrapped the store's writes, checked them against a definition and
audited them are the engine's, and they go with it.

- `createAdminResourceActionPersistenceAdapter`
- `createAdminResourceActions`

### The lifecycle

Payload keeps the versions, the drafts and the deleted documents, so the
history panel reads Payload's versions collection.

- `AdminLifecycleChildError`
- `AdminLifecycleError`
- `AdminLifecycleNotDeclaredError`
- `AdminLifecycleScopeError`
- `AdminLifecycleStateError`
- `AdminRevisionDriftError`
- `AdminRevisionMalformedError`
- `AdminRevisionUnknownError`
- `adminRevision`
- `adminRevisionId`
- `byNewestRevision`
- `createAdminLifecycle`
- `revisionIdOf`

### The account management page

The accounts are Payload's users collection and the sign-in is Payload's auth
strategy.

- `AdminUserManagementPage`
- `defaultAdminUserManagementMessages`
- `turkishAdminUserManagementMessages`

### The trash page

The deleted documents are Payload's versions with a deleted state.

- `AdminTrashPage`
- `defaultAdminTrashMessages`
- `turkishAdminTrashMessages`

### The import

A host that imports rows writes them through the content module.

- `ADMIN_RESOURCE_IMPORT_MAX_FAILURES`
- `AdminResourceImportError`
- `adminCsvCellValue`
- `adminCsvRecords`
- `adminResourceImport`
- `adminResourceImportResult`

### The export

A host that exports rows reads them through the content module.

- `ADMIN_RESOURCE_EXPORT_MAX_ROWS`
- `AdminResourceExportError`
- `adminCsvCell`
- `adminCsvText`
- `adminResourceExport`
- `adminResourceExportResponse`

### The analytics export

The report is read through the content module and exported by the host.

- `ADMIN_ANALYTICS_REPORT_DEFAULT_SECTIONS`
- `ADMIN_ANALYTICS_REPORT_MAX_ROWS`
- `ADMIN_ANALYTICS_REPORT_SECTIONS`
- `adminAnalyticsReport`
- `adminAnalyticsReportFigures`
- `adminAnalyticsReportResponse`

### The baseline stores

The database is Payload's: `payloadDatabase()` points at the same libsql or
Postgres URL the demo uses. The accounts, the sessions and the login are
Payload's auth. What a host keeps on this entry point is named in "What a host
keeps" above.

- `AccountAlreadyExistsError`
- `CREDENTIAL_SESSIONS_SCHEMA`
- `CREDENTIAL_USERS_SCHEMA`
- `DEFAULT_THROTTLE_LIMIT`
- `DEFAULT_THROTTLE_WINDOW_MS`
- `DEFAULT_THROTTLED_MESSAGE`
- `authenticate`
- `createAccountAdmin`
- `createCredentialAuthAdapter`
- `createLoginThrottle`
- `createMemoryPersistenceAdapter`
- `createPersistenceCredentialStore`
- `createPostgresPersistenceAdapter`
- `createSqlitePersistenceAdapter`
- `forwardedClientKey`
- `hashPassword`
- `loginHeader`
- `normalizeEmail`
- `postgresIndexStatement`
- `postgresSchema`
- `postgresTenancyMigration`
- `verifyPassword`

## When

The removals land in one major release, not in a patch: `1.0.0`. A minor
release that took an export away would be a release a host could not plan for,
and the package's own rule is that a name removed in a minor or a patch is a
failure rather than a change. `pnpm surface:check` holds that rule: every name
recorded in `scripts/exported-surface.json` that the build no longer exports
fails the check, and the fix it names is restoring the name or cutting a major.
The ledger is re-recorded by the release itself, in the same commit as
`VERSION`, so the release that takes these names away is the one that records
their absence.
