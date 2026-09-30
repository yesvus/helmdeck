// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import {
  AdminLifecycleChildError,
  AdminLifecycleNotDeclaredError,
  AdminLifecycleScopeError,
  AdminLifecycleStateError,
  AdminRevisionDriftError,
  AdminRevisionUnknownError,
  createAdminLifecycle,
  type AdminChildDeclaration,
  type AdminLifecycleDeclaration,
  type AdminRevisionStore,
} from "../src/lifecycle";
import type { AdminPersistenceAdapter, AdminSession } from "../src/adapters";

/**
 * Revision history and a trash, over the store the whole admin already reads through.
 *
 * Every assertion is on what a caller observes: the row read back through `persistence`, the rows a
 * list's `queryPage` counts, the history read back through `lifecycle.revisions`. Nothing asserts on
 * an internal counter, because a lifecycle whose bookkeeping says one thing and whose read path says
 * another is the failure this whole layer exists to prevent, and a test on the bookkeeping would pass
 * through exactly that.
 */

const POSTS = "posts";
const REVISIONS = "post_revisions";
const POST_TRASH = "posts_trash";
const PAGES = "pages";
const WHOLE_REVISIONS = "page_revisions";
const PAGE_TRASH = "pages_trash";
const COMMENTS = "comments";
const COMMENT_TRASH = "comments_trash";

const EDITOR: AdminSession = { id: "usr_editor", email: "editor@example.com", role: "editor" };

const FIRST: Record<string, unknown> = {
  id: "pst_1",
  title: "Shipping to the EU",
  body: "Transit times drop to two days.",
  status: "draft",
};

const SECOND: Record<string, unknown> = {
  id: "pst_1",
  title: "Shipping to the EU and the UK",
  body: "Transit times drop to two days for Germany, France and the Netherlands.",
  status: "published",
};

/**
 * A revision store in the flat shape a content table reaches for: one real column per recorded field.
 *
 * `write` receives the whole record and picks the fields its own table has columns for, which is the
 * decision this layer hands over. `read` is the other half and is what bounds what a restore can
 * bring back: a field this does not return is a field this table never held and therefore a field no
 * restore could put back. The demo's `post_revisions` is declared exactly like this, which is what
 * `lifecycle-demo-schema.test.ts` checks against the real migration.
 */
const postRevisions: AdminRevisionStore = {
  resource: REVISIONS,
  record: "post_id",
  position: "position",
  cause: "cause",
  restoredFrom: "restored_from",
  occurredAt: "created_at",
  read: (revision) => ({
    title: String(revision.title ?? ""),
    body: String(revision.body ?? ""),
    status: revision.status === "published" ? "published" : "draft",
  }),
  write: (input) => ({
    id: input.id,
    post_id: input.recordId,
    position: input.position,
    cause: input.cause,
    title: input.snapshot.title,
    body: input.snapshot.body,
    status: input.snapshot.status,
    actor_email: input.session?.email ?? "",
    actor_role: input.session?.role ?? "",
    restored_from: input.restoredFrom,
    created_at: input.occurredAt,
  }),
};

/**
 * A revision store that keeps the whole record, which is the shape a document column or a table with
 * a JSON payload takes.
 *
 * This is the one that makes column drift possible at all, and it is worth having beside the flat one
 * for that reason: a store that keeps only the fields its table has columns for has no history of a
 * field it never stored, so there is nothing for a restore to lose. A store that keeps the whole row
 * does, and so is the one whose revisions can outlive a dropped column.
 */
/** The columns this store owns rather than the record's, so a snapshot is the record. */
const WHOLE_REVISIONS_OWN = [
  "id",
  "record_id",
  "position",
  "cause",
  "restored_from",
  "created_at",
  "actor_email",
];

