// SPDX-License-Identifier: MIT
import type { ReactNode } from "react";
import type { AdminPermission } from "../adapters/index.js";
import {
  isAdminResourceField,
  type AdminResourceFilterOperator,
  type AdminResourceFilterValue,
} from "../adapters/query.js";

/**
 * What a column's value names: a row of another resource.
 *
 * Two names and no code, because a definition crosses the client boundary as data and because both
 * are something a host already knows about its own schema. `resource` is the table the value points
 * at, which is the fact that lets the server refuse a value naming a row that is not there rather
 * than storing a string, and the value is that row's own id, which is the one name a row is read by
 * everywhere a reference is resolved. `label` is which of the target's fields a person reads instead
 * of the id, and is absent for a target whose id is already what a person would say.
 *
 * A value naming some other column of the target is deliberately not sayable here. Every place a
 * reference is resolved reads a row through the adapter's `read`, which takes an id and nothing else,
 * so a third name would be a declaration the code could not honour: the choices, the printed row and
 * the write check would each have to look the value up a different way to stay in step, and a value
 * none of them read by id would be refused as dangling. A host whose column holds a slug writes a
 * `format` for the cell and a `render` for the field, which is where code goes.
 */
export type AdminResourceReference = {
  /** The resource whose row this value names. Checked as a name before it reaches a store. */
  resource: string;
  /** The field of a target row printed in place of the id. Absent means the id. */
  label?: string;
};

/** One field on a resource's detail form. */
export type AdminResourceField = {
  name: string;
  label: string;
  hint?: string;
  type?: "text" | "textarea" | "number" | "checkbox" | "date";
  required?: boolean;
  /**
   * This value names a row of another resource, which makes the control a choice from the store
   * rather than a box, and makes the write checked against that store on the server.
   */
  reference?: AdminResourceReference;
  /**
   * Rendered instead of the default control, for a field the primitives do not cover. Code, and
   * irreducibly so: a control is a component, so a definition declaring one has to be built on the
   * side of the client boundary that renders the form.
   */
  render?: (value: unknown, formId: string) => ReactNode;
  /** Pulled out of the submitted value rather than sent as a string. Code, as `render` is. */
  parse?: (raw: FormDataEntryValue | null) => unknown;
};

/** Prints a column's stored value, with the whole row for a cell that reads more than one field. */
export type AdminResourceFormatter = (value: unknown, row: Record<string, unknown>) => ReactNode;

/**
 * How a column prints its value, named rather than written.
 *
 * `money` and `count` are the two the package prints itself, the first reading the stored integer as
 * whole cents. Anything else is the host's, in an object, because a name the host has to register is
 * a name the host is saying out loud rather than one this package happens to recognise.
 */
export type AdminResourceColumnFormat = "money" | "count" | { name: string };

/** One column on a resource's list view. */
export type AdminResourceColumn = {
  key: string;
  header: ReactNode;
  /**
   * Names a formatter, which the list resolves from its `formatters` prop.
   *
   * A name and not a function, because `AdminResourceList` is a client component: a definition
   * handed to one from a server component travels as data, and the framework refuses a function in
   * it at prerender, where the page that declares it is not in the stack. The code that prints the
   * value belongs to the client component that draws the table.
   */
  format?: AdminResourceColumnFormat;
  align?: "left" | "right";
  width?: string;
  /**
   * Prints the row this value names, in place of the value. Declared rather than assumed, because a
   * column of ids is a column a reader has to translate, and the translation is a lookup this
   * package can do from the same declaration the form draws its choices from.
   */
  reference?: AdminResourceReference;
  /**
   * Offers this column as the query's ordering. Declared rather than assumed, because a sort the
   * visitor did not ask for is a store doing work nobody requested.
   */
  sortable?: boolean;
};

/**
 * One filter control on a resource's list view, and the comparison its value becomes.
 *
 * Declared options make it a choice from a set; without them it is a term typed into a box and
 * compared with `contains`. Either way the control's value travels as a comparison in the query
 * and the adapter answers it: the list never narrows rows it has already been given.
 */
