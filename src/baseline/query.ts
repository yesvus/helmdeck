// SPDX-License-Identifier: MIT
/**
 * The resource query, reached from the baseline.
 *
 * The two shipped adapters both have to read a query, and both live one directory below the package
 * root. A value import from this directory across to `src/adapters` resolves for `tsc` and for the
 * test suite and fails the fixture's own build, because the bundler resolves this subpath's relative
 * imports differently from the root entry's. The type-only imports the adapters used before were
 * erased before resolution, so nothing noticed.
 */
export {
  ADMIN_RESOURCE_MAX_LIMIT,
  adminResourceQuery,
  parseAdminResourceQuery,
} from "../adapters/index.js";
export type {
  AdminResourceFilter,
  AdminResourceFilterOperator,
  AdminResourceFilterValue,
  AdminResourcePage,
  AdminResourceQuery,
  AdminResourceQueryBuilder,
  AdminResourceSort,
  AdminResourceWindow,
} from "../adapters/index.js";
