// SPDX-License-Identifier: MIT

export type AdminCollectionMessages = {
  add: string;
  remove: string;
  duplicate: string;
  edit: string;
  emptyTitle: string;
  emptyBody: string;
};

export const defaultCollectionMessages: AdminCollectionMessages = {
  add: "Add",
  remove: "Remove",
  duplicate: "Duplicate",
  edit: "Edit",
  emptyTitle: "Nothing here yet",
  emptyBody: "Add the first entry to get started.",
};