export type AdminResourceFilterDefinition = {
  field: string;
  label: string;
  operator?: AdminResourceFilterOperator;
  options?: Array<{ value: string; label: string }>;
  /**
   * The control's choices are the rows the store holds, rather than a list written beside the
   * column it narrows. Absent for a filter over values the definition already knows.
   */
  reference?: AdminResourceReference;
  /**
   * Reads a control's value into what the adapter compares against. Code, as a field's `render` is,
   * so a definition declaring one has to be built on the side that renders the list. The product's
   * own filter declares none, and sends a typed term to the store as the string it is.
   */
  parse?: (value: string) => AdminResourceFilterValue | AdminResourceFilterValue[] | undefined;
};

export type AdminResourceDefinition = {
  /** The persistence resource name every read and write goes through. */
  resource: string;
  label: string;
  singularLabel?: string;
  columns: AdminResourceColumn[];
  fields: AdminResourceField[];
  /**
   * Columns a write may carry that the list does not show.
   *
   * `columns` is the shape a write is held to, because it is the stored shape. A host whose table
   * carries more than its list shows (timestamps, a soft-delete flag, a denormalised counter) names
   * those here, and the refusal names this property, so a write that cannot account for a column is
   * told where to declare it rather than only that it is wrong.
   *
   * Additive to `columns`, per definition, and never a global switch: a boundary a host can switch off
   * for every resource at once is the boundary this closes.
   */
  writable?: string[];
  /**
   * The filter controls the list offers. A definition that declares none has no filter bar, and a
   * visitor sees no control that would narrow nothing.
   */
  filters?: AdminResourceFilterDefinition[];
  /** The route segment for this resource, relative to wherever the host mounts it. */
  path?: string;
  permissions?: {
    read?: AdminPermission;
    create?: AdminPermission;
    update?: AdminPermission;
    delete?: AdminPermission;
  };
};

/**
 * Pairs a persistence resource with the columns, fields and permissions a host would otherwise
 * hand-write for every resource. It is a plain description: nothing here reads or writes, so a
 * host can inspect a registry, filter it by permission, or generate routes from it without
 * running any of it.
 *
 * Most of a definition crosses the client boundary as data, so a server component can hand one to
 * `AdminResourceList` or `AdminResourceForm` and let the client render it. A field's `render` and
 * `parse` and a filter's `parse` are code and do not, which is the one thing a definition has to be
 * built on the side that renders it for.
 */
/**
 * A resource name, as an identifier and nothing more.
 *
 * Stricter than a field path, because a resource name becomes a table name: the dots an embedded
 * document's field path needs would be a second table in a store that concatenated it.
 */
const RESOURCE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** What a declaration says in one line, for a message that has to name the mistake. */
function describeReference(reference: AdminResourceReference): string {
  return JSON.stringify({
    resource: reference.resource,
    ...(reference.label === undefined ? {} : { label: reference.label }),
  });
}

/**
 * Checks a reference declaration, on a column, a field or a filter, and returns it.
 *
 * A resource name crosses to a store the moment a reference is resolved, and `label` is a field
 * path, so both are read here rather than where they are used: a typo in a declaration is a mistake
 * in the definition, and finding it out through a refused write or a blank cell tells its author
 * nothing about where the name came from.
 */
function checkedReference(
  definition: AdminResourceDefinition,
  where: string,
  reference: AdminResourceReference,
): AdminResourceReference {
  if (typeof reference !== "object" || reference === null) {
    throw new Error(`Resource ${definition.resource} declares ${where} as something that is not a reference`);
  }
  if (typeof reference.resource !== "string" || !RESOURCE_NAME.test(reference.resource)) {
    throw new Error(
      `Resource ${definition.resource} declares ${where} naming ` +
        `${JSON.stringify(reference.resource)}, which is not a resource. A resource is one identifier.`,
    );
  }
  if (reference.label !== undefined && !isAdminResourceField(reference.label)) {
    throw new Error(
      `Resource ${definition.resource} declares ${where} label ` +
        `${JSON.stringify(reference.label)}, which is not a field.`,
    );
  }
  const extra = Object.keys(reference).find((key) => !["resource", "label"].includes(key));
  if (extra !== undefined) {
    throw new Error(
      `Resource ${definition.resource} declares ${where} with a "${extra}". A reference names a ` +
        `resource, and optionally the field of it to print. A value is the target row's own id, ` +
        `which is the name every part of the package reads that row by.`,
    );
  }
  return reference;
}

