// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { AdminPayloadAccessRefused } from "../src/index.js";
import { Categories, Tags } from "../examples/payload-host/lib/payload/taxonomy";
import {
  NAVIGATION_GLOBAL,
  navigationGlobal,
  reorderNavigationItems,
  validateNavigationItem,
  validateNavigationItems,
  readPayloadNavigationMenu,
  writePayloadNavigationMenu,
  createPayloadNavigationMenu,
  urlIsValid,
} from "../examples/payload-host/lib/payload/menu";
import { createNavigationActions } from "../examples/payload-host/lib/navigation-actions-factory";
import { navigationItemsToLinks } from "../examples/payload-host/lib/navigation-render";

describe("nav taxonomy #419 access", () => {
  it("taxonomy collections are publicly readable and admin-only writable", async () => {
    for (const Collection of [Categories, Tags]) {
      const access = Collection.access!;
      expect(await (access.read as (a: never) => unknown)({ req: { user: null } } as never)).toBe(true);
      expect(await (access.create as (a: never) => unknown)({ req: { user: null } } as never)).toBe(false);
      expect(await (access.create as (a: never) => unknown)({ req: { user: { id: "e", role: "editor" } } } as never)).toBe(false);
      expect(await (access.create as (a: never) => unknown)({ req: { user: { id: "a", role: "admin" } } } as never)).toBe(true);
      expect(await (access.update as (a: never) => unknown)({ req: { user: { id: "a", role: "admin" } } } as never)).toBe(true);
      expect(await (access.delete as (a: never) => unknown)({ req: { user: { id: "a", role: "admin" } } } as never)).toBe(true);
    }
  });

  it("navigation global is admin-only for read and update", async () => {
    const access = navigationGlobal.access!;
    expect(await (access.read as (a: never) => unknown)({ req: { user: null } } as never)).toBe(false);
    expect(await (access.read as (a: never) => unknown)({ req: { user: { id: "e", role: "editor" } } } as never)).toBe(false);
    expect(await (access.read as (a: never) => unknown)({ req: { user: { id: "a", role: "admin" } } } as never)).toBe(true);
    expect(await (access.update as (a: never) => unknown)({ req: { user: { id: "a", role: "admin" } } } as never)).toBe(true);
  });
});