const wholeRevisions: AdminRevisionStore = {
  resource: WHOLE_REVISIONS,
  record: "record_id",
  position: "position",
  cause: "cause",
  restoredFrom: "restored_from",
  occurredAt: "created_at",
  read: (revision) => {
    const snapshot = { ...(revision as Record<string, unknown>) };
    for (const column of WHOLE_REVISIONS_OWN) delete snapshot[column];
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

const commentRevisions: AdminRevisionStore = {
  ...postRevisions,
  resource: "comment_revisions",
  record: "comment_id",
  read: (revision) => ({ body: String(revision.body ?? "") }),
  write: (input) => ({
    id: input.id,
    comment_id: input.recordId,
    position: input.position,
    cause: input.cause,
    body: input.snapshot.body,
    actor_email: input.session?.email ?? "",
    created_at: input.occurredAt,
    restored_from: input.restoredFrom,
  }),
};

type Children = Partial<Record<string, readonly AdminChildDeclaration[]>>;

function declarations(children: Children = {}): AdminLifecycleDeclaration[] {
  return [
    { resource: POSTS, trash: POST_TRASH, revisions: postRevisions, children: children[POSTS] ?? [] },
    { resource: PAGES, trash: PAGE_TRASH, revisions: wholeRevisions, children: children[PAGES] ?? [] },
    {
      resource: COMMENTS,
      trash: COMMENT_TRASH,
      revisions: commentRevisions,
      children: children[COMMENTS] ?? [],
    },
  ];
}

type Harness = {
  store: AdminPersistenceAdapter;
  lifecycle: ReturnType<typeof createAdminLifecycle>;
  asked: string[];
  audit: Array<{ action: string; resource: string; resourceId?: string }>;
  invalidated: Array<{ resource: string; resourceId?: string; operation: string }>;
};

function harness(options: { children?: Children; allow?: (permission: string) => boolean } = {}): Harness {
  const store = createMemoryPersistenceAdapter() as AdminPersistenceAdapter;
  const asked: string[] = [];
  const audit: Harness["audit"] = [];
  const invalidated: Harness["invalidated"] = [];
  const allow = options.allow ?? (() => true);
  const lifecycle = createAdminLifecycle({
    guard: async (permission) => {
      asked.push(permission);
      if (!allow(permission)) throw new Error(`${permission} is refused`);
      return EDITOR;
    },
    persistence: store,
    resources: declarations(options.children ?? {}),
    audit: {
      record: async (event) =>
        void audit.push({
          action: event.action,
          resource: event.resource,
          resourceId: event.resourceId,
        }),
    },
    cache: {
      invalidate: async (input) =>
        void invalidated.push({
          resource: input.resource,
          resourceId: input.resourceId,
          operation: input.operation,
        }),
    },
  });
  return { store, lifecycle, asked, audit, invalidated };
}

async function seed(store: AdminPersistenceAdapter, rows: Record<string, unknown>[]) {
  for (const row of rows) await store.create(row.id?.toString().startsWith("cmt") ? COMMENTS : POSTS, row);
}

let h: Harness;

beforeEach(() => {
  h = harness();
});

describe("a revision restores what a record said before the change", () => {
  it("puts the state back, and the ordinary read path is where it shows", async () => {
    await seed(h.store, [FIRST]);
    const taken = await h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR });
    expect(taken.position).toBe(1);
    expect(taken.cause).toBe("edit");
    expect(taken.snapshot).toEqual({
      title: "Shipping to the EU",
      body: "Transit times drop to two days.",
      status: "draft",
    });

    await h.store.update(POSTS, "pst_1", SECOND);

    const restored = await h.lifecycle.restoreRevision(POSTS, "pst_1", taken.id);

    // Read back through the adapter the rest of the admin uses, not through the layer that wrote it.
    expect(await h.store.read(POSTS, "pst_1")).toEqual(FIRST);
    expect(restored.record).toEqual(FIRST);
    expect(restored.written).toEqual(["body", "status", "title"]);
  });

  it("brings back a field somebody deliberately cleared, which a diff could not", async () => {
    await seed(h.store, [FIRST]);
    const taken = await h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR });
    await h.store.update(POSTS, "pst_1", { ...FIRST, title: "" });

    await h.lifecycle.restoreRevision(POSTS, "pst_1", taken.id);

    expect((await h.store.read<{ title: string }>(POSTS, "pst_1"))?.title).toBe("Shipping to the EU");
  });

  it("records the restore in the history, so the restore is reversible", async () => {
    await seed(h.store, [FIRST]);
    const taken = await h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR });
    await h.store.update(POSTS, "pst_1", SECOND);

    const restored = await h.lifecycle.restoreRevision(POSTS, "pst_1", taken.id);
    const history = await h.lifecycle.revisions(POSTS, "pst_1");

    expect(history.map((revision) => [revision.position, revision.cause])).toEqual([
      [2, "restore"],
      [1, "edit"],
    ]);
    expect(history[0].restoredFrom).toBe(taken.id);
    expect(restored.revision.id).toBe(history[0].id);

    // And putting the replaced version back again returns the record to where it was.
    await h.lifecycle.restoreRevision(POSTS, "pst_1", history[0].id);
    expect(await h.store.read(POSTS, "pst_1")).toEqual(SECOND);
  });

  it("asks the guard about reading a history and about restoring, and neither for recording", async () => {
    await seed(h.store, [FIRST]);
    const taken = await h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR });
    h.asked.length = 0;
    await h.lifecycle.revisions(POSTS, "pst_1");
    await h.lifecycle.restoreRevision(POSTS, "pst_1", taken.id);
    expect(h.asked).toEqual(["posts.readRevisions", "posts.restoreRevision"]);
  });

  it("refuses a revision filed against another record, whatever its content says", async () => {
    await seed(h.store, [FIRST, { id: "pst_2", title: "Another post", body: "b", status: "draft" }]);
    // A revision holding exactly the content this record has now, filed against the other post. The
    // lookup is over this record's own history, so the content being right changes nothing.
    await h.store.create(REVISIONS, {
      id: "rev_pst_2_1",
      post_id: "pst_2",
      position: 1,
      cause: "edit",
      title: FIRST.title,
      body: FIRST.body,
      status: FIRST.status,
      actor_email: EDITOR.email,
      actor_role: EDITOR.role,
      restored_from: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    await expect(h.lifecycle.restoreRevision(POSTS, "pst_1", "rev_pst_2_1")).rejects.toBeInstanceOf(
      AdminRevisionUnknownError,
    );
    expect(await h.store.read(POSTS, "pst_1")).toEqual(FIRST);
  });

  it("refuses a revision filed against another record, whatever its id looks like", async () => {
    await seed(h.store, [FIRST, { id: "pst_2", title: "Another post", body: "b", status: "draft" }]);
    const other = await h.lifecycle.recordRevision(POSTS, "pst_2", { session: EDITOR });

    await expect(h.lifecycle.restoreRevision(POSTS, "pst_1", other.id)).rejects.toBeInstanceOf(
      AdminRevisionUnknownError,
    );
    expect(await h.store.read(POSTS, "pst_1")).toEqual(FIRST);
  });

  it("refuses a revision whose position is not a whole number", async () => {
    await seed(h.store, [FIRST]);
    await h.store.create(REVISIONS, {
      id: "rev_broken",
      post_id: "pst_1",
      position: "third",
      cause: "edit",
      title: "Unorderable",
      body: "b",
      status: "draft",
      restored_from: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    await expect(h.lifecycle.revisions(POSTS, "pst_1")).rejects.toThrow(/post_revisions/);
  });
});

describe("a restore against a record whose columns changed", () => {
  const page = (overrides: Record<string, unknown> = {}) => ({
    id: "pag_1",
    heading: "How we ship",
    ...overrides,
  });

  it("keeps a column added after the revision, and names what it did not touch", async () => {
    await h.store.create(PAGES, page());
    const taken = await h.lifecycle.recordRevision(PAGES, "pag_1", { session: EDITOR });
    await h.store.update(PAGES, "pag_1", page({ heading: "How we ship now", summary: "Two day delivery" }));

    const restored = await h.lifecycle.restoreRevision(PAGES, "pag_1", taken.id);

    // A column added since the revision has no value in it to bring back. Nulling it would be the
    // quiet failure, so the current value is kept and named.
    expect(restored.retained).toEqual(["summary"]);
    const row = await h.store.read<{ heading: string; summary: string }>(PAGES, "pag_1");
    expect(row?.summary).toBe("Two day delivery");
    expect(row?.heading).toBe("How we ship");
  });

  it("refuses a column dropped since the revision, by name, and changes nothing", async () => {
    await h.store.create(PAGES, page({ legacy_score: 7 }));
    const taken = await h.lifecycle.recordRevision(PAGES, "pag_1", { session: EDITOR });
    // The column is gone from the record. The revision still holds it, because a snapshot is the
    // whole row and this store keeps the whole row.
    await h.store.update(PAGES, "pag_1", page({ heading: "How we ship now" }));
    expect(Object.keys((await h.store.read(PAGES, "pag_1"))!)).toEqual(["id", "heading"]);

    const drift = await h.lifecycle
      .restoreRevision(PAGES, "pag_1", taken.id)
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(drift).toBeInstanceOf(AdminRevisionDriftError);
    expect((drift as AdminRevisionDriftError).fields).toEqual(["legacy_score"]);
    // Refused before the write, so the record is where it was rather than half restored, and no
    // revision claims a restore that did not happen.
    expect(await h.store.read(PAGES, "pag_1")).toEqual(page({ heading: "How we ship now" }));
    expect(await h.lifecycle.revisions(PAGES, "pag_1")).toHaveLength(1);
  });

  it("goes through once the caller accepts losing the field, and reports the loss", async () => {
    await h.store.create(PAGES, page({ legacy_score: 7 }));
    const taken = await h.lifecycle.recordRevision(PAGES, "pag_1", { session: EDITOR });
    await h.store.update(PAGES, "pag_1", page({ heading: "How we ship now" }));

    const restored = await h.lifecycle.restoreRevision(PAGES, "pag_1", taken.id, {
      dropFields: ["legacy_score"],
    });

    expect(restored.dropped).toEqual(["legacy_score"]);
    expect(restored.written).toEqual(["heading"]);
    expect(await h.store.read(PAGES, "pag_1")).toEqual(page());
  });

  it("still refuses a field the caller did not name in dropFields", async () => {
    await h.store.create(PAGES, page({ legacy_score: 7, retired_tag: "x" }));
    const taken = await h.lifecycle.recordRevision(PAGES, "pag_1", { session: EDITOR });
    await h.store.update(PAGES, "pag_1", page({ heading: "How we ship now" }));

    await expect(
      h.lifecycle.restoreRevision(PAGES, "pag_1", taken.id, { dropFields: ["legacy_score"] }),
    ).rejects.toThrow(/retired_tag/);
  });

  it("has nothing to drop for a store whose read bounds the history it kept", async () => {
    // The post store's `read` returns three fields, so `legacy_score` never reaches its revision
    // table and a restore has no opinion about a column it was never told about.
    await seed(h.store, [{ ...FIRST, legacy_score: 7 }]);
    const taken = await h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR });
    await h.store.update(POSTS, "pst_1", SECOND);

    const restored = await h.lifecycle.restoreRevision(POSTS, "pst_1", taken.id);

    expect(restored.dropped).toEqual([]);
    expect(restored.retained).toEqual([]);
    expect(await h.store.read(POSTS, "pst_1")).toEqual(FIRST);
  });
});

