// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoCan } from "../fixtures/lib/demo-rules";
import type { AdminSession } from "@yesvus/helmdeck";

/**
 * The landing page's persistence, asked at the server action rather than at a function.
 *
 * The guard is stubbed so a test can say who is calling, because that is the question here: what each
 * role may do to an arrangement. The rule is not stubbed, so every assertion below is the demo's own
 * `demoCan` answering, and a change to the roles moves these tests rather than leaving them green
 * against a rule they no longer match. Nothing is stubbed between the action and the store, so a
 * second call that still shows an edit means the write reached the database rather than the state
 * the editor was holding.
 *
 * The store is named rather than reached through `demoPersistence`, because which store a demo answers
 * from depends on its environment and a test that silently got a different one would be a test of
 * whichever it happened to get.
 */
const caller = vi.hoisted(() => ({ session: undefined as AdminSession | undefined }));

vi.mock("../fixtures/lib/demo-guard", () => ({
  LOGIN_PATH: "/login",
  DEFAULT_AFTER_LOGIN: "/dashboard",
  requireDemoSession: vi.fn(async () => {
    // The real guard redirects, which is a response rather than a rejection. Throwing is the closest
    // stand-in: either way the caller gets no session and no data.
    if (!caller.session) throw new Error("no session");
    return caller.session;
  }),
}));

// The workspace seed fills every other resource and hashes passwords on every call, neither of which
// is what is under test. The landing page's own rows are written below, so each test states the
// arrangement it is about rather than inheriting the last one's.
vi.mock("../fixtures/lib/ensure-seeded", () => ({
  ensureDemoSeeded: vi.fn(async () => undefined),
}));

const owner: AdminSession = { email: "owner@demo.helmdeck.dev", role: "admin" };
const editor: AdminSession = { email: "editor@demo.helmdeck.dev", role: "editor" };

type Row = {
  id: string;
  page: string;
  kind: string;
  title: string;
  position: number;
  content: string;
};

type Store = typeof import("../fixtures/lib/demo-collections") & {
  allRows: () => Promise<Row[]>;
  landingRows: () => Promise<Row[]>;
  otherPageRows: () => Promise<Row[]>;
};

const arrangement = [
  { id: "sec_hero", widget: "hero", size: "xl" as const, title: "A sofa that arrives early" },
  { id: "sec_pricing", widget: "pricing", size: "md" as const, title: "Under 900, delivery included" },
  { id: "sec_faq", widget: "faq", size: "sm" as const, title: "Sixty days to change your mind" },
];

/**
 * The action module over a store this test owns, with `adapter` bound to it.
 *
 * The order matters: the registry is cleared, the persistence is bound, and only then is the action
 * imported, because a module that was already evaluated holds the store it was given at the time.
 */
async function actionsOver(
  adapter: { query: <T>(resource: string) => Promise<T[]>; create: (resource: string, value: unknown) => Promise<unknown> },
): Promise<Store> {
  vi.resetModules();
  vi.doMock("../fixtures/lib/demo-persistence", () => ({
    demoPersistence: () => ({ adapter, kind: "memory" }),
    assertDemoPersistenceConfigured: () => undefined,
  }));
  const actions = await import("../fixtures/lib/demo-collections");

  const allRows = () => adapter.query<Row>("landing_sections");
  const withRows = {
    ...actions,
    allRows,
    landingRows: async () =>
      (await allRows())
        .filter((row) => row.page === "landing")
        .sort((left, right) => left.position - right.position),
    otherPageRows: async () => (await allRows()).filter((row) => row.page !== "landing"),
  };
  return withRows;
}

/** Another page's row, present in every store, so a write that ignored `page` would be visible. */
async function withOtherPage(adapter: Parameters<typeof actionsOver>[0]): Promise<Store> {
  await adapter.create("landing_sections", {
    id: "sec_campaign",
    page: "campaign",
    kind: "hero",
    title: "Not the landing page",
    position: 0,
    content: JSON.stringify({ size: "xl" }),
  });
  return actionsOver(adapter);
}

