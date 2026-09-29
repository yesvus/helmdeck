// SPDX-License-Identifier: MIT

export type AdminWidgetMessages = {
  emptyTitle: string;
  emptyBody: string;
  errorTitle: string;
  retry: string;
};

export const defaultWidgetMessages: AdminWidgetMessages = {
  emptyTitle: "Nothing to show",
  emptyBody: "There is no data for this widget yet.",
  errorTitle: "This widget could not load",
  retry: "Try again",
};