describe("a trashed record is gone from the list and readable in the trash", () => {
  it("counts it out of the live list and into the trash list", async () => {
    await seed(h.store, [
      FIRST,
      { id: "pst_2", title: "Another post", body: "b", status: "draft" },
    ]);
    expect((await h.store.queryPage?.(POSTS, {}))?.total).toBe(2);

    await h.lifecycle.softDelete(POSTS, "pst_1");

    const live = (await h.store.queryPage?.(POSTS, {})) ?? { rows: [], total: 0 };
    const trash = h.lifecycle.trash(POSTS);
    const trashed = (await trash.queryPage?.(POST_TRASH, {})) ?? { rows: [], total: 0 };

    expect(live.total).toBe(1);
    expect(live.rows.map((row) => (row as { id: string }).id)).toEqual(["pst_2"]);
    expect(trashed.total).toBe(1);
    expect(trashed.rows.map((row) => (row as { id: string }).id)).toEqual(["pst_1"]);
    // The count agreeing with the rows is the property: a total taken from the live table cannot
    // disagree with what the live table holds, because the row left it rather than being hidden.
    expect(await h.store.read(POSTS, "pst_1")).toBeNull();
    expect(await h.store.read(POST_TRASH, "pst_1")).toEqual(FIRST);
    expect(await trash.read(POST_TRASH, "pst_1")).toEqual(FIRST);
    expect((await h.store.query(POSTS)).map((row) => (row as { id: string }).id)).toEqual(["pst_2"]);
  });

  it("excludes a trashed record from a search and a window, not only from a bare list", async () => {
    await seed(h.store, [FIRST, { id: "pst_2", title: "Shipping to the EU and the UK", body: "b", status: "draft" }]);
    await h.lifecycle.softDelete(POSTS, "pst_1");

    const page = await h.store.queryPage?.(POSTS, {
      search: "Shipping to the EU",
      window: { offset: 0, limit: 10 },
    });
    expect(page?.total).toBe(1);
    expect(page?.rows.map((row) => (row as { id: string }).id)).toEqual(["pst_2"]);
  });

  it("brings a record back out of the trash, through the ordinary read path", async () => {
    await seed(h.store, [FIRST]);
    await h.lifecycle.softDelete(POSTS, "pst_1");

    await h.lifecycle.restoreFromTrash(POSTS, "pst_1");

    expect(await h.store.read(POSTS, "pst_1")).toEqual(FIRST);
    expect(await h.store.read(POST_TRASH, "pst_1")).toBeNull();
    expect((await h.store.queryPage?.(POSTS, {}))?.total).toBe(1);
  });

  it("removes a trashed record for good", async () => {
    await seed(h.store, [FIRST]);
    await h.lifecycle.softDelete(POSTS, "pst_1");

    await h.lifecycle.purge(POSTS, "pst_1");

    expect(await h.store.read(POST_TRASH, "pst_1")).toBeNull();
    expect((await h.lifecycle.trash(POSTS).queryPage?.(POST_TRASH, {}))?.total).toBe(0);
  });
});