export function defineAdminResource(definition: AdminResourceDefinition): AdminResourceDefinition {
  const seenColumns = new Set<string>();
  /**
   * What each column's values name, by the name the field is read under, so a column and a field of
   * one name pointing at different rows are found here rather than by a page that says one thing and
   * shows another: the halves are read by different code, a form offering the rows of one and a write
   * checked against the other.
   */
  const columnReferences = new Map<string, string>();
  for (const column of definition.columns) {
    if (seenColumns.has(column.key)) {
      throw new Error(`Resource ${definition.resource} declares the column ${column.key} twice`);
    }
    seenColumns.add(column.key);
    if (column.reference !== undefined) {
      const checked = checkedReference(definition, `the column ${column.key}`, column.reference);
      // A format and a reference both decide what the cell says, and which one silently won would be
      // decided by the order they are read in rather than by the host.
      if (column.format !== undefined) {
        const name = typeof column.format === "string" ? column.format : column.format.name;
        throw new Error(
          `Resource ${definition.resource} gives the column ${column.key} both a format ` +
            `(${JSON.stringify(name)}) and a reference (${describeReference(checked)}). A column ` +
            `prints its own value or the row it names, and a host that means a format of the named ` +
            `row wants the target resource's column to say so.`,
        );
      }
      columnReferences.set(column.key, checked.resource);
    }
  }

  const seenFields = new Set<string>();
  const fieldReferences = new Map<string, string>();
  for (const field of definition.fields) {
    if (seenFields.has(field.name)) {
      throw new Error(`Resource ${definition.resource} declares the field ${field.name} twice`);
    }
    seenFields.add(field.name);
    if (field.reference === undefined) continue;
    const checked = checkedReference(definition, `the field ${field.name}`, field.reference);
    // A custom control and a generated one cannot both draw the same field, and a `render` that
    // quietly won would leave a write checked against a choice the form never offered.
    if (field.render !== undefined) {
      throw new Error(
        `Resource ${definition.resource} gives the field ${field.name} both a control and a ` +
          `reference (${describeReference(checked)}). A reference draws the control, and a field that ` +
          `needs its own declares no reference.`,
      );
    }
    const columnTarget = columnReferences.get(field.name);
    if (columnTarget !== undefined && columnTarget !== checked.resource) {
      throw new Error(
        `Resource ${definition.resource} points ${field.name} at ${columnTarget} on its column and at ` +
          `${checked.resource} on its field. One value names one row.`,
      );
    }
    fieldReferences.set(field.name, checked.resource);
  }

  // Checked here rather than at the first query, because a filter whose field is not a field is
  // a mistake in the definition, and finding it out through a refused request from a browser
  // tells its author nothing about where the name came from.
  const seenFilters = new Set<string>();
  for (const filter of definition.filters ?? []) {
    if (!isAdminResourceField(filter.field)) {
      throw new Error(
        `Resource ${definition.resource} filters on ${JSON.stringify(filter.field)}, which is not a field`,
      );
    }
    if (seenFilters.has(filter.field)) {
      throw new Error(`Resource ${definition.resource} filters on ${filter.field} twice`);
    }
    seenFilters.add(filter.field);
    // A control with an empty list of options is a filter the visitor cannot express.
    if (filter.options !== undefined && filter.options.length === 0) {
      throw new Error(`Resource ${definition.resource} declares ${filter.field} with no options`);
    }
    if (filter.reference !== undefined) {
      const checked = checkedReference(definition, `the filter ${filter.field}`, filter.reference);
      // The choices are the store's rows, so a list written beside the column is a second answer to
      // the same question and the two can disagree about which rows exist.
      if (filter.options !== undefined) {
        throw new Error(
          `Resource ${definition.resource} declares ${filter.field} with both options and a reference. ` +
            `A reference's choices come from the store, which is the only place they are read from.`,
        );
      }
      if (filter.parse !== undefined) {
        throw new Error(
          `Resource ${definition.resource} declares ${filter.field} with both a parse and a reference. ` +
            `A reference's value is the row's own id, which needs no reading.`,
        );
      }
      // A filter may narrow a reference, not invent one. Otherwise a field a form draws as a plain
      // box could be filtered as a choice from a resource, and the store would be asked about rows
      // the form never offered.
      const fieldTarget = fieldReferences.get(filter.field);
      if (fieldTarget !== undefined && fieldTarget !== checked.resource) {
        throw new Error(
          `Resource ${definition.resource} filters ${filter.field} against ` +
            `${describeReference(checked)}, which is not what the field points at.`,
        );
      }
    }
  }

  return definition;
}