describe("nav taxonomy #419 reorder util", () => {
  it("reorders by id and reassigns sortOrder", () => {
    const items = [
      { id: "a", label: "A", sortOrder: 0 },
      { id: "b", label: "B", sortOrder: 1 },
    ];
    const result = reorderNavigationItems(items, ["b", "a"]);
    expect(result.map((item) => item.label)).toEqual(["B", "A"]);
    expect(result.map((item) => item.sortOrder)).toEqual([0, 1]);
  });

  it("ignores unknown ids and keeps unplaced entries at the end", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const result = reorderNavigationItems(items, ["zzz", "b"]);
    expect(result.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the input", () => {
    const items = [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 1 }];
    const snapshot = JSON.stringify(items);
    reorderNavigationItems(items, ["b", "a"]);
    expect(JSON.stringify(items)).toBe(snapshot);
  });

  it("handles an empty id list without dropping entries", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const result = reorderNavigationItems(items, []);
    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("nav taxonomy #419 validation", () => {
  it("requires a label", () => {
    const problems = validateNavigationItem({ label: "", targetKind: "url", url: "https://example.com" });
    expect(problems.some((problem) => problem.field === "label")).toBe(true);
  });

  it("requires a parseable url for url items", () => {
    expect(validateNavigationItem({ label: "Home", targetKind: "url", url: "not-a-url" }).some((p) => p.field === "url")).toBe(true);
    expect(validateNavigationItem({ label: "Home", targetKind: "url", url: "https://example.com" })).toHaveLength(0);
    expect(validateNavigationItem({ label: "Home", targetKind: "url", url: "/about" })).toHaveLength(0);
  });

  it("requires an existing internal page for internal items", () => {
    expect(validateNavigationItem({ label: "Home", targetKind: "internal", internalPage: "missing" }, ["home"]).some((p) => p.field === "internalPage")).toBe(true);
    expect(validateNavigationItem({ label: "Home", targetKind: "internal", internalPage: "home" }, ["home"])).toHaveLength(0);
    expect(validateNavigationItem({ label: "Home", targetKind: "internal", internalPage: "" }, ["home"]).some((p) => p.field === "internalPage")).toBe(true);
  });

  it("validates a whole list", () => {
    const problems = validateNavigationItems([
      { label: "", targetKind: "url", url: "bad" },
      { label: "Ok", targetKind: "url", url: "https://example.com" },
    ]);
    expect(problems.length).toBeGreaterThan(0);
  });

  it("exposes urlIsValid", () => {
    expect(urlIsValid("https://example.com")).toBe(true);
    expect(urlIsValid("not a url")).toBe(false);
  });
});

describe("nav taxonomy #419 save through fake bridge", () => {
  it("passes overrideAccess false and the resolved user to findGlobal/updateGlobal", async () => {
    const findGlobal = vi.fn(async () => ({ items: [] }));
    const updateGlobal = vi.fn(async () => ({ items: [{ label: "Home", targetKind: "url", url: "https://example.com", sortOrder: 0 }] }));
    const payload = { findGlobal, updateGlobal };
    const actions = createNavigationActions({ sessionResolver: async () => ({ id: "u1", role: "admin" }), payload });
    const result = await actions.saveNavigationMenu([{ label: "Home", targetKind: "url", url: "https://example.com", sortOrder: 0 }]);
    expect(result.ok).toBe(true);
    const calls = updateGlobal.mock.calls as unknown as Array<[Record<string, unknown>]>;
    const call = calls[0]?.[0];
    expect(call).toMatchObject({ slug: NAVIGATION_GLOBAL, overrideAccess: false, user: { id: "u1", role: "admin" } });
    expect((calls[0]?.[0] as { data?: unknown })?.data).toMatchObject({ items: expect.any(Array) });
  });

  it("refuses non-admin without touching the bridge", async () => {
    const updateGlobal = vi.fn();
    const findGlobal = vi.fn(async () => ({ items: [] }));
    const actions = createNavigationActions({ sessionResolver: async () => ({ id: "e", role: "editor" }), payload: { findGlobal, updateGlobal } });
    const result = await actions.saveNavigationMenu([{ label: "Home", targetKind: "url", url: "https://example.com", sortOrder: 0 }]);
    expect(result.ok).toBe(false);
    expect(updateGlobal).not.toHaveBeenCalled();
  });

  it("refuses when there is no session", async () => {
    const findGlobal = vi.fn(async () => ({ items: [] }));
    const updateGlobal = vi.fn();
    const actions = createNavigationActions({ sessionResolver: async () => null, payload: { findGlobal, updateGlobal } });
    await expect(actions.listNavigationItems()).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    const result = await actions.saveNavigationMenu([{ label: "Home", targetKind: "url", url: "https://example.com", sortOrder: 0 }]);
    expect(result.ok).toBe(false);
    expect(updateGlobal).not.toHaveBeenCalled();
  });

  it("returns typed problems for invalid items", async () => {
    const updateGlobal = vi.fn();
    const actions = createNavigationActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: { findGlobal: vi.fn(async () => ({ items: [] })), updateGlobal } });
    const result = await actions.saveNavigationMenu([{ label: "", targetKind: "url", url: "bad", sortOrder: 0 }]);
    expect(result.ok).toBe(false);
    expect(result.problems?.length).toBeGreaterThan(0);
    expect(updateGlobal).not.toHaveBeenCalled();
  });
});