let memory: Awaited<ReturnType<typeof createMemoryStore>>;
let store: Store;

async function createMemoryStore() {
  const { createMemoryPersistenceAdapter } = await import("../src/baseline/memory");
  return createMemoryPersistenceAdapter();
}

const sections = async () => store.readLandingSections();
const ids = async () => (await sections()).map((section) => section.id);
const positions = async () => (await store.landingRows()).map((row) => row.position);

beforeEach(async () => {
  caller.session = owner;
  memory = await createMemoryStore();
  store = await withOtherPage(memory as never);
  await store.saveLandingSections(arrangement);
});

describe("the landing page arrangement", () => {
  it("reads a stored arrangement rather than an empty editor", async () => {
    // A visitor who arrives at an empty panel concludes the demo is broken.
    expect(await ids()).toEqual(["sec_hero", "sec_pricing", "sec_faq"]);
  });

  it("keeps an added section after a re-read, which is what a reload does", async () => {
    const before = await sections();

    await store.saveLandingSections([
      ...before,
      { id: "col_added", widget: "faq", size: "md", title: "Added" },
    ]);

    // A second call is a second round trip to the store, so this fails if the write only reached the
    // state the editor was holding.
    expect(await ids()).toEqual(["sec_hero", "sec_pricing", "sec_faq", "col_added"]);
    expect(await positions()).toEqual([0, 1, 2, 3]);
  });

  it("keeps a duplicated section under an identity of its own", async () => {
    const before = await sections();

    await store.saveLandingSections([{ ...before[0], id: "col_copy" }, ...before]);

    expect(await ids()).toEqual(["col_copy", "sec_hero", "sec_pricing", "sec_faq"]);
    // Two rows answering to one identity is what a duplicate has to avoid, since every later move
    // would then apply to whichever copy happened to be first.
    expect(new Set(await ids()).size).toBe(4);
  });

  it("keeps a reordered arrangement after a re-read, renumbered from zero", async () => {
    const before = await sections();

    await store.saveLandingSections([...before].reverse());

    expect(await ids()).toEqual(["sec_faq", "sec_pricing", "sec_hero"]);
    // The order is the rows rather than a column beside them, so the positions are the order.
    expect(await positions()).toEqual([0, 1, 2]);
  });

  it("keeps an edited heading and width after a re-read", async () => {
    const before = await sections();

    await store.saveLandingSections(
      before.map((section) =>
        section.id === "sec_hero" ? { ...section, title: "Renamed by a person", size: "lg" as const } : section,
      ),
    );

    expect((await sections())[0]).toMatchObject({ id: "sec_hero", title: "Renamed by a person", size: "lg" });
    // The width has no column of its own, so it only survives if the document was written and read.
    expect(JSON.parse(String((await store.landingRows())[0].content))).toEqual({ size: "lg" });
  });

  it("leaves another page's rows alone", async () => {
    const before = await store.otherPageRows();

    await store.saveLandingSections([
      ...(await sections()),
      { id: "col_new", widget: "hero", size: "xl", title: "New" },
    ]);

    // A write that ignored `page` would rewrite a page it was never given.
    expect(await store.otherPageRows()).toEqual(before);
  });

  it("drops a removed section from the store rather than only from the editor", async () => {
    const before = await sections();

    await store.saveLandingSections(before.filter((section) => section.id !== "sec_pricing"));

    expect(await ids()).toEqual(["sec_hero", "sec_faq"]);
    expect((await store.landingRows()).some((row) => row.id === "sec_pricing")).toBe(false);
  });

  it("refuses an identity belonging to another page", async () => {
    const before = await store.otherPageRows();

    await expect(
      store.saveLandingSections([
        ...(await sections()),
        { id: "sec_campaign", widget: "hero", size: "xl", title: "Taken" },
      ]),
    ).rejects.toThrow(/not a section/);
    expect(await store.otherPageRows()).toEqual(before);
  });

  it("refuses the same identity twice, which would make every later move ambiguous", async () => {
    const before = await store.landingRows();

    await expect(store.saveLandingSections([...(await sections()), arrangement[0]])).rejects.toThrow(
      /twice/,
    );
    // Asserted on the store rather than on the refusal alone: a write that merely threw after
    // clearing the table would pass a message check while leaving nothing behind.
    expect(await store.landingRows()).toEqual(before);
  });

  it("refuses a section that has not been given a section yet", async () => {
    const before = await store.landingRows();

    // `kind` is NOT NULL in the migration, so an unplaced section is a write the database would
    // reject. Refusing it here names which of the two it is, and leaves the page as it was.
    await expect(
      store.saveLandingSections([
        ...(await sections()),
        { id: "col_new", widget: "", size: "sm", title: "Nothing" },
      ]),
    ).rejects.toThrow(/has not been given a section/);
    expect(await store.landingRows()).toEqual(before);
  });

  it("refuses a width the database would reject, before writing anything", async () => {
    const before = await store.landingRows();

    await expect(
      store.saveLandingSections([
        ...(await sections()),
        { id: "col_new", widget: "hero", size: "enormous" as never, title: "Too wide" },
      ]),
    ).rejects.toThrow(/width/);
    expect(await store.landingRows()).toEqual(before);
  });

  it("refuses an identity that is not one safe to store", async () => {
    const before = await store.landingRows();

    await expect(
      store.saveLandingSections([
        ...(await sections()),
        { id: "col_../../etc", widget: "hero", size: "xl", title: "Traversal" },
      ]),
    ).rejects.toThrow(/not a section/);
    expect(await store.landingRows()).toEqual(before);
  });
});

