// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { createSqlitePersistenceAdapter } from "../src/baseline/sqlite";
import {
  AdminLifecycleChildError,
  AdminLifecycleStateError,
  AdminRevisionDriftError,
  AdminRevisionUnknownError,
  createAdminLifecycle,
  type AdminRevisionStore,
} from "../src/lifecycle";
import type { AdminPersistenceAdapter, AdminSession } from "../src/adapters";

/**
 * The same lifecycle questions through both stores the package ships, answered the same way.
 *
 * The two adapters are interchangeable by contract, and the demo runs on whichever one the environment
 * supplies. A history or a trash that worked on one and not the other would make content behaviour
 * depend on configuration, which nothing on the page can show. So each case below runs a script of
 * calls against both stores and compares what a caller can observe after every step, rather than
 * comparing the answers once at the end.
 *
 * `file::memory:` gives the SQLite adapter a real database, because the questions here are about what
 * comes back out of a JSON document column and about a duplicate id being refused by the store rather
 * than by the layer.
 */

const POSTS = "posts";
const REVISIONS = "post_revisions";
const POST_TRASH = "posts_trash";
const PAGES = "pages";
const WHOLE_REVISIONS = "page_revisions";
const PAGE_TRASH = "pages_trash";
const COMMENTS = "comments";

const EDITOR: AdminSession = { id: "usr_editor", email: "editor@example.com", role: "editor" };

const POST_REVISION_COLUMNS = {
  resource: REVISIONS,
  record: "post_id",
  position: "position",
  cause: "cause",
  restoredFrom: "restored_from",
  occurredAt: "created_at",
  read: (revision: Record<string, unknown>) => ({
    title: String(revision.title ?? ""),
    body: String(revision.body ?? ""),
    status: revision.status === "published" ? "published" : "draft",
  }),
  write: (input: {
    id: string;
    recordId: string;
    position: number;
    cause: string;
    snapshot: Record<string, unknown>;
    session: AdminSession | null;
    restoredFrom: string | null;
    occurredAt: string;
  }) => ({
    id: input.id,
    post_id: input.recordId,
    position: input.position,
    cause: input.cause,
    title: input.snapshot.title,
    body: input.snapshot.body,
    status: input.snapshot.status,
    actor_email: input.session?.email ?? "",
    restored_from: input.restoredFrom,
    created_at: input.occurredAt,
  }),
};

const OWN = ["id", "record_id", "position", "cause", "restored_from", "created_at", "actor_email"];

const PAGE_REVISION_COLUMNS: AdminRevisionStore = {
  resource: WHOLE_REVISIONS,
  record: "record_id",
  position: "position",
  cause: "cause",
  restoredFrom: "restored_from",
  occurredAt: "created_at",
  read: (revision) => {
    const snapshot = { ...(revision as Record<string, unknown>) };
    for (const column of OWN) delete snapshot[column];
    return snapshot;
  },
  write: (input) => ({
    id: input.id,
    record_id: input.recordId,
    position: input.position,
    cause: input.cause,
    ...input.snapshot,
    actor_email: input.session?.email ?? "",
    restored_from: input.restoredFrom,
    created_at: input.occurredAt,
  }),
};

function wire(store: AdminPersistenceAdapter, children: unknown[] = []) {
  const resources = [
    { resource: POSTS, trash: POST_TRASH, revisions: POST_REVISION_COLUMNS, children: children as never },
    { resource: PAGES, trash: PAGE_TRASH, revisions: PAGE_REVISION_COLUMNS },
    { resource: COMMENTS, trash: "comments_trash" },
  ];
  return createAdminLifecycle({
    guard: async () => EDITOR,
    persistence: store,
    resources,
  });
}

/** The two shipped stores, each seeded the same way through the same contract. */
function stores(): [string, AdminPersistenceAdapter][] {
  return [
    ["memory", createMemoryPersistenceAdapter() as AdminPersistenceAdapter],
    ["sqlite", createSqlitePersistenceAdapter({ url: "file::memory:" })],
  ];
}

/**
 * Runs one script against one store, recording what a caller observes after each step.
 *
 * The observation is deliberately the ordinary read path and the list counts, not the layer's own
 * return values, because the two agreeing is the property and either one alone would not show a
 * disagreement.
 */
type Observation = [string | null, number, number, string | null, number, string[]];