describe("nav taxonomy #419 store round trip", () => {
  it("reads and writes through a store with server stamps", async () => {
    const stored: Record<string, unknown> = {};
    const store = {
      get: async (slug: string) => {
        void slug;
        return { ...stored };
      },
      set: async (slug: string, data: Record<string, unknown>) => {
        void slug;
        Object.assign(stored, data);
        return { ...stored };
      },
    };
    const adapter = createPayloadNavigationMenu({ store, resolveUser: async () => ({ id: "u1", role: "admin" }) } as never);
    const written = await adapter.write([{ label: "Home", targetKind: "url", url: "https://example.com", sortOrder: 0 }]);
    expect(written).toBeDefined();
    const read = await readPayloadNavigationMenu({ store, resolveUser: async () => ({ id: "u1", role: "admin" }) } as never);
    expect(read.map((item) => item.label)).toEqual(["Home"]);
    expect(stored.updated_by).toBe("u1");
    expect(String(stored.updated_at)).toContain("2026");
  });

  it("refuses read and write with no session before reaching the store", async () => {
    const store = { get: vi.fn(), set: vi.fn() };
    await expect(readPayloadNavigationMenu({ store, resolveUser: async () => null } as never)).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(writePayloadNavigationMenu({ store, resolveUser: async () => null } as never, [])).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    expect(store.get).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });
});

describe("nav taxonomy #419 taxonomy terms", () => {
  it("creates a term for an admin through the fake payload", async () => {
    const create = vi.fn(async () => ({ id: "t1" }));
    const find = vi.fn(async () => ({ docs: [] }));
    const actions = createNavigationActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: { find, create, update: vi.fn(), delete: vi.fn() } });
    const result = await actions.createTerm("categories", "News", "news");
    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ collection: "categories", overrideAccess: false, user: { id: "a", role: "admin" }, data: { label: "News", slug: "news" } }));
  });

  it("refuses term creation for a non-admin", async () => {
    const create = vi.fn();
    const actions = createNavigationActions({ sessionResolver: async () => ({ id: "e", role: "editor" }), payload: { find: vi.fn(async () => ({ docs: [] })), create, update: vi.fn(), delete: vi.fn() } });
    const result = await actions.createTerm("categories", "News", "news");
    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("deletes a term for an admin", async () => {
    const del = vi.fn(async () => ({}));
    const actions = createNavigationActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: { find: vi.fn(async () => ({ docs: [] })), create: vi.fn(), update: vi.fn(), delete: del } });
    const result = await actions.deleteTerm("tags", "t1");
    expect(result.ok).toBe(true);
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ collection: "tags", id: "t1", overrideAccess: false, user: { id: "a", role: "admin" } }));
  });

  it("refuses term deletion without a session", async () => {
    const del = vi.fn();
    const actions = createNavigationActions({ sessionResolver: async () => null, payload: { find: vi.fn(async () => ({ docs: [] })), create: vi.fn(), update: vi.fn(), delete: del } });
    const result = await actions.deleteTerm("tags", "t1");
    expect(result.ok).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });

  it("renames a term for an admin", async () => {
    const update = vi.fn(async () => ({}));
    const actions = createNavigationActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: { find: vi.fn(async () => ({ docs: [] })), create: vi.fn(), update, delete: vi.fn() } });
    const result = await actions.renameTerm("categories", "t1", "Renamed");
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ collection: "categories", id: "t1", overrideAccess: false, user: { id: "a", role: "admin" }, data: { label: "Renamed" } }));
  });
});

describe("nav taxonomy #419 public render mapping", () => {
  it("maps menu items to anchors sorted by sortOrder", () => {
    const items = [
      { id: "b", label: "Blog", targetKind: "internal" as const, internalPage: "blog", url: null, sortOrder: 2 },
      { id: "a", label: "Home", targetKind: "url" as const, internalPage: null, url: "https://example.com", sortOrder: 0 },
    ];
    const links = navigationItemsToLinks(items);
    expect(links.map((link) => link.label)).toEqual(["Home", "Blog"]);
    expect(links[0]).toMatchObject({ href: "https://example.com", external: true });
    expect(links[1]).toMatchObject({ href: "/blog", external: false });
  });

  it("falls back to # for incomplete items", () => {
    const links = navigationItemsToLinks([{ id: "x", label: "X", targetKind: "url", url: null, internalPage: null, sortOrder: 0 }]);
    expect(links[0].href).toBe("#");
  });
});