describe("an operation asked of a record in the wrong state is refused", () => {
  it("refuses trashing a record that is in the trash, and writes nothing", async () => {
    await seed(h.store, [FIRST]);
    await h.lifecycle.softDelete(POSTS, "pst_1");

    const refusal = await h.lifecycle
      .softDelete(POSTS, "pst_1")
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(refusal).toBeInstanceOf(AdminLifecycleStateError);
    expect((refusal as AdminLifecycleStateError).state).toBe("trashed");
    expect((await h.lifecycle.trash(POSTS).queryPage?.(POST_TRASH, {}))?.total).toBe(1);
  });

  it("refuses untrashing a record that was never trashed", async () => {
    await seed(h.store, [FIRST]);

    const refusal = await h.lifecycle
      .restoreFromTrash(POSTS, "pst_1")
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(refusal).toBeInstanceOf(AdminLifecycleStateError);
    expect((refusal as AdminLifecycleStateError).state).toBe("live");
    expect(await h.store.read(POSTS, "pst_1")).toEqual(FIRST);
  });

  it("refuses purging a record that was never trashed", async () => {
    await seed(h.store, [FIRST]);
    await expect(h.lifecycle.purge(POSTS, "pst_1")).rejects.toThrow(/live/);
    expect(await h.store.read(POSTS, "pst_1")).toEqual(FIRST);
  });

  it("refuses an operation on a record that is not there", async () => {
    for (const operation of ["softDelete", "restoreFromTrash", "purge"] as const) {
      const refusal = await h.lifecycle[operation](POSTS, "pst_absent")
        .then(() => null)
        .catch((cause: unknown) => cause);
      expect(refusal).toBeInstanceOf(AdminLifecycleStateError);
      expect((refusal as AdminLifecycleStateError).state).toBe("missing");
    }
  });

  it("refuses untrashing a record that a new one has taken the id of", async () => {
    await seed(h.store, [FIRST]);
    await h.lifecycle.softDelete(POSTS, "pst_1");
    await h.store.create(POSTS, { id: "pst_1", title: "Written again", body: "b", status: "draft" });

    const refusal = await h.lifecycle
      .restoreFromTrash(POSTS, "pst_1")
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(refusal).toBeInstanceOf(AdminLifecycleStateError);
    expect((refusal as AdminLifecycleStateError).state).toBe("both");
    expect(await h.store.read<{ title: string }>(POSTS, "pst_1")).toEqual({
      id: "pst_1",
      title: "Written again",
      body: "b",
      status: "draft",
    });
  });

  it("refuses a resource no lifecycle was declared for", async () => {
    await expect(h.lifecycle.softDelete("orders", "ord_1")).rejects.toBeInstanceOf(
      AdminLifecycleNotDeclaredError,
    );
  });
});

