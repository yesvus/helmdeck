import {
  adminResourceValues,
  createAdminResourceActions,
  type AdminPersistenceAdapter,
  type AdminResourceDefinition,
} from "@yesvus/helmdeck";
import { persistence } from "./persistence";
import { adminResources } from "./resources";
import { exposedResource, requirePermission } from "./rules";

/**
 * The write boundary, and the store behind it.
 *
 * A resource name arrives from the browser as a string the caller chose, so every call is checked
 * against the exposed set before the session is resolved, and then against the one rule before the
 * effect runs. `createAdminResourceActions` is the package's, built once here rather than per call
 * site, so no action can be the one that forgot.
 */
function definitionFor(resource: string): AdminResourceDefinition {
  const definition = adminResources.find((candidate) => candidate.resource === resource);
  // Unreachable through the calls below, because the exposed set is built from these definitions.
  // Refusing rather than passing the value through is what makes that a fact about the store
  // instead of an assumption about the code above it.
  if (!definition) throw new Error(`No resource definition names ${resource}`);
  return definition;
}

/**
 * A write narrowed to the fields the definition declares, read on the server.
 *
 * `adminResourceValues` is what the generated forms call in the browser, so calling it here is what
 * makes the two agree about a record's shape. Without it, a hand-edited request that never went
 * through a form could set a field the definition dropped, or an `id` the caller chose, and the
 * write would succeed. The form's filtering is not a boundary; this is.
 */
function declaredFields(resource: string, value: unknown): Record<string, unknown> {
  const incoming = (value ?? {}) as Record<string, unknown>;
  const form = new FormData();
  for (const [key, entry] of Object.entries(incoming)) {
    form.append(key, entry === null || entry === undefined ? "" : String(entry));
  }
  return adminResourceValues(definitionFor(resource), form);
}

/** The same adapter with `create` and `update` narrowed. Reads pass straight through. */
const bounded: AdminPersistenceAdapter = {
  ...persistence,
  create: <T>(resource: string, value: unknown) => persistence.create<T>(resource, declaredFields(resource, value)),
  update: <T>(resource: string, id: string, value: unknown) =>
    persistence.update<T>(resource, id, declaredFields(resource, value)),
};

export const resourceActions = createAdminResourceActions({
  guard: requirePermission,
  persistence: bounded,
  expose: exposedResource,
  // Read for the references the definitions declare and nothing else, which is what lets a write
  // carrying a value that names a row be refused before it reaches a table.
  definitions: adminResources,
});
