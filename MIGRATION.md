# Migrating to Payload as the CMS

The next major version retires the resource engine. Payload does what that
engine did, and does it better: the collections, the fields, the versions, the
drafts, the trash, the uploads and the accounts are all Payload's, and Helmdeck
keeps the half Payload has no answer for: the shell, the primitives, the theme,
the dashboard, the charts, the analytics, the activity trail, the media library
and the inbox.

**This note says what a host replaces each retired export with, and what a host
keeps.** It is written before the removals, so that a host can read it against
the version it is on.

## What a host keeps

- The shell, the primitives, the theme, the dashboard, the charts, the
  analytics, the activity trail, the media library and the inbox.
- The auth contract. A host still decides who is signed in, how long the
  session lasts and how it is revoked; the session is now a row in Payload's
  users collection and the auth strategy reads it.
- The permission contract. A host still decides what a session may do; the
  rule is Payload's access function and the permission adapter asks it.
- **`AdminResourceReadOnlySource` and `createReadOnlyPersistenceAdapter`**, the
  read-only path. A host that shows a table that is not a Payload collection
  keeps this: it is a source of rows for a list, with no writes and no form.
- `createSessionSigner` and `createSessionAuthAdapter`, for a host that signs
  its own cookie rather than reading a row.

## The six steps

The procedure a host follows is in the README, under "The six steps that put
Payload under Helmdeck". Each step names the file in the demo that implements
it and what goes wrong when the step is skipped.

The one to not skip is the call site. Payload's `overrideAccess` **defaults to
`true`**, so a call that forgets it reads and writes with no access control at
all and behaves exactly as though it were correct. There is no error, no
warning and no log line for the omission. So every call goes through
`createAdminPayloadContent`, which passes `overrideAccess: false` and the
session's user together, and a request with no session is refused before it
reaches Payload.

## The retired exports

### The resource engine

The collection, the field and the form are Payload’s. A host that keeps a table of its own keeps the read-only source below.

- `ADMIN_RESOURCE_REFERENCE_LIMIT`
- `AdminResourceActionHandlers`
- `AdminResourceActions`
- `AdminResourceColumn`
- `AdminResourceColumnFormat`
- `AdminResourceDefinition`
- `AdminResourceField`
- `AdminResourceFieldError`
- `AdminResourceFilterDefinition`
- `AdminResourceForm`
- `AdminResourceFormatter`
- `AdminResourceHistoryActions`
- `AdminResourceHistoryPanel`
- `AdminResourceList`
- `AdminResourceListQueryLabels`
- `AdminResourceNotExposedError`
- `AdminResourceOperation`
- `AdminResourceReadOnlySource`
- `AdminResourceRecord`
- `AdminResourceReference`
- `AdminResourceReferenceChoices`
- `AdminResourceReferenceError`
- `AdminResourceReferenceLabels`
- `AdminResourceReferenceRequest`
- `AdminResourceReferenceResolution`
- `absentRequired`
- `adminResourceFilters`
- `adminResourcePath`
- `adminResourceRecordId`
- `adminResourceReference`
- `adminResourceReferenceChoices`
- `adminResourceReferenceKey`
- `adminResourceReferenceLabel`
- `adminResourceReferenceResolution`
- `adminResourceReferenceValue`
- `adminResourceValues`
- `adminResourceValuesFromRecord`
- `createAdminResourceActionPersistenceAdapter`
- `createAdminResourceActions`
- `createReadOnlyPersistenceAdapter`
- `defaultAdminResourceListQueryLabels`
- `defaultAdminResourceReferenceLabels`
- `defineAdminResource`

### The baseline stores and the credential store

The session is one row in Payload’s users collection and the rule is Payload’s access function. A host that wants a signed cookie keeps `createSessionSigner` and `createSessionAuthAdapter`.