describe("rows pointing at a record that is taken away", () => {
  const comment = (id: string, post: string) => ({ id, post_id: post, body: "A remark" });

  it("refuses by default, names the rows, and moves nothing", async () => {
    h = harness({ children: { [POSTS]: [{ resource: COMMENTS, field: "post_id" }] } });
    await seed(h.store, [FIRST]);
    await h.store.create(COMMENTS, comment("cmt_1", "pst_1"));

    const refusal = await h.lifecycle
      .softDelete(POSTS, "pst_1")
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(refusal).toBeInstanceOf(AdminLifecycleChildError);
    expect((refusal as AdminLifecycleChildError).referrers[0]).toMatchObject({
      resource: COMMENTS,
      field: "post_id",
    });
    expect((refusal as AdminLifecycleChildError).referrers[0].rows.map((row) => row.id)).toEqual(["cmt_1"]);
    expect(await h.store.read(POSTS, "pst_1")).toEqual(FIRST);
    expect(await h.store.read(COMMENTS, "cmt_1")).toEqual(comment("cmt_1", "pst_1"));
  });

  it("leaves a reference pointing where it pointed when the declaration says keep", async () => {
    h = harness({ children: { [POSTS]: [{ resource: COMMENTS, field: "post_id", on: "keep" }] } });
    await seed(h.store, [FIRST]);
    await h.store.create(COMMENTS, comment("cmt_1", "pst_1"));

    await h.lifecycle.softDelete(POSTS, "pst_1");

    // The reference is intact and still names the same id, which the trash holds. Whether a listing
    // can cope with that is the host's call, and `keep` is the host saying it can.
    expect(await h.store.read<{ post_id: string }>(COMMENTS, "cmt_1")).toEqual(comment("cmt_1", "pst_1"));
    expect(await h.store.read(POST_TRASH, "pst_1")).toEqual(FIRST);
  });

  it("takes the referencing rows into the same trash, and reports that it did", async () => {
    h = harness({ children: { [POSTS]: [{ resource: COMMENTS, field: "post_id", on: "trash" }] } });
    await seed(h.store, [FIRST]);
    await h.store.create(COMMENTS, comment("cmt_1", "pst_1"));
    await h.store.create(COMMENTS, comment("cmt_2", "pst_2"));

    const move = await h.lifecycle.softDelete(POSTS, "pst_1");

    expect(move.moved).toEqual([
      { resource: POSTS, id: "pst_1" },
      { resource: COMMENTS, id: "cmt_1" },
    ]);
    expect(await h.store.read(COMMENTS, "cmt_1")).toBeNull();
    expect(await h.store.read(COMMENT_TRASH, "cmt_1")).toEqual(comment("cmt_1", "pst_1"));
    // A comment on a post that is still there is left where it was.
    expect(await h.store.read(COMMENTS, "cmt_2")).toEqual(comment("cmt_2", "pst_2"));
  });

  it("follows a reference round a cycle once rather than for ever", async () => {
    h = harness({
      children: {
        [POSTS]: [{ resource: COMMENTS, field: "post_id", on: "trash" }],
        [COMMENTS]: [{ resource: POSTS, field: "id", on: "trash" }],
      },
    });
    await seed(h.store, [FIRST]);
    await h.store.create(COMMENTS, comment("cmt_1", "pst_1"));

    const move = await h.lifecycle.softDelete(POSTS, "pst_1");

    expect(move.moved).toEqual([
      { resource: POSTS, id: "pst_1" },
      { resource: COMMENTS, id: "cmt_1" },
    ]);
  });

  it("moves nothing when the walk reaches a reference it may not break", async () => {
    h = harness({
      children: {
        [COMMENTS]: [{ resource: PAGES, field: "reply_to", on: "trash" }],
        [PAGES]: [{ resource: COMMENTS, field: "post_id" }],
      },
    });
    // A comment is trashed, which brings the page it replied to, which cannot be trashed because a
    // comment points at it and nothing declared that comment's fate.
    await h.store.create(PAGES, { id: "pag_1", heading: "A page", reply_to: "cmt_1" });
    await h.store.create(COMMENTS, comment("cmt_1", "pst_1"));
    await h.store.create(COMMENTS, comment("cmt_3", "pag_1"));

    const refusal = await h.lifecycle
      .softDelete(COMMENTS, "cmt_1")
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(refusal).toBeInstanceOf(AdminLifecycleChildError);
    expect((refusal as AdminLifecycleChildError).referrers[0].rows.map((row) => row.id)).toEqual(["cmt_3"]);
    // Read before written, so nothing was half moved.
    expect(await h.store.read(COMMENTS, "cmt_1")).toEqual(comment("cmt_1", "pst_1"));
    expect(await h.store.read(COMMENT_TRASH, "cmt_1")).toBeNull();
    expect(await h.store.read(PAGE_TRASH, "pag_1")).toBeNull();
    expect(await h.store.read(PAGES, "pag_1")).toMatchObject({ id: "pag_1" });
  });

  it("refuses a purge while rows point at the record", async () => {
    h = harness({ children: { [POSTS]: [{ resource: COMMENTS, field: "post_id" }] } });
    await h.store.create(POST_TRASH, FIRST);
    await h.store.create(COMMENTS, comment("cmt_1", "pst_1"));

    await expect(h.lifecycle.purge(POSTS, "pst_1")).rejects.toBeInstanceOf(AdminLifecycleChildError);
    expect(await h.store.read(POST_TRASH, "pst_1")).toEqual(FIRST);
  });

  it("purges a trashed record whose references were declared keep", async () => {
    h = harness({ children: { [POSTS]: [{ resource: COMMENTS, field: "post_id", on: "keep" }] } });
    await h.store.create(POST_TRASH, FIRST);
    await h.store.create(COMMENTS, comment("cmt_1", "pst_1"));

    await h.lifecycle.purge(POSTS, "pst_1");

    expect(await h.store.read(POST_TRASH, "pst_1")).toBeNull();
    expect(await h.store.read(COMMENTS, "cmt_1")).toEqual(comment("cmt_1", "pst_1"));
  });
});