async function observe(
  store: AdminPersistenceAdapter,
  steps: readonly string[],
): Promise<Observation[]> {
  const lifecycle = wire(store);
  const seen: Observation[] = [];

  for (const step of steps) {
    switch (step) {
      case "seed two posts":
        await store.create(POSTS, { id: "pst_1", title: "First", body: "b", status: "draft" });
        await store.create(POSTS, { id: "pst_2", title: "Second", body: "b", status: "draft" });
        break;
      case "record a revision":
        await lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR });
        break;
      case "edit the post":
        await store.update(POSTS, "pst_1", { id: "pst_1", title: "Edited", body: "c", status: "published" });
        break;
      case "clear a field":
        await store.update(POSTS, "pst_1", { id: "pst_1", title: "Edited", body: "", status: "published" });
        break;
      case "restore the revision":
        await lifecycle.restoreRevision(POSTS, "pst_1", "pst_1_1");
        break;
      case "soft delete one":
        await lifecycle.softDelete(POSTS, "pst_1");
        break;
      case "untrash one":
        await lifecycle.restoreFromTrash(POSTS, "pst_1");
        break;
      case "purge one":
        await lifecycle.purge(POSTS, "pst_1");
        break;
      case "trash twice":
        await lifecycle.softDelete(POSTS, "pst_1");
        await expect(lifecycle.softDelete(POSTS, "pst_1")).rejects.toBeInstanceOf(AdminLifecycleStateError);
        break;
      case "untrash what is live":
        await expect(lifecycle.restoreFromTrash(POSTS, "pst_1")).rejects.toBeInstanceOf(
          AdminLifecycleStateError,
        );
        break;
      case "restore a revision that is not one of the record's":
        await expect(lifecycle.restoreRevision(POSTS, "pst_1", "pst_9_9")).rejects.toBeInstanceOf(
          AdminRevisionUnknownError,
        );
        break;
      case "drop a column, then restore":
        await store.create(PAGES, { id: "pag_1", heading: "A page", legacy_score: 7 });
        await lifecycle.recordRevision(PAGES, "pag_1", { session: EDITOR });
        await store.update(PAGES, "pag_1", { id: "pag_1", heading: "A page" });
        await expect(lifecycle.restoreRevision(PAGES, "pag_1", "pag_1_1")).rejects.toBeInstanceOf(
          AdminRevisionDriftError,
        );
        break;
      case "drop a column, accept it, then restore":
        await store.create(PAGES, { id: "pag_1", heading: "A page", legacy_score: 7 });
        await lifecycle.recordRevision(PAGES, "pag_1", { session: EDITOR });
        await store.update(PAGES, "pag_1", { id: "pag_1", heading: "A page" });
        await lifecycle.restoreRevision(PAGES, "pag_1", "pag_1_1", { dropFields: ["legacy_score"] });
        break;
      case "reference a post from a comment":
        await store.create(COMMENTS, { id: "cmt_1", post_id: "pst_1", body: "A remark" });
        break;
      default:
        throw new Error(`no step named ${step}`);
    }
    // What a caller sees after this step, on every path that matters.
    const live = await store.queryPage?.(POSTS, {});
    const trashed = await store.queryPage?.(POST_TRASH, {});
    const history = await lifecycle
      .revisions(POSTS, "pst_1")
      .then((revisions) => revisions.map((revision) => `${revision.position}:${revision.cause}`))
      .catch(() => ["refused"]);
    seen.push([
      (await store.read<{ title: string }>(POSTS, "pst_1"))?.title ?? null,
      live?.total ?? -1,
      live?.rows.length ?? -1,
      (await store.read<{ title: string }>(POST_TRASH, "pst_1"))?.title ?? null,
      trashed?.total ?? -1,
      history,
    ]);
  }
  return seen;
}

/** Runs the same steps on both stores, then fails if the two readings differ anywhere. */
async function bothStores(steps: readonly string[]) {
  const readings = new Map<string, Observation[]>();
  for (const [name, store] of stores()) readings.set(name, await observe(store, steps));
  expect(readings.get("sqlite")).toEqual(readings.get("memory"));
  return readings;
}

