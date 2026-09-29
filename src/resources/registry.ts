// SPDX-License-Identifier: MIT
import type { ReactNode } from "react";
import type { AdminPermission } from "../adapters/index.js";
import {
  isAdminResourceField,
  type AdminResourceFilterOperator,
  type AdminResourceFilterValue,
} from "../adapters/query.js";

/** One field on a resource's detail form. */
export type AdminResourceField = {
  name: string;
  label: string;
  hint?: string;
  type?: "text" | "textarea" | "number" | "checkbox" | "date";
  required?: boolean;
  /** Rendered instead of the default control, for a field the primitives do not cover. */
  render?: (value: unknown, formId: string) => ReactNode;
  /** Pulled out of the submitted value rather than sent as a string. */
  parse?: (raw: FormDataEntryValue | null) => unknown;
};

/** One column on a resource's list view. */
export type AdminResourceColumn = {
  key: string;
  header: ReactNode;
  /** Formats the stored value. The default renders it as text. */
  format?: (value: unknown, row: Record<string, unknown>) => ReactNode;
  align?: "left" | "right";
  width?: string;
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
  /** Reads a control's value into what the adapter compares against. */
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
 */
export function defineAdminResource(definition: AdminResourceDefinition): AdminResourceDefinition {
  const seenColumns = new Set<string>();
  for (const column of definition.columns) {
    if (seenColumns.has(column.key)) {
      throw new Error(`Resource ${definition.resource} declares the column ${column.key} twice`);
    }
    seenColumns.add(column.key);
  }

  const seenFields = new Set<string>();
  for (const field of definition.fields) {
    if (seenFields.has(field.name)) {
      throw new Error(`Resource ${definition.resource} declares the field ${field.name} twice`);
    }
    seenFields.add(field.name);
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
    if (field.type === "number") {
      values[field.name] = raw === null || raw === "" ? null : Number(raw);
      continue;
    }
    values[field.name] = raw === null ? null : String(raw);
  }
  return values;
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