describe("a trash scope", () => {
  it("refuses to read another resource, so a list on it cannot show a live row", async () => {
    await seed(h.store, [FIRST]);
    const trash = h.lifecycle.trash(POSTS);
    await expect(trash.read(POSTS, "pst_1")).rejects.toBeInstanceOf(AdminLifecycleScopeError);
    await expect(trash.query(POSTS)).rejects.toBeInstanceOf(AdminLifecycleScopeError);
  });

  it("refuses a write, because a trashed row is not a live one", async () => {
    await seed(h.store, [FIRST]);
    await h.lifecycle.softDelete(POSTS, "pst_1");
    const trash = h.lifecycle.trash(POSTS);
    await expect(trash.create(POST_TRASH, FIRST)).rejects.toBeInstanceOf(AdminLifecycleScopeError);
    await expect(trash.update(POST_TRASH, "pst_1", FIRST)).rejects.toBeInstanceOf(AdminLifecycleScopeError);
    expect(await h.store.read(POST_TRASH, "pst_1")).toEqual(FIRST);
  });

  it("routes the delete a list's row control sends through purge, and asks about it", async () => {
    await seed(h.store, [FIRST]);
    await h.lifecycle.softDelete(POSTS, "pst_1");
    const trash = h.lifecycle.trash(POSTS);

    await trash.delete(POST_TRASH, "pst_1");

    expect(h.asked).toContain("posts.purge");
    expect(await h.store.read(POST_TRASH, "pst_1")).toBeNull();
  });
});

