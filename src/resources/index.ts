// SPDX-License-Identifier: MIT
export {
  absentRequired,
  adminResourcePath,
  adminResourceRecordId,
  adminResourceValues,
  defineAdminResource,
} from "./registry.js";
export type {
  AdminResourceColumn,
  AdminResourceDefinition,
  AdminResourceField,
  AdminResourceFilterDefinition,
  AdminResourceRecord,
} from "./registry.js";
export { defaultAdminResourceListQueryLabels } from "./list-labels.js";
export type { AdminResourceListQueryLabels } from "./list-labels.js";
export { AdminResourceForm, AdminResourceList } from "./views.js";
export { AdminResourceNotExposedError, createAdminResourceActions } from "./actions.js";
export type { AdminResourceActions, AdminResourceOperation } from "./actions.js";
