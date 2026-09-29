// SPDX-License-Identifier: MIT
export type {
  AdminAuthAdapter,
  AdminLoginCredentials,
  AdminLoginResult,
} from "./auth.js";
export type {
  AdminNavGroup,
  AdminNavIconComponent,
  AdminNavIconName,
  AdminNavItem,
} from "./nav.js";
export {
  filterNavGroups,
  findNavItemAt,
  getAdminHrefPathname,
  flattenNavItems,
  isActiveHref,
  isNavItemVisible,
} from "./nav.js";
export type {
  AdminMediaAdapter,
  AdminMediaExternalInput,
  AdminMediaItem,
  AdminMediaKind,
  AdminMediaListQuery,
  AdminMediaListResult,
  AdminMediaSource,
  AdminMediaUploadOptions,
  AdminMediaUsage,
} from "./media.js";
export type { AdminSession } from "./session.js";
// The builder and the parser are exported because a host implements the query, and implementing it by
// hand is where the guessing this contract exists to close comes back: a hand-built object typed as
// `AdminResourceQuery` compiles whether or not its operator is real. `parseAdminResourceQuery` is the
// answer to "is this the query I think it is", and `adminResourceQuery` builds one that is.
export { ADMIN_RESOURCE_MAX_LIMIT, adminResourceQuery, parseAdminResourceQuery } from "./query.js";
export type { AdminResourceQueryBuilder } from "./query.js";
export type {
  AdminResourceFilter,
  AdminResourceFilterOperator,
  AdminResourceFilterValue,
  AdminResourcePage,
  AdminResourceQuery,
  AdminResourceSort,
  AdminResourceWindow,
} from "./query.js";
export type {
  AdminAuditAdapter,
  AdminAuditEvent,
  AdminCacheInvalidationAdapter,
  AdminHostAdapters,
  AdminLocaleAdapter,
  AdminPermission,
  AdminPermissionsAdapter,
  AdminPersistenceAdapter,
  AdminPreviewAdapter,
} from "./host.js";
