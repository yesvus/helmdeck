// SPDX-License-Identifier: MIT

/**
 * A typed, stably-identified, ordered collection whose element type, construction, validation and
 * serialization are supplied by the host.
 *
 * This is the shared foundation for dashboard layout, content blocks and repeaters. They are the
 * same requirement with different element types, and building three reorder behaviours would mean
 * three subtly different identity rules. The model is deliberately React-free: it holds no state, so
 * it cannot pre-empt the controlled-versus-uncontrolled decision that the editor will have to make
 * with two real consumers in hand.
 */

/** An entry as the editor and the serializer handle it: the host's element plus an identity. */
export type AdminCollectionEntry<T> = { id: string } & T;

/** A declared field, with the parsing the host wants applied on the way in. */
export type AdminCollectionField = {
  name: string;
  /** Applied to the raw form value. Returning undefined drops the field. */
  parse?: (raw: FormDataEntryValue | null) => unknown;
};

export type AdminCollectionDefinition<T> = {
  /** The form field name the collection serializes to. */
  name: string;
  fields: AdminCollectionField[];
  /** A new empty element. The engine never invents element shape. */
  create: () => T;
  /**
   * Returns one message per problem, or an empty array when the entry is valid. Kept as messages
   * rather than a schema so a host can express a rule the engine has no vocabulary for.
   */
  validate?: (entry: AdminCollectionEntry<T>) => string[];
};

export function adminCollectionEntryId(value: unknown): string {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id: unknown }).id;
    // An empty id is as unusable as a missing one, and two empty ids collide with each other.
    if (typeof id === "string" && id) return id;
    if (typeof id === "number" && Number.isFinite(id)) return String(id);
  }
  throw new Error("A collection entry needs a string or number id");
}

/**
 * An id no current entry is using, and that a later generated id will not collide with either.
 *
 * A module-level counter rather than `randomUUID` because the collection is built during server
 * rendering as well as in the browser, and a value that has to survive both is easier to reason
 * about when it is monotonic. The prefix keeps these ids distinguishable from a host's own, the way
 * `mem_` does in the baseline memory adapter.
 */
let sequence = 0;

export function adminCollectionNextId(entries: readonly { id: string }[] = []): string {
  const taken = new Set(entries.map((entry) => entry.id));
  for (;;) {
    sequence += 1;
    const candidate = `col_${sequence}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function adminCollectionIds<T>(entries: readonly AdminCollectionEntry<T>[]): string[] {
  return entries.map((entry) => entry.id);
}

/** Appends an element, giving it an identity. Returns a new array. */
export function adminCollectionAdd<T>(entries: readonly AdminCollectionEntry<T>[], element: T): AdminCollectionEntry<T>[] {
  return [...entries, { ...element, id: adminCollectionNextId(entries) } as AdminCollectionEntry<T>];
}

/** Returns a new array without the entry at `index`. An out-of-range index changes nothing. */
export function adminCollectionRemoveAt<T>(
  entries: readonly AdminCollectionEntry<T>[],
  index: number,
): AdminCollectionEntry<T>[] {
  if (index < 0 || index >= entries.length) return [...entries];
  return entries.filter((_, position) => position !== index);
}

/**
 * Copies the entry at `index` and inserts the copy directly after it.
 *
 * The copy gets a fresh identity, because duplicating an id is the one way a reorder bug becomes
 * invisible: two rows would answer to the same key, and every subsequent move would apply to
 * whichever one happened to be first.
 */
export function adminCollectionDuplicateAt<T>(
  entries: readonly AdminCollectionEntry<T>[],
  index: number,
): AdminCollectionEntry<T>[] {
  if (index < 0 || index >= entries.length) return [...entries];
  const source = entries[index];
  const element = { ...source } as Record<string, unknown>;
  delete element.id;
  const copy = { ...element, id: adminCollectionNextId(entries) } as AdminCollectionEntry<T>;
  return [...entries.slice(0, index + 1), copy, ...entries.slice(index + 1)];
}

/**
 * Moves the entry at `from` to `to`, leaving every identity untouched.
 *
 * Identity is carried by the entry object rather than by its position, so a move cannot change
 * which entry a form field belongs to. That is the property the editor's reordering depends on.
 */
export function adminCollectionMove<T>(
  entries: readonly AdminCollectionEntry<T>[],
  from: number,
  to: number,
): AdminCollectionEntry<T>[] {
  if (from < 0 || from >= entries.length || to < 0 || to >= entries.length) return [...entries];
  if (from === to) return [...entries];
  const next = [...entries];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Moves an entry by a relative offset, which is what a keyboard control needs. */
export function adminCollectionShift<T>(
  entries: readonly AdminCollectionEntry<T>[],
  index: number,
  offset: number,
): AdminCollectionEntry<T>[] {
  return adminCollectionMove(entries, index, index + offset);
}

/**
 * Reorders by identity, which is what a drag reports, rather than by index.
 *
 * A drag that ends against a list the host has since changed must not delete anything. An id that is
 * not a current entry is ignored, and an entry the id list does not mention keeps its place at the
 * end in its original relative order, so a stale or partial list degrades to a partial move instead
 * of to data loss.
 */
export function adminCollectionReorder<T>(
  entries: readonly AdminCollectionEntry<T>[],
  orderedIds: readonly string[],
): AdminCollectionEntry<T>[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ordered: AdminCollectionEntry<T>[] = [];
  const placed = new Set<string>();
  for (const id of orderedIds) {
    const entry = byId.get(id);
    if (!entry || placed.has(id)) continue;
    placed.add(id);
    ordered.push(entry);
  }
  for (const entry of entries) {
    if (!placed.has(entry.id)) ordered.push(entry);
  }
  return ordered;
}

/**
 * Reads a submitted form into entries, dropping any key the definition does not declare.
 *
 * An undeclared key is dropped rather than merged, so a field the host removed from the definition
 * cannot be smuggled back in through a hand-edited request. An entry that declares no `id` is
 * dropped too: an entry with no identity cannot be reordered or edited reliably, and accepting one
 * would push the failure to the point where it is hardest to see.
 */
export function adminCollectionValues<T>(
  definition: AdminCollectionDefinition<T>,
  form: FormData,
): AdminCollectionEntry<T>[] {
  const raw = form.getAll(definition.name);
  const entries: AdminCollectionEntry<T>[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(item) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    let id: string;
    try {
      id = adminCollectionEntryId(parsed);
    } catch {
      continue;
    }
    const element: Record<string, unknown> = {};
    for (const field of definition.fields) {
      const value = parsed[field.name];
      if (value === undefined) continue;
      element[field.name] = field.parse ? field.parse(value as FormDataEntryValue) : value;
    }
    entries.push({ ...element, id } as AdminCollectionEntry<T>);
  }
  return entries;
}

/**
 * Serializes entries to the repeated form values the engine reads back.
 *
 * The id is written alongside the element so `adminCollectionValues` can restore identity, and the
 * declared fields are written whether or not they were set, so a cleared field round-trips as
 * cleared rather than as absent.
 */
export function adminCollectionFormData<T>(
  definition: AdminCollectionDefinition<T>,
  entries: readonly AdminCollectionEntry<T>[],
): FormData {
  const form = new FormData();
  for (const entry of entries) {
    const payload: Record<string, unknown> = { id: entry.id };
    for (const field of definition.fields) {
      payload[field.name] = (entry as Record<string, unknown>)[field.name];
    }
    form.append(definition.name, JSON.stringify(payload));
  }
  return form;
}

/** Every validation message across the collection, each naming the entry it came from. */
export function adminCollectionValidate<T>(
  definition: AdminCollectionDefinition<T>,
  entries: readonly AdminCollectionEntry<T>[],
): { index: number; id: string; message: string }[] {
  const validate = definition.validate;
  if (!validate) return [];
  const problems: { index: number; id: string; message: string }[] = [];
  entries.forEach((entry, index) => {
    for (const message of validate(entry)) {
      problems.push({ index, id: entry.id, message });
    }
  });
  return problems;
}

/** The first problem, or undefined. Useful as a gate before offering a save action. */
export function adminCollectionFirstProblem<T>(
  definition: AdminCollectionDefinition<T>,
  entries: readonly AdminCollectionEntry<T>[],
): { index: number; id: string; message: string } | undefined {
  return adminCollectionValidate(definition, entries)[0];
}