describe("both shipped stores keep the same history", () => {
  it("restores the same record to the same state", async () => {
    const readings = await bothStores([
      "seed two posts",
      "record a revision",
      "edit the post",
      "restore the revision",
    ]);
    expect(readings.get("memory")?.at(-1)).toEqual(["First", 2, 2, null, 0, ["2:restore", "1:edit"]]);
  });

  it("brings a cleared field back on both", async () => {
    const readings = await bothStores([
      "seed two posts",
      "record a revision",
      "clear a field",
      "restore the revision",
    ]);
    expect(readings.get("memory")?.at(-1)).toEqual(["First", 2, 2, null, 0, ["2:restore", "1:edit"]]);
  });
});

describe("both shipped stores keep the same trash", () => {
  it("counts the same row out of the live list and into the trash list", async () => {
    const readings = await bothStores(["seed two posts", "soft delete one"]);
    expect(readings.get("memory")?.at(-1)).toEqual([null, 1, 1, "First", 1, []]);
  });

  it("counts it back in when it comes out", async () => {
    const readings = await bothStores(["seed two posts", "soft delete one", "untrash one"]);
    expect(readings.get("memory")?.at(-1)).toEqual(["First", 2, 2, null, 0, []]);
  });

  it("removes it for good", async () => {
    const readings = await bothStores(["seed two posts", "soft delete one", "purge one"]);
    expect(readings.get("memory")?.at(-1)).toEqual([null, 1, 1, null, 0, []]);
  });

  it("refuses a second trash the same way, leaving one row in the trash", async () => {
    const readings = await bothStores(["seed two posts", "trash twice"]);
    expect(readings.get("memory")?.at(-1)).toEqual([null, 1, 1, "First", 1, []]);
  });

  it("refuses untrashing a live record the same way", async () => {
    const readings = await bothStores(["seed two posts", "untrash what is live"]);
    expect(readings.get("memory")?.at(-1)).toEqual(["First", 2, 2, null, 0, []]);
  });
});

describe("both shipped stores refuse the same restores", () => {
  it("refuses a revision belonging to another record", async () => {
    const readings = await bothStores([
      "seed two posts",
      "record a revision",
      "edit the post",
      "restore a revision that is not one of the record's",
    ]);
    expect(readings.get("memory")?.at(-1)).toEqual(["Edited", 2, 2, null, 0, ["1:edit"]]);
  });

  it("refuses a column dropped since the revision, and keeps the record", async () => {
    const readings = await bothStores(["drop a column, then restore"]);
    expect(readings.get("memory")?.at(-1)).toEqual([null, 0, 0, null, 0, []]);
  });

  it("goes through the same way once the caller accepts losing the field", async () => {
    const readings = await bothStores(["drop a column, accept it, then restore"]);
    expect(readings.get("memory")?.at(-1)).toEqual([null, 0, 0, null, 0, []]);
  });
});

describe("the store refuses a duplicate revision id rather than overwriting", () => {
  it("lets one of two racing records through, on both stores", async () => {
    for (const [name, store] of stores()) {
      await store.create(POSTS, { id: "pst_1", title: "First", body: "b", status: "draft" });
      const lifecycle = wire(store);
      const settled = await Promise.allSettled([
        lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR }),
        lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR }),
      ]);
      expect(settled.filter((one) => one.status === "fulfilled"), name).toHaveLength(1);
      expect(await store.query(REVISIONS), name).toHaveLength(1);
    }
  });
});

describe("a child reference", () => {
  it("refuses the trash on both stores, naming the same row", async () => {
    for (const [name, store] of stores()) {
      await store.create(POSTS, { id: "pst_1", title: "First", body: "b", status: "draft" });
      await store.create(COMMENTS, { id: "cmt_1", post_id: "pst_1", body: "A remark" });
      const lifecycle = wire(store, [{ resource: COMMENTS, field: "post_id" }]);

      const refusal = await lifecycle.softDelete(POSTS, "pst_1").then(() => null).catch((cause) => cause);

      expect(refusal, name).toBeInstanceOf(AdminLifecycleChildError);
      expect((refusal as AdminLifecycleChildError).referrers[0].rows.map((row) => row.id), name).toEqual([
        "cmt_1",
      ]);
      expect(await store.read(POST_TRASH, "pst_1"), name).toBeNull();
      expect(await store.read(COMMENTS, "cmt_1"), name).toMatchObject({ post_id: "pst_1" });
    }
  });
});