describe("what a move reports", () => {
  it("names the operation, forgets both keys, and records one event", async () => {
    await seed(h.store, [FIRST]);
    await h.lifecycle.softDelete(POSTS, "pst_1");
    await h.lifecycle.restoreFromTrash(POSTS, "pst_1");
    await h.lifecycle.softDelete(POSTS, "pst_1");
    await h.lifecycle.purge(POSTS, "pst_1");

    expect(h.audit).toEqual([
      { action: "softDelete", resource: POSTS, resourceId: "pst_1" },
      { action: "restoreFromTrash", resource: POSTS, resourceId: "pst_1" },
      { action: "softDelete", resource: POSTS, resourceId: "pst_1" },
      { action: "purge", resource: POSTS, resourceId: "pst_1" },
    ]);
    expect(h.invalidated.slice(0, 2)).toEqual([
      { resource: POSTS, resourceId: "pst_1", operation: "delete" },
      { resource: POST_TRASH, resourceId: "pst_1", operation: "create" },
    ]);
  });

    it("keeps its own columns even when a store spreads the record over them", async () => {
    // The store that keeps whole rows spreads the record's own `id` and `position` after the ones
    // it was given, which is the order that loses a revision. The columns the layer reads back are
    // the columns the layer writes, so two revisions are two rows rather than one overwritten.
    await h.store.create(PAGES, { id: "pag_1", heading: "How we ship", position: 99 });
    const first = await h.lifecycle.recordRevision(PAGES, "pag_1", { session: EDITOR });
    await h.store.update(PAGES, "pag_1", { id: "pag_1", heading: "How we ship now", position: 99 });
    const second = await h.lifecycle.recordRevision(PAGES, "pag_1", { session: EDITOR });

    expect([first.id, second.id, first.position, second.position]).toEqual(["pag_1_1", "pag_1_2", 1, 2]);
    expect(await h.store.query(WHOLE_REVISIONS)).toHaveLength(2);
    const rows = await h.store.query<{ id: string; position: number }>(WHOLE_REVISIONS);
    expect(rows.map((row) => row.id).sort()).toEqual(["pag_1_1", "pag_1_2"]);
  });

  it("records and forgets nothing for a call it refused", async () => {
    await seed(h.store, [FIRST]);
    await h.lifecycle.softDelete(POSTS, "pst_1");
    h.audit.length = 0;
    h.invalidated.length = 0;

    await expect(h.lifecycle.softDelete(POSTS, "pst_1")).rejects.toBeInstanceOf(AdminLifecycleStateError);
    await expect(h.lifecycle.restoreFromTrash(POSTS, "pst_2")).rejects.toBeInstanceOf(
      AdminLifecycleStateError,
    );

    expect(h.audit).toEqual([]);
    expect(h.invalidated).toEqual([]);
  });

  it("records and forgets nothing for a restore it refused over drift", async () => {
    await h.store.create(PAGES, { id: "pag_1", heading: "How we ship", legacy_score: 7 });
    const taken = await h.lifecycle.recordRevision(PAGES, "pag_1", { session: EDITOR });
    await h.store.update(PAGES, "pag_1", { id: "pag_1", heading: "How we ship now" });
    h.audit.length = 0;
    h.invalidated.length = 0;

    await expect(h.lifecycle.restoreRevision(PAGES, "pag_1", taken.id)).rejects.toBeInstanceOf(
      AdminRevisionDriftError,
    );

    expect(h.audit).toEqual([]);
    expect(h.invalidated).toEqual([]);
  });

  it("keeps the write that happened when the audit sink refuses", async () => {
    const store = createMemoryPersistenceAdapter() as AdminPersistenceAdapter;
    await store.create(POSTS, FIRST);
    const lifecycle = createAdminLifecycle({
      guard: async () => EDITOR,
      persistence: store,
      resources: declarations(),
      audit: {
        record: async () => {
          throw new Error("the sink is down");
        },
      },
      onAdapterError: (cause) => void cause,
    });

    await lifecycle.softDelete(POSTS, "pst_1");

    expect(await store.read(POST_TRASH, "pst_1")).toEqual(FIRST);
  });
});

describe("the constructor", () => {
  it("refuses to build actions with nothing deciding them", () => {
    expect(() =>
      createAdminLifecycle({ guard: undefined as never, persistence: h.store, resources: declarations() }),
    ).toThrow(/guard/);
  });

  it("asks the host's resolver for the permission name rather than assuming one", async () => {
    const asked: string[] = [];
    const store = createMemoryPersistenceAdapter() as AdminPersistenceAdapter;
    await store.create(POSTS, FIRST);
    const lifecycle = createAdminLifecycle({
      guard: async (permission) => {
        asked.push(permission);
        return EDITOR;
      },
      persistence: store,
      resources: declarations(),
      permission: (resource, operation) => `${resource}.${operation}`.toUpperCase(),
    });

    await lifecycle.softDelete(POSTS, "pst_1");

    expect(asked).toEqual(["POSTS.SOFTDELETE"]);
  });

  it("refuses to ask about an operation with no permission name for it", async () => {
    const empty = createAdminLifecycle({
      guard: async () => EDITOR,
      persistence: h.store,
      resources: declarations(),
      permission: () => "",
    });

    await expect(empty.softDelete(POSTS, "pst_1")).rejects.toThrow(/No permission name/);
  });

  it("records a revision under the cause it was given", async () => {
    await seed(h.store, [FIRST]);

    const taken = await h.lifecycle.recordRevision(POSTS, "pst_1", { cause: "publish", session: EDITOR });

    expect(taken.cause).toBe("publish");
    expect(await h.store.read<{ cause: string }>(REVISIONS, taken.id)).toMatchObject({ cause: "publish" });
  });
});

