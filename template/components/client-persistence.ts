import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";
import {
  createResource,
  deleteResource,
  queryResourcePage,
  queryResources,
  readResource,
  updateResource,
} from "@/app/actions/resource-actions";

/**
 * `AdminPersistenceAdapter` answered over server actions, for the views that render in a browser.
 *
 * Constants rather than a factory. Both generated views list `persistence` among the dependencies
 * of the effect that loads their rows, so a fresh object per render reloads on every render and the
 * list never settles.
 */
export const clientPersistence: AdminPersistenceAdapter = {
  query: queryResources,
  queryPage: queryResourcePage,
  read: readResource,
  create: createResource,
  update: updateResource,
  delete: deleteResource,
};