/** The route segment for a resource: its explicit path, or a slug of its resource name. */
export function adminResourcePath(definition: AdminResourceDefinition): string {
  if (definition.path) return definition.path;
  return definition.resource
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

/**
 * The reference a field or column of that name declares, or nothing for one that declares none.
 *
 * The single reader both halves of a reference go through, so the form that draws a choice and the
 * list that prints a named row cannot end up with different declarations for one name. A column wins
 * over a field of the same name, which can only happen for a column no field shares, since
 * `defineAdminResource` refuses a pair that disagree.
 */
export function adminResourceReference(
  definition: AdminResourceDefinition,
  name: string,
): AdminResourceReference | undefined {
  return (
    definition.columns.find((column) => column.key === name)?.reference ??
    definition.fields.find((field) => field.name === name)?.reference
  );
}

/**
 * The filters a list draws: the ones the definition declares, then one per reference it declares no
 * filter for.
 *
 * A reference is a column with a closed set of values, which is what a filter with options already
 * was, so declaring one is enough for the list to offer it. A host that declares a filter for that
 * field anyway keeps it, and that is the whole of the override: one control for the field, and the
 * host's own label, operator and order if they want to say it.
 */
export function adminResourceFilters(
  definition: AdminResourceDefinition,
): AdminResourceFilterDefinition[] {
  const declared = definition.filters ?? [];
  const narrowed = new Set(declared.map((filter) => filter.field));
  const derived: AdminResourceFilterDefinition[] = [];
  for (const field of definition.fields ?? []) {
    if (field.reference === undefined || narrowed.has(field.name)) continue;
    derived.push({
      field: field.name,
      label: field.label,
      // Equality, because the control's value is a row's id rather than a term to match against one.
      operator: "eq",
      reference: field.reference,
    });
  }
  return [...declared, ...derived];
}

/** A record as the generated views handle it: the persisted fields plus an identity. */
export type AdminResourceRecord = Record<string, unknown> & { id: string };

export function adminResourceRecordId(value: unknown): string {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id: unknown }).id;
    // An empty id is as unusable as a missing one, and would build a route ending in a slash.
    if (typeof id === "string" && id) return id;
    if (typeof id === "number" && Number.isFinite(id)) return String(id);
  }
  throw new Error("A resource record needs a string or number id");
}

/**
 * Reads a form into the shape the persistence adapter expects: declared fields only, with
 * `parse` applied. An undeclared key in the form is dropped, so a field the host removed from
 * the definition cannot be smuggled back in through a hand-edited request.
 */
export function adminResourceValues(
  definition: AdminResourceDefinition,
  form: FormData,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of definition.fields) {
    const raw = form.get(field.name);
    if (field.parse) {
      values[field.name] = field.parse(raw);
      continue;
    }
    if (field.type === "checkbox") {
      values[field.name] = raw !== null;
      continue;
    }
    // A reference with nothing chosen is the absence of a reference, and a database holding it in a
    // column that declares a foreign key reads the empty string as a reference to a row whose id is
    // the empty string: a dangling reference that looks like a value.
    if (field.reference !== undefined) {
      values[field.name] = raw === null || raw === "" ? null : String(raw);
      continue;
    }
    if (field.type === "number") {
      values[field.name] = raw === null || raw === "" ? null : Number(raw);
      continue;
    }
    values[field.name] = raw === null ? null : String(raw);
  }
  return values;
}

/**
 * The id a stored value names, or null for one that names nothing.
 *
 * A number is a row id in a store that numbers its rows, and a form's value is a string either way.
 */
export function adminResourceReferenceValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "object") {
    try {
      return adminResourceRecordId(value);
    } catch {
      return null;
    }
  }
  return null;
}

/** The declared required fields that `values` does not satisfy. */
export function absentRequired(
  definition: AdminResourceDefinition,
  values: Record<string, unknown>,
): string[] {
  return definition.fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = values[field.name];
      if (typeof value === "number") return !Number.isFinite(value);
      return value === null || value === undefined || value === "" || value === false;
    })
    .map((field) => field.name);
}
