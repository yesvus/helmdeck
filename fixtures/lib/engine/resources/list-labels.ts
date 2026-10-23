// SPDX-License-Identifier: MIT

/**
 * The strings the list's query controls carry.
 *
 * A resource's own `label` prop overrides them, the way it already overrides the empty state and
 * the failure message, so a host translates one object rather than a component's internals. The
 * pagination control keeps its own: it is a primitive with its own labels and its own place in
 * the dictionary, and a second set of overrides here would be a second source for one fact.
 */
export type AdminResourceListQueryLabels = {
  /** The search box's accessible name. */
  search: string;
  searchPlaceholder: string;
  /** The unset choice on a filter with declared options. */
  all: string;
  /** Spoken after a column name when the list is ordered by it. */
  ascending: string;
  descending: string;
  resultCount: (from: number, to: number, total: number) => string;
  /** Shown instead of the empty state when a search or filter is what emptied the list. */
  noMatches: string;
  noMatchesBody: string;
};

export const defaultAdminResourceListQueryLabels: AdminResourceListQueryLabels = {
  search: "Search",
  searchPlaceholder: "Search this list",
  all: "All",
  ascending: "ascending",
  descending: "descending",
  resultCount: (from, to, total) => `Showing ${from} to ${to} of ${total}`,
  noMatches: "No records match what you searched for.",
  noMatchesBody: "A different term, or a cleared filter, may find them.",
};