- `AccountAdmin`
- `AccountAdminPolicy`
- `AccountAlreadyExistsError`
- `AccountChanges`
- `AccountRecord`
- `AccountRefusal`
- `AccountRefusalReason`
- `AccountResult`
- `AccountSession`
- `AdminLoginAttempt`
- `AdminLoginHeaders`
- `AdminLoginThrottle`
- `AdminSessionCookieIO`
- `AdminTenant`
- `AdminTenantError`
- `AdminTenantResolver`
- `CREDENTIAL_SESSIONS_SCHEMA`
- `CREDENTIAL_USERS_SCHEMA`
- `CreateAccountInput`
- `CredentialAuthAdapter`
- `CredentialAuthOptions`
- `CredentialColumnOptions`
- `CredentialRevocation`
- `CredentialSession`
- `CredentialStore`
- `CredentialStoreOptions`
- `CredentialUser`
- `DEFAULT_INVALID_MESSAGE`
- `DEFAULT_SESSION_COOKIE`
- `DEFAULT_SESSION_MAX_AGE`
- `DEFAULT_THROTTLED_MESSAGE`
- `DEFAULT_THROTTLE_LIMIT`
- `DEFAULT_THROTTLE_WINDOW_MS`
- `LoginReservation`
- `LoginThrottleDecision`
- `LoginThrottleOptions`
- `MemoryRecord`
- `NewAccount`
- `PostgresClient`
- `PostgresPersistenceOptions`
- `PostgresResult`
- `PostgresSchemaOptions`
- `SqlitePersistenceOptions`
- `assertAdminTenant`
- `authenticate`
- `createAccountAdmin`
- `createAuditAdapter`
- `createCacheAdapter`
- `createCredentialAuthAdapter`
- `createLoginThrottle`
- `createMemoryPersistenceAdapter`
- `createPersistenceCredentialStore`
- `createPostgresPersistenceAdapter`
- `createSessionAuthAdapter`
- `createSessionSigner`
- `createSqlitePersistenceAdapter`
- `createTenantScopedPersistenceAdapter`
- `currentAdminTenant`
- `forwardedClientKey`
- `generateSessionSecret`
- `hasAdminTenant`
- `hashPassword`
- `loginHeader`
- `missingTenantReason`
- `normalizeEmail`
- `postgresIndexStatement`
- `postgresSchema`
- `postgresTenancyMigration`
- `requireAdminTenant`
- `resolveAdminTenant`
- `resolveSessionCookie`
- `runWithAdminTenant`
- `sessionCookieOptions`
- `verifyPassword`

### The lifecycle

Payload keeps the versions, the drafts and the deleted documents, so the history panel reads Payload’s versions collection.

- `AdminChildDeclaration`
- `AdminLifecycle`
- `AdminLifecycleChildError`
- `AdminLifecycleDeclaration`
- `AdminLifecycleError`
- `AdminLifecycleMove`
- `AdminLifecycleNotDeclaredError`
- `AdminLifecycleRecordState`
- `AdminLifecycleReferrer`
- `AdminLifecycleScope`
- `AdminLifecycleScopeError`
- `AdminLifecycleStateError`
- `AdminResourceLifecycleOperation`
- `AdminRevision`
- `AdminRevisionDriftError`
- `AdminRevisionMalformedError`
- `AdminRevisionRecordOptions`
- `AdminRevisionRestore`
- `AdminRevisionRestoreOptions`
- `AdminRevisionStore`
- `AdminRevisionUnknownError`
- `AdminRevisionWrite`
- `adminRevision`
- `adminRevisionId`
- `byNewestRevision`
- `createAdminLifecycle`
- `revisionIdOf`

### The collection editor

The editor is Payload’s own admin panel, themed with the package’s tokens.

- `AdminCollectionDefinition`
- `AdminCollectionEditor`
- `AdminCollectionEntry`
- `AdminCollectionField`
- `AdminCollectionMessages`
- `AdminCollectionValidationProblem`
- `adminCollectionAdd`
- `adminCollectionDuplicateAt`
- `adminCollectionEntryId`
- `adminCollectionFirstProblem`
- `adminCollectionFormData`
- `adminCollectionIds`
- `adminCollectionMove`
- `adminCollectionNextId`
- `adminCollectionRemoveAt`
- `adminCollectionReorder`
- `adminCollectionShift`
- `adminCollectionValidate`
- `adminCollectionValues`
- `defaultCollectionMessages`

### The account management

The accounts are Payload’s users collection and the sign-in is Payload’s auth strategy.

- `AdminUserManagementMessages`
- `AdminUserManagementPage`
- `AdminUserManagementPageProps`
- `AdminUserManagementRecord`
- `defaultAdminUserManagementMessages`
- `turkishAdminUserManagementMessages`

