// SPDX-License-Identifier: MIT

export type AdminDashboardMessages = {
  empty: string;
  missingWidget: (widget: string) => string;
};

export const defaultDashboardMessages: AdminDashboardMessages = {
  empty: "This dashboard has no widgets yet.",
  missingWidget: (widget) =>
    `This dashboard refers to a widget called "${widget}", which this build does not provide.`,
};
