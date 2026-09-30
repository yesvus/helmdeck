import { createAdminResourceActions } from "@yesvus/helmdeck";
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
 *
 * There is no narrowing of the value here, and there was once. A hand-edited request that never went
 * through a form could set a field the definition dropped, or an `id` the caller chose, so this file
 * filtered every write through `adminResourceValues` and the template's boundary was the safe one.
 * The package enforces both itself now, before the store is reached, and a second copy of a boundary
 * is a second thing to forget: the fixture kept one for months while the shipped boundary was open,
 * and the tests were asserting the copy rather than the package.
 */
export const resourceActions = createAdminResourceActions({
  guard: requirePermission,
  persistence,
  expose: exposedResource,
  // Read for the columns a write is held to and the references they declare. A definition naming a
  // key a write does not carry is not a problem, and a write naming a key no definition declares is
  // refused before it reaches a table.
  definitions: adminResources,
});