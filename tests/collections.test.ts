// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  adminCollectionAdd,
  adminCollectionDuplicateAt,
  adminCollectionEntryId,
  adminCollectionFirstProblem,
  adminCollectionFormData,
  adminCollectionIds,
  adminCollectionMove,
  adminCollectionNextId,
  adminCollectionRemoveAt,
  adminCollectionReorder,
  adminCollectionShift,
  adminCollectionValidate,
  adminCollectionValues,
  type AdminCollectionDefinition,
  type AdminCollectionEntry,
} from "../src/collections/registry";

type Block = { kind: string; title: string };

const definition: AdminCollectionDefinition<Block> = {
  name: "blocks",
  fields: [{ name: "kind" }, { name: "title" }],
  create: () => ({ kind: "hero", title: "" }),
  validate: (entry) => (entry.title.trim() ? [] : ["A block needs a title"]),
};

function entries(...titles: string[]): AdminCollectionEntry<Block>[] {
  return titles.map((title) => adminCollectionAdd([], { kind: "hero", title })[0]);
}

describe("collection identity", () => {
  it("reads an id from a string, a number, or an id property", () => {
    expect(adminCollectionEntryId("a")).toBe("a");
    expect(adminCollectionEntryId(7)).toBe("7");
    expect(adminCollectionEntryId({ id: "b" })).toBe("b");
  });

  it("rejects anything that cannot carry an identity", () => {
    // An entry with no id cannot be reordered or edited reliably, so accepting one pushes the
    // failure to the point where it is hardest to see.
    expect(() => adminCollectionEntryId(undefined)).toThrow(/id/);
    expect(() => adminCollectionEntryId("")).toThrow(/id/);
    expect(() => adminCollectionEntryId({ id: "" })).toThrow(/id/);
    expect(() => adminCollectionEntryId({ id: Number.NaN })).toThrow(/id/);
  });

  it("generates an id that is not already in the collection", () => {
    const taken = [{ id: "col_1" }, { id: "col_2" }];

    expect(adminCollectionNextId(taken)).not.toBe("col_1");
    expect(adminCollectionNextId(taken)).not.toBe("col_2");
  });
});

describe("collection operations", () => {
  it("adds an element with a fresh identity", () => {
    const first = entries("one");

    expect(adminCollectionIds(adminCollectionAdd(first, { kind: "hero", title: "two" }))).toHaveLength(2);
  });

  it("gives the engine identity over an id the element already carried", () => {
    const withOwnId = adminCollectionAdd([], { kind: "hero", title: "x", id: "host-supplied" } as Block);

    // The engine's id is the one reorder and edit operate on, so a host-supplied one must not win.
    expect(withOwnId[0].id).not.toBe("host-supplied");
  });

  it("removes by position and leaves an out-of-range index alone", () => {
    const list = entries("a", "b", "c");

    expect(adminCollectionIds(adminCollectionRemoveAt(list, 1))).toEqual([list[0].id, list[2].id]);
    expect(adminCollectionIds(adminCollectionRemoveAt(list, 9))).toEqual(adminCollectionIds(list));
    expect(adminCollectionIds(adminCollectionRemoveAt(list, -1))).toEqual(adminCollectionIds(list));
  });

  it("duplicates next to the original with a new identity", () => {
    const list = entries("a", "b");
    const next = adminCollectionDuplicateAt(list, 0);

    expect(next.map((entry) => entry.title)).toEqual(["a", "a", "b"]);
    // Duplicating an id is the one way a reorder bug stays invisible: two rows answer to the same key.
    expect(new Set(adminCollectionIds(next)).size).toBe(3);
    expect(next[1].id).not.toBe(next[0].id);
  });

  it("reorders without changing any identity", () => {
    const list = entries("a", "b", "c");
    const moved = adminCollectionMove(list, 0, 2);

    expect(moved.map((entry) => entry.title)).toEqual(["b", "c", "a"]);
    // Identity travels with the element, not with its position.
    expect(new Set(adminCollectionIds(moved))).toEqual(new Set(adminCollectionIds(list)));
  });

  it("moves relative to a position, which is what a keyboard control needs", () => {
    const list = entries("a", "b", "c");

    expect(adminCollectionShift(list, 0, 1).map((entry) => entry.title)).toEqual(["b", "a", "c"]);
    expect(adminCollectionShift(list, 2, -1).map((entry) => entry.title)).toEqual(["a", "c", "b"]);
  });

  it("leaves the input array untouched", () => {
    const list = entries("a", "b");
    const before = adminCollectionIds(list);

    adminCollectionMove(list, 0, 1);
    adminCollectionRemoveAt(list, 0);
    adminCollectionDuplicateAt(list, 0);
    adminCollectionAdd(list, { kind: "hero", title: "c" });

    expect(adminCollectionIds(list)).toEqual(before);
  });

  it("reorders by identity so a drag reports ids rather than positions", () => {
    const list = entries("a", "b", "c");

    expect(adminCollectionReorder(list, [list[2].id, list[0].id, list[1].id]).map((e) => e.title)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("keeps every entry when the id list is short, rather than deleting the rest", () => {
    // A drag that ends against a list the host has since changed must degrade to a partial move.
    const list = entries("a", "b", "c");
    const next = adminCollectionReorder(list, [list[2].id, list[0].id]);

    expect(next).toHaveLength(3);
    expect(next.map((e) => e.title)).toEqual(["c", "a", "b"]);
  });

  it("ignores an id that is not a current entry", () => {
    const list = entries("a", "b");

    expect(adminCollectionReorder(list, ["gone", list[1].id]).map((e) => e.title)).toEqual(["b", "a"]);
  });

  it("ignores a repeated id rather than duplicating an entry", () => {
    const list = entries("a", "b");

    expect(adminCollectionReorder(list, [list[0].id, list[0].id, list[1].id])).toHaveLength(2);
  });

  it("ignores a reorder that would move an entry out of range", () => {
    const list = entries("a", "b");

    expect(adminCollectionIds(adminCollectionMove(list, 0, 5))).toEqual(adminCollectionIds(list));
    expect(adminCollectionIds(adminCollectionShift(list, 1, 1))).toEqual(adminCollectionIds(list));
  });
});

describe("collection submission", () => {
  it("keeps identities across a serialize and read-back round trip", () => {
    const list = adminCollectionMove(entries("a", "b", "c"), 0, 2);
    const form = adminCollectionFormData(definition, list);

    expect(adminCollectionIds(adminCollectionValues(definition, form))).toEqual(adminCollectionIds(list));
  });

  it("drops a key the definition does not declare", () => {
    const form = new FormData();
    form.append("blocks", JSON.stringify({ id: "keep", kind: "hero", title: "t", smuggled: "nope" }));

    const [entry] = adminCollectionValues(definition, form);

    // A field the host removed from the definition must not survive a hand-edited request.
    expect(entry).not.toHaveProperty("smuggled");
    expect(entry).toEqual({ id: "keep", kind: "hero", title: "t" });
  });

  it("applies a field parser on the way in", () => {
    // Built explicitly rather than spread from `definition`, whose element type is a different
    // shape: a spread would carry the other definition's create and validate across.
    const parsed: AdminCollectionDefinition<{ count: number }> = {
      name: definition.name,
      fields: [{ name: "count", parse: (raw) => Number(raw) }],
      create: () => ({ count: 0 }),
    };
    const form = new FormData();
    form.append("blocks", JSON.stringify({ id: "a", count: "42" }));

    expect(adminCollectionValues(parsed, form)[0]).toEqual({ id: "a", count: 42 });
  });

  it("drops an entry that carries no identity rather than accepting an unusable one", () => {
    const form = new FormData();
    form.append("blocks", JSON.stringify({ kind: "hero", title: "t" }));

    expect(adminCollectionValues(definition, form)).toEqual([]);
  });

  it("drops a malformed payload instead of throwing on a hand-edited request", () => {
    const form = new FormData();
    form.append("blocks", "not json");
    form.append("blocks", JSON.stringify(["an", "array"]));
    form.append("blocks", JSON.stringify({ id: "good", title: "t" }));

    expect(adminCollectionIds(adminCollectionValues(definition, form))).toEqual(["good"]);
  });

  it("round-trips a cleared field as cleared rather than absent", () => {
    const list = [{ id: "a", kind: "hero", title: "" }];
    const form = adminCollectionFormData(definition, list);

    expect(adminCollectionValues(definition, form)[0]).toHaveProperty("title", "");
  });
});

describe("collection validation", () => {
  it("reports every problem, from every entry, in order", () => {
    // Deliberately more than one problem on more than one entry: a validator that reported only
    // the first message, or only the first offending entry, would pass a single-problem fixture.
    const strict: AdminCollectionDefinition<Block> = {
      ...definition,
      validate: (entry) => [
        ...(entry.title.trim() ? [] : ["A block needs a title"]),
        ...(entry.kind === "unknown" ? ["Unknown block kind"] : []),
      ],
    };
    const list = [
      { id: "a", kind: "unknown", title: " " },
      { id: "b", kind: "hero", title: "fine" },
      { id: "c", kind: "unknown", title: "" },
    ];

    expect(adminCollectionValidate(strict, list)).toEqual([
      { index: 0, id: "a", message: "A block needs a title" },
      { index: 0, id: "a", message: "Unknown block kind" },
      { index: 2, id: "c", message: "A block needs a title" },
      { index: 2, id: "c", message: "Unknown block kind" },
    ]);
  });

  it("names the entry a problem came from", () => {
    const list = [entries("ok")[0], { id: "bad", kind: "hero", title: "  " }];

    expect(adminCollectionValidate(definition, list)).toEqual([
      { index: 1, id: "bad", message: "A block needs a title" },
    ]);
  });

  it("surfaces the first problem as a gate before a save", () => {
    const list = [{ id: "bad", kind: "hero", title: "" }];

    expect(adminCollectionFirstProblem(definition, list)?.id).toBe("bad");
    expect(adminCollectionFirstProblem(definition, entries("fine"))).toBeUndefined();
  });

  it("treats a definition without validation as always valid", () => {
    const permissive: AdminCollectionDefinition<Block> = { ...definition, validate: undefined };

    expect(adminCollectionValidate(permissive, [{ id: "a", kind: "hero", title: "" }])).toEqual([]);
  });
});
