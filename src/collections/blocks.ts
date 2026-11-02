// SPDX-License-Identifier: MIT

import type { ReactNode } from "react";

/**
 * A typed block registry pairing block schemas with server-safe renderers, so Payload pages (or any
 * host content) render on public routes without duplicating block definitions.
 */

export type AdminBlockSchema = Record<string, unknown>;

export type AdminBlockValidationFieldError = {
  path: string;
  message: string;
};

export type AdminBlockValidationProblem = {
  index: number;
  type: string | null;
  errors: string[];
  messages: string[];
  problems: string[];
  fieldErrors: AdminBlockValidationFieldError[];
};

export type AdminBlockDefinition = {
  /** Stable block type, matched against a block's `type` / `blockType` / `block_type`. */
  type: string;
  /** A plain JSON-schema-ish validation record. No zod. */
  schema?: AdminBlockSchema | null;
  /** A server-safe renderer called with the block's fields as one object, returning ReactNode. */
  render: (block: Record<string, unknown>) => ReactNode;
};

export type AdminBlockRegistry = {
  list: () => Readonly<AdminBlockDefinition[]>;
  has: (type: string) => boolean;
  get: (type: string) => AdminBlockDefinition | undefined;
  resolve: (type: string) => AdminBlockDefinition | undefined;
  render: (blocks: Array<unknown>) => ReactNode;
  validate: (blocks: Array<unknown>) => AdminBlockValidationProblem[];
};

function blockTypeOf(block: unknown): string | null {
  if (!block || typeof block !== "object") return null;
  const record = block as Record<string, unknown>;
  const candidate = record.type ?? record.blockType ?? record.block_type ?? record.slug;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function isTypeMatch(value: unknown, expected: unknown): boolean {
  if (typeof expected === "string") {
    if (expected === "string") return typeof value === "string";
    if (expected === "number") return typeof value === "number" && Number.isFinite(value);
    if (expected === "integer") return Number.isInteger(value);
    if (expected === "boolean") return typeof value === "boolean";
    if (expected === "array") return Array.isArray(value);
    if (expected === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
    if (expected === "null") return value === null;
    return typeof value === expected;
  }
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    const schema = expected as Record<string, unknown>;
    if (typeof schema.type === "string") return isTypeMatch(value, schema.type);
  }
  return true;
}

function validateAgainstSchema(block: Record<string, unknown>, schema: AdminBlockSchema | null | undefined): string[] {
  const errors: string[] = [];
  if (!schema || typeof schema !== "object") return errors;

  const schemaRecord = schema as Record<string, unknown>;

  // Function-style schema.
  if (typeof schemaRecord.validate === "function") {
    try {
      const result = (schemaRecord.validate as (b: unknown) => unknown)(block);
      if (result === false) errors.push("Invalid block.");
      if (typeof result === "string" && result) errors.push(result);
      if (Array.isArray(result)) for (const item of result) if (typeof item === "string") errors.push(item);
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : "Invalid block.");
    }
  }

  // JSON Schema style: { type, properties, required }.
  const properties =
    schemaRecord.properties && typeof schemaRecord.properties === "object"
      ? (schemaRecord.properties as Record<string, unknown>)
      : null;
  const required = Array.isArray(schemaRecord.required) ? schemaRecord.required.map(String) : [];

  if (properties) {
    for (const key of required) {
      const value = block[key];
      if (value === undefined || value === null || value === "") {
        errors.push(`${key} is required.`);
      }
    }
    for (const [key, propSchema] of Object.entries(properties)) {
      const value = block[key];
      if (value === undefined || value === null) continue;
      if (!isTypeMatch(value, propSchema)) {
        const expected =
          propSchema && typeof propSchema === "object"
            ? String((propSchema as Record<string, unknown>).type ?? "valid")
            : String(propSchema);
        errors.push(`${key} must be ${expected}.`);
      }
    }
    return errors;
  }

  // Flat field -> type map style: { title: "string", count: "number" }.
  // Also support { title: { type: "string", required: true } }.
  for (const [key, expected] of Object.entries(schemaRecord)) {
    if (key === "type" || key === "required" || key === "properties" || key === "validate") continue;
    const value = block[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const fieldSchema = expected as Record<string, unknown>;
      if (fieldSchema.required === true && (value === undefined || value === null || value === "")) {
        errors.push(`${key} is required.`);
      }
      if (value !== undefined && value !== null && value !== "" && !isTypeMatch(value, fieldSchema)) {
        errors.push(`${key} must be ${String(fieldSchema.type ?? "valid")}.`);
      }
      continue;
    }
    if (typeof expected === "string") {
      if (value !== undefined && value !== null && value !== "" && !isTypeMatch(value, expected)) {
        errors.push(`${key} must be ${expected}.`);
      }
    }
  }

  return errors;
}

