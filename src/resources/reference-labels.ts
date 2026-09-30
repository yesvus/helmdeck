// SPDX-License-Identifier: MIT

/**
 * The strings a reference draws, in one object for both halves of a view.
 *
 * A form and a filter over the same reference say the same things about a value that names nothing,
 * so the words are one set rather than a prop on each component. A host translates this object, the
 * way it already translates the list's query labels.
 */
export type AdminResourceReferenceLabels = {
  /** The choice that names no row, in a form over an optional reference. */
  none: string;
  /** The choice that names no row, in a form over a required one, where the save is then refused. */
  choose: string;
  /** Shown in a cell whose value names a row the store does not hold. */
  missing: string;
  /** Shown in a cell whose value names a row this session may not read. */
  unreadable: string;
  /** Said under a form's control when the rows it offers are not this session's to read. */
  unreadableNote: string;
  /**
   * The value the form already holds, offered as its own option when the store's window did not
   * carry it. A form that dropped it would erase a real reference the moment somebody saved an
   * unrelated field.
   */
  held: (value: string) => string;
  /**
   * Said under a control when the store holds more rows than the window it asked for carried, which
   * is the difference between a list of the choices and a window onto them.
   */
  windowNote: (shown: number, total: number) => string;
};

export const defaultAdminResourceReferenceLabels: AdminResourceReferenceLabels = {
  none: "None",
  choose: "Choose one",
  missing: "No such row",
  unreadable: "Not available",
  unreadableNote: "This session cannot read the rows this names, so only the current value is offered.",
  held: (value) => `${value} (current value)`,
  windowNote: (shown, total) => `Showing ${shown} of ${total}. Narrow the list to reach the rest.`,
};