### The trash

The deleted documents are Payload’s versions with a deleted state.

- `AdminTrashItem`
- `AdminTrashMessages`
- `AdminTrashPage`
- `defaultAdminTrashMessages`
- `turkishAdminTrashMessages`

### The import

A host that imports rows writes them through the content module.

- `ADMIN_RESOURCE_IMPORT_MAX_FAILURES`
- `AdminCsvRecord`
- `AdminCsvSource`
- `AdminResourceImportColumn`
- `AdminResourceImportError`
- `AdminResourceImportFailure`
- `AdminResourceImportOptions`
- `AdminResourceImportOutcome`
- `AdminResourceImportResult`
- `AdminResourceImportStop`
- `AdminResourceImportWriter`
- `adminCsvCellValue`
- `adminCsvRecords`
- `adminResourceImport`
- `adminResourceImportResult`

### The export

A host that exports rows reads them through the content module.

- `ADMIN_RESOURCE_EXPORT_MAX_ROWS`
- `AdminResourceExport`
- `AdminResourceExportColumn`
- `AdminResourceExportError`
- `AdminResourceExportFinished`
- `AdminResourceExportOptions`
- `AdminResourceExportOptionsWithName`
- `AdminResourceExportSource`
- `adminCsvCell`
- `adminCsvText`
- `adminResourceExport`
- `adminResourceExportResponse`

### The aggregate

The dashboard tiles read through the loaders in the payload module.

- `AdminAggregateBucket`
- `AdminAggregateMeasures`
- `AdminAggregateOptions`
- `AdminAggregateResult`
- `AdminAggregateTotalsOptions`
- `adminAggregate`
- `adminAggregateTotals`
- `adminWholeNumber`

### The analytics export

The report is read through the content module and exported by the host.

- `ADMIN_ANALYTICS_REPORT_COLUMNS`
- `ADMIN_ANALYTICS_REPORT_DEFAULT_SECTIONS`
- `ADMIN_ANALYTICS_REPORT_MANIFEST`
- `ADMIN_ANALYTICS_REPORT_MAX_ROWS`
- `ADMIN_ANALYTICS_REPORT_REQUIRED_MANIFEST`
- `ADMIN_ANALYTICS_REPORT_SECTIONS`
- `ADMIN_ANALYTICS_REPORT_TOTALS`
- `AdminAnalyticsPathPolicy`
- `AdminAnalyticsReport`
- `AdminAnalyticsReportFigures`
- `AdminAnalyticsReportManifestMetric`
- `AdminAnalyticsReportOptions`
- `AdminAnalyticsReportOptionsWithName`
- `AdminAnalyticsReportRow`
- `AdminAnalyticsReportSection`
- `AdminAnalyticsReportTotal`
- `AdminAnalyticsReportTotals`
- `AdminAnalyticsReportVisitor`
- `adminAnalyticsReport`
- `adminAnalyticsReportFigures`
- `adminAnalyticsReportResponse`
- `analyticsReportCells`
- `analyticsReportHeader`
- `analyticsReportHeaderCells`
- `analyticsReportTotalField`

## The adapters that go with them

- `AdminPersistenceAdapter`, `AdminResourceQuery`, `AdminResourcePage`,
  `AdminResourceFilter`, `AdminResourceSort`, `AdminResourceWindow`,
  `AdminResourceQueryBuilder` and `AdminResourceQueryError` are the query
  contract the engine read through. A host reads through
  `createAdminPayloadPersistenceAdapter` instead, which answers the same
  questions over Payload.
- `AdminMediaAdapter`, `AdminMediaItem`, `AdminMediaListQuery`,
  `AdminMediaListResult`, `AdminMediaUploadOptions` and
  `AdminMediaExternalInput` are the media contract. A host reads through
  `createAdminPayloadMediaAdapter` instead, over Payload's upload collection.
- `AdminActivityPage` and `AdminTrashPage` are the pages over those two
  stores. Payload's admin panel and the activity trail replace them.

## When

The removals land in one major release, not in a patch. A minor release that
took an export away would be a release a host could not plan for, and the
package's own rule is that a name removed in a minor or a patch is a failure
rather than a change.