describe("a history written before this layer existed", () => {
  it("reads rows the demo's own migration defines, without one of them changing", async () => {
    await seed(h.store, [FIRST]);
    // Exactly the row shape 0005_post_revisions.sql describes, written by something other than this
    // layer, so the reader is checked against the schema rather than against its own writer.
    await h.store.create(REVISIONS, {
      id: "rev_pst_1_1",
      post_id: "pst_1",
      position: 1,
      cause: "publish",
      title: "The first title",
      body: "The first body",
      status: "draft",
      actor_email: "owner@example.com",
      actor_role: "owner",
      restored_from: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const history = await h.lifecycle.revisions(POSTS, "pst_1");

    expect(history).toEqual([
      {
        id: "rev_pst_1_1",
        resource: POSTS,
        recordId: "pst_1",
        position: 1,
        cause: "publish",
        restoredFrom: null,
        occurredAt: "2026-01-01T00:00:00.000Z",
        snapshot: { title: "The first title", body: "The first body", status: "draft" },
      },
    ]);

    // And a restore from it writes the next revision in the same shape, at the next position.
    await h.lifecycle.restoreRevision(POSTS, "pst_1", "rev_pst_1_1");
    const written = await h.store.read<{ position: number; cause: string; restored_from: string }>(
      REVISIONS,
      "pst_1_2",
    );
    expect(written).toMatchObject({ position: 2, cause: "restore", restored_from: "rev_pst_1_1" });
    expect((await h.store.read<{ title: string }>(POSTS, "pst_1"))?.title).toBe("The first title");
  });
});

describe("the clock", () => {
  it("stamps a revision from the process and does not take one from a caller", async () => {
    await seed(h.store, [FIRST]);
    const taken = await h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR });
    const row = await h.store.read<{ created_at: string }>(REVISIONS, taken.id);

    expect(taken.occurredAt).toBe(row?.created_at);
    expect(Number.isNaN(Date.parse(taken.occurredAt))).toBe(false);
  });

  it("carries the session through to the row the host wrote", async () => {
    await seed(h.store, [FIRST]);
    const taken = await h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR });
    const row = await h.store.read<{ actor_email: string; actor_role: string }>(REVISIONS, taken.id);

    expect(row).toMatchObject({ actor_email: EDITOR.email, actor_role: EDITOR.role });
  });
});

describe("guards that refuse", () => {
  it("writes nothing when the permission is refused", async () => {
    h = harness({ allow: (permission) => permission !== "posts.softDelete" });
    await seed(h.store, [FIRST]);

    await expect(h.lifecycle.softDelete(POSTS, "pst_1")).rejects.toThrow(/refused/);
    expect(await h.store.read(POSTS, "pst_1")).toEqual(FIRST);
    expect(await h.store.read(POST_TRASH, "pst_1")).toBeNull();
  });
});

describe("the position a revision takes", () => {
  it("counts up rather than reading the clock, so two saves in one tick stay distinct", async () => {
    await seed(h.store, [FIRST]);
    const first = await h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR });
    const second = await h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR });
    const third = await h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR });

    expect([first.position, second.position, third.position]).toEqual([1, 2, 3]);
    expect([first.id, second.id, third.id]).toEqual(["pst_1_1", "pst_1_2", "pst_1_3"]);
  });

  it("refuses the second of two callers racing for the same position", async () => {
    await seed(h.store, [FIRST]);
    const settled = await Promise.allSettled([
      h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR }),
      h.lifecycle.recordRevision(POSTS, "pst_1", { session: EDITOR }),
    ]);

    // One wins and one is refused. The loser does not overwrite, so the history cannot carry two
    // changes under one id.
    expect(settled.filter((one) => one.status === "fulfilled")).toHaveLength(1);
    expect(await h.store.query(REVISIONS)).toHaveLength(1);
  });
});

describe("a session the caller did not have", () => {
  it("records a revision with no actor rather than refusing", async () => {
    await seed(h.store, [FIRST]);
    const taken = await h.lifecycle.recordRevision(POSTS, "pst_1");

    expect(taken.cause).toBe("edit");
    expect(await h.store.read<{ actor_email: string }>(REVISIONS, taken.id)).toMatchObject({
      actor_email: "",
    });
  });
});

describe("a resource with no revision store", () => {
  it("refuses to record rather than silently keeping no history", async () => {
    const store = createMemoryPersistenceAdapter() as AdminPersistenceAdapter;
    await store.create("pages", { id: "pag_1", title: "A page" });
    const lifecycle = createAdminLifecycle({
      guard: async () => EDITOR,
      persistence: store,
      resources: [{ resource: "pages", trash: "pages_trash" }],
    });

    await expect(lifecycle.recordRevision("pages", "pag_1")).rejects.toBeInstanceOf(
      AdminLifecycleNotDeclaredError,
    );
    expect(await store.query("page_revisions")).toHaveLength(0);
  });
});

describe("the constructor", () => {
  it("refuses to build actions with nothing deciding them", () => {
    expect(() =>
      createAdminLifecycle({ guard: undefined as never, persistence: h.store, resources: declarations() }),
    ).toThrow(/guard/);
  });
});