export function defineAdminBlock(definition: AdminBlockDefinition): AdminBlockDefinition {
  if (!definition || typeof definition !== "object") {
    throw new Error("A block definition is required");
  }
  if (typeof definition.type !== "string" || definition.type.trim() === "") {
    throw new Error("A block needs a type");
  }
  if (typeof definition.render !== "function") {
    throw new Error(`Block "${definition.type}" needs a render`);
  }
  return definition;
}

export function createAdminBlockRegistry(
  entries: AdminBlockDefinition[] | Record<string, AdminBlockDefinition> = [],
): AdminBlockRegistry {
  const byType = new Map<string, AdminBlockDefinition>();

  const list: AdminBlockDefinition[] = Array.isArray(entries)
    ? entries.map((entry) => defineAdminBlock(entry))
    : Object.entries(entries ?? {}).map(([key, entry]) => {
        const definition = defineAdminBlock(entry);
        if (key !== definition.type) {
          throw new Error(`Block registered as "${key}" declares the type "${definition.type}"`);
        }
        return definition;
      });

  for (const definition of list) {
    if (byType.has(definition.type)) {
      throw new Error(`Two blocks are both registered as "${definition.type}"`);
    }
    byType.set(definition.type, definition);
  }

  return {
    list: () => [...byType.values()],
    has: (type) => byType.has(type),
    get: (type) => byType.get(type),
    resolve: (type) => byType.get(type),
    render: (blocks) => {
      const nodes: ReactNode[] = [];
      for (const block of Array.isArray(blocks) ? blocks : []) {
        const type = blockTypeOf(block);
        if (!type) continue;
        const definition = byType.get(type);
        if (!definition) continue; // unknown type degrades to nothing
        const record =
          block && typeof block === "object" && !Array.isArray(block)
            ? (block as Record<string, unknown>)
            : { value: block };
        // Validate the field record against the schema before invoking the renderer.
        if (validateAgainstSchema(record, definition.schema ?? null).length > 0) continue;
        try {
          nodes.push(definition.render(record));
        } catch {
          // Never crash the public render for a single bad block.
        }
      }
      return nodes;
    },
    validate: (blocks) => {
      const problems: AdminBlockValidationProblem[] = [];
      (Array.isArray(blocks) ? blocks : []).forEach((block, index) => {
        const type = blockTypeOf(block);
        const record = block && typeof block === "object" ? (block as Record<string, unknown>) : {};
        const errors: string[] = [];

        if (!type) {
          errors.push("Block is missing a type.");
        } else if (!byType.has(type)) {
          errors.push(`No block is registered as "${type}".`);
        } else {
          const definition = byType.get(type)!;
          errors.push(...validateAgainstSchema(record, definition.schema ?? null));
        }

        if (errors.length > 0) {
          problems.push({
            index,
            type,
            errors,
            messages: errors,
            problems: errors,
            fieldErrors: errors.map((message) => ({ path: "", message })),
          });
        }
      });
      return problems;
    },
  };
}
