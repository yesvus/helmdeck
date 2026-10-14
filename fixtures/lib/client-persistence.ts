// SPDX-License-Identifier: MIT
import { createAdminResourceActionPersistenceAdapter } from "@yesvus/helmdeck";
import {
  createResourceAction,
  deleteResourceAction,
  queryPageAction,
  queryResourceAction,
  readResourceAction,
  updateResourceAction,
} from "./resource-actions";

/** Persistence adapters backed by the fixture's guarded server actions. */
const calls = {
  query: queryResourceAction,
  read: readResourceAction,
  create: createResourceAction,
  update: updateResourceAction,
  delete: deleteResourceAction,
};

export const clientPersistence = createAdminResourceActionPersistenceAdapter(calls);

export const pagedClientPersistence = createAdminResourceActionPersistenceAdapter({
  ...calls,
  queryPage: queryPageAction,
});