describe("what each role may do to an arrangement", () => {
  it("refuses the page to a session whose role the rule does not define", async () => {
    // The permissive answer is what a role column nobody checked would hand out, and a page that
    // renders controls whose actions refuse is what that looks like from outside.
    caller.session = { email: "someone@demo.helmdeck.dev" } as AdminSession;
    expect(demoCan(caller.session, "landing_sections.read")).toBe(false);

    await expect(store.readLandingSections()).rejects.toThrow();
  });

  it("lets an editor add, reorder and edit, which is the whole page for that role", async () => {
    // The editor has no `delete`, so a save that cleared the table and wrote it back would refuse
    // every editor save. Adding, reordering and editing need only create and update.
    caller.session = editor;
    expect(demoCan(editor, "landing_sections.update")).toBe(true);
    expect(demoCan(editor, "landing_sections.create")).toBe(true);
    expect(demoCan(editor, "landing_sections.delete")).toBe(false);

    const before = await sections();
    await store.saveLandingSections([
      { id: "col_added", widget: "faq", size: "md", title: "Added by an editor" },
      ...[...before].reverse().map((section) => ({
        ...section,
        title: section.id === "sec_faq" ? "Edited by an editor" : section.title,
      })),
    ]);

    expect(await ids()).toEqual(["col_added", "sec_faq", "sec_pricing", "sec_hero"]);
  });

  it("refuses an editor the removal the role does not have, without moving anything", async () => {
    caller.session = editor;

    await expect(
      store.saveLandingSections((await sections()).filter((section) => section.id !== "sec_pricing")),
    ).rejects.toThrow(/may not delete/);
    // A refusal that had already renumbered positions would leave the page reordered rather than as
    // it was, so what survived is asserted and not the message alone.
    expect(await ids()).toEqual(["sec_hero", "sec_pricing", "sec_faq"]);
    expect(await positions()).toEqual([0, 1, 2]);
  });

  it("lets an administrator remove, and leaves no row behind at a parked position", async () => {
    caller.session = owner;

    await store.saveLandingSections((await sections()).filter((section) => section.id !== "sec_pricing"));

    expect(await ids()).toEqual(["sec_hero", "sec_faq"]);
    // A row left at a negative position would be read back as a section that was meant to be gone.
    expect(await positions()).toEqual([0, 1]);
  });
});

