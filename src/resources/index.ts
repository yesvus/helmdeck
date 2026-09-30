// SPDX-License-Identifier: MIT
export {
  absentRequired,
  adminResourceFilters,
  adminResourcePath,
  adminResourceRecordId,
  adminResourceReference,
  adminResourceReferenceValue,
  adminResourceValues,
  defineAdminResource,
} from "./registry.js";
export type {
  AdminResourceColumn,
  AdminResourceColumnFormat,
  AdminResourceDefinition,
  AdminResourceField,
  AdminResourceFilterDefinition,
  AdminResourceFormatter,
  AdminResourceRecord,
  AdminResourceReference,
} from "./registry.js";
export { defaultAdminResourceListQueryLabels } from "./list-labels.js";
export type { AdminResourceListQueryLabels } from "./list-labels.js";
export { defaultAdminResourceReferenceLabels } from "./reference-labels.js";
export type { AdminResourceReferenceLabels } from "./reference-labels.js";
export {
  ADMIN_RESOURCE_REFERENCE_LIMIT,
  adminResourceReferenceChoices,
  adminResourceReferenceKey,
  adminResourceReferenceLabel,
  adminResourceReferenceResolution,
} from "./references.js";
export type {
  AdminResourceReferenceChoices,
  AdminResourceReferenceRequest,
  AdminResourceReferenceResolution,
} from "./references.js";
export { AdminResourceForm, AdminResourceList } from "./views.js";
export {
  AdminResourceNotExposedError,
  AdminResourceReferenceError,
  createAdminResourceActions,
} from "./actions.js";
export type { AdminResourceActions, AdminResourceOperation } from "./actions.js";