/**
 * The same reconciliation against a real SQLite database, so the migration's constraint is enforced
 * rather than assumed.
 *
 * The in-memory adapter holds no constraints, so it can answer "did the arrangement survive" and never
 * "did the write obey `UNIQUE (page, position)`". A reorder that moved rows one at a time passes
 * every test above and fails on the second row of every swap, which only appears once a database is
 * involved.
 */
describe("a reorder against a real database", () => {
  let directory: string | null = null;
  let client: Client | null = null;
  let real: Store;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "helmdeck-landing-"));
    client = createClient({ url: `file:${join(directory, "demo.db")}` });
    for (const name of readdirSync(join(process.cwd(), "fixtures/lib/migrations")).sort()) {
      // executeMultiple, not execute: a migration file is a script, and execute runs only its first
      // statement, which is the PRAGMA.
      await client.executeMultiple(
        readFileSync(join(process.cwd(), "fixtures/lib/migrations", name), "utf8"),
      );
    }

    const { createTursoPersistenceAdapter, resetTursoAdapterCache } = await import(
      "../fixtures/lib/turso-persistence"
    );
    resetTursoAdapterCache();
    // The same bridge demo-persistence.ts builds for the real driver: `SqlClient` is a narrow
    // structural type and the driver's `execute` is overloaded, so the two do not line up without a
    // cast even though the runtime shape is the one the adapter asks for.
    const adapter = createTursoPersistenceAdapter(client as never);

    vi.resetModules();
    vi.doMock("../fixtures/lib/demo-persistence", () => ({
      demoPersistence: () => ({ adapter, kind: "turso" }),
      assertDemoPersistenceConfigured: () => undefined,
    }));
    const actions = await import("../fixtures/lib/demo-collections");

    const allRows = () => adapter.query<Row>("landing_sections");
    real = {
      ...actions,
      allRows,
      landingRows: async () =>
        (await allRows())
          .filter((row) => row.page === "landing")
          .sort((left, right) => left.position - right.position),
      otherPageRows: async () => (await allRows()).filter((row) => row.page !== "landing"),
    };

    caller.session = owner;
    await real.saveLandingSections([
      { id: "sec_a", widget: "hero", size: "xl", title: "A" },
      { id: "sec_b", widget: "faq", size: "sm", title: "B" },
      { id: "sec_c", widget: "pricing", size: "md", title: "C" },
    ]);
  });

  afterEach(() => {
    client?.close();
    client = null;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = null;
  });

  it("swaps two sections without a row landing on a position another holds", async () => {
    const before = await real.readLandingSections();

    // A swap is the case that cannot be done in one pass, so it is the case that proves the parking.
    await real.saveLandingSections([before[1], before[0], before[2]]);

    expect((await real.readLandingSections()).map((section) => section.id)).toEqual([
      "sec_b",
      "sec_a",
      "sec_c",
    ]);
    expect((await real.landingRows()).map((row) => row.position)).toEqual([0, 1, 2]);
  });

  it("reverses the page, which moves every row at once", async () => {
    const before = await real.readLandingSections();

    await real.saveLandingSections([...before].reverse());

    expect((await real.readLandingSections()).map((section) => section.id)).toEqual([
      "sec_c",
      "sec_b",
      "sec_a",
    ]);
  });

  it("reads back a heading the driver would otherwise hand over parsed", async () => {
    // The adapter parses a text column on the way out when it happens to be valid JSON, so a heading
    // of "42" arrives as the number 42 and one of "null" as nothing, unless the store coerces back
    // to the text each was written as.
    await real.saveLandingSections([
      { id: "sec_a", widget: "hero", size: "xl", title: "42" },
      { id: "sec_b", widget: "faq", size: "sm", title: "null" },
    ]);

    const reloaded = await real.readLandingSections();
    expect(reloaded[0].title).toBe("42");
    expect(reloaded[1].title).toBe("null");
    // A number would still render, so the type of what came back is asserted as well as its value.
    expect(typeof reloaded[0].title).toBe("string");
  });
});
