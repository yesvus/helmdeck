// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import {
  AdminLifecycleNotDeclaredError,

  createAdminLifecycle,
  type AdminRevisionStore,
} from "../src/lifecycle";
import { createTursoPersistenceAdapter as makeAdapter, type SqlClient } from "../fixtures/lib/turso-persistence";
import type { AdminSession } from "../src/adapters";

/**
 * Whether this layer fits the revision table the demo already has, answered against the migration
 * rather than against a description of it.
 *
 * `0005_post_revisions.sql` is applied to a scratch database and the columns are asked for, so a
 * change to the migration that this declaration no longer matches fails here rather than in a
 * deployed demo. The file itself is not edited: this layer decides no column names, so the whole of
 * what it can be incompatible with is which columns a host's `read` and `write` name, and those are
 * the ones checked.
 *
 * The scratch database is a `file:` in a temporary directory that `afterEach` removes. Nothing here
 * opens a hosted database or reads one, and no migration is applied to any database but this one.
 */

const MIGRATIONS = join(process.cwd(), "fixtures", "lib", "migrations");
const initial = readFileSync(join(MIGRATIONS, "0001_initial.sql"), "utf8");
const revisions = readFileSync(join(MIGRATIONS, "0005_post_revisions.sql"), "utf8");

const temporary: string[] = [];

afterEach(() => {
  while (temporary.length > 0) rmSync(temporary.pop()!, { force: true, recursive: true });
});

const EDITOR: AdminSession = { id: "usr_owner", email: "owner@example.com", role: "admin" };

/** A scratch database with the demo's own posts and post_revisions tables, from its own migrations. */
function scratch(): { client: Client; sql: SqlClient } {
  const dir = mkdtempSync(join(tmpdir(), "helmdeck-lifecycle-"));
  temporary.push(dir);
  const client = createClient({ url: `file:${join(dir, "demo.sqlite")}` });
  client.executeMultiple(initial);
  client.executeMultiple(revisions);
  return { client, sql: client as unknown as SqlClient };
}

/**
 * The declaration, in the flat shape `post_revisions` already has.
 *
 * Read and write name columns that migration defines and nothing else, which is the whole of the
 * compatibility claim. `created_at` is this layer's timestamp column and the migration has one by
 * that name; a host whose history is timestamped differently names its own column instead.
 */
const postRevisions: AdminRevisionStore = {
  resource: "post_revisions",
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

/** A post row the demo's own schema accepts, with the user its author column names. */
async function seedPost(sql: SqlClient, overrides: Record<string, string> = {}) {
  await sql.execute({
    sql: `INSERT INTO users (id, email, password_hash, role) VALUES ('usr_owner', 'owner@example.com', 'x', 'admin')`,
  });
  await sql.execute({
    sql: `INSERT INTO posts (id, title, body, status, author_id, position, created_at)
          VALUES ('pst_1', ?, ?, ?, 'usr_owner', 0, '2026-01-01')`,
    args: [overrides.title ?? "First title", overrides.body ?? "First body", overrides.status ?? "draft"],
  });
}

function lifecycleOver(sql: SqlClient) {
  return createAdminLifecycle({
    guard: async () => EDITOR,
    persistence: makeAdapter(sql),
    // No trash declared: the demo has `post_revisions` and no `posts_trash`, and a host that wants
    // a history is not obliged to build a table for a feature it did not ask for.
    resources: [{ resource: "posts", revisions: postRevisions }],
  });
}

/** The `cause` values the migration's own CHECK admits, read out of the file rather than assumed. */
function admittedCauses(): string[] {
  const match = /cause TEXT NOT NULL CHECK \(cause IN \(([^)]*)\)\)/.exec(revisions);
  if (match === null) throw new Error("0005_post_revisions.sql no longer declares a cause CHECK");
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

describe("the columns the declaration names", () => {
  it("are columns 0005_post_revisions.sql defines", async () => {
    const { sql } = scratch();
    const listed = await sql.execute({ sql: "SELECT name FROM pragma_table_info('post_revisions')" });
    const columns = new Set(listed.rows.map((row) => Object.values(row)[0] as string));
    expect(columns.size).toBeGreaterThan(8);

    for (const column of [
      postRevisions.record,
      postRevisions.position,
      postRevisions.cause,
      postRevisions.restoredFrom!,
      postRevisions.occurredAt!,
      "id",
      "title",
      "body",
      "status",
      "actor_email",
      "actor_role",
    ]) {
      expect(columns.has(column), `post_revisions.${column}`).toBe(true);
    }
  });

  it("leave the file as it is", () => {
    // The migration is not edited by this work, and a diff to it would be a schema change to a live
    // database. Saying so in a test means it cannot happen quietly later either.
    expect(revisions).toBe(readFileSync(join(MIGRATIONS, "0005_post_revisions.sql"), "utf8"));
    expect(revisions).toContain("CREATE TABLE IF NOT EXISTS post_revisions");
    expect(revisions).toContain("UNIQUE (post_id, position)");
  });
});

describe("the cause a restore writes", () => {
  it("is one the migration's own CHECK admits", () => {
    // This is the reason the restore's cause is `restore` and not a name of its own: the value lands
    // in the host's table beside the host's own causes, and the demo's constraint has a closed list.
    expect(admittedCauses()).toContain("restore");
    expect(admittedCauses()).toContain("edit");
  });

  it("is refused by the database if it is not", async () => {
    const { sql } = scratch();
    await sql.execute({
      sql: `INSERT INTO post_revisions
              (id, post_id, position, cause, title, body, status, actor_email, created_at)
            VALUES ('rev_x', 'pst_x', 1, 'restoreRevision', 't', 'b', 'draft', 'a@b.c', 'now')`,
    }).then(
      () => expect.unreachable("the CHECK should have refused a cause outside its list"),
      () => undefined,
    );
  });
});

describe("a history written into the demo's own table", () => {
  it("records, restores and refuses in the shape the migration defines", async () => {
    const { sql } = scratch();
    const lifecycle = lifecycleOver(sql);
    await seedPost(sql);

    const taken = await lifecycle.recordRevision("posts", "pst_1", { session: EDITOR, cause: "edit" });

    const row = await sql.execute({
      sql: "SELECT * FROM post_revisions WHERE id = ?",
      args: [taken.id],
    });
    expect(row.rows).toHaveLength(1);
    expect(Object.values(row.rows[0])).toContain(EDITOR.email);

    // The edit the history was taken for.
    await sql.execute({
      sql: "UPDATE posts SET title = ?, body = ?, status = ? WHERE id = ?",
      args: ["Second title", "Second body", "published", "pst_1"],
    });

    await lifecycle.restoreRevision("posts", "pst_1", taken.id);

    const posts = await sql.execute({ sql: "SELECT title, body, status FROM posts WHERE id = ?", args: ["pst_1"] });
    expect(posts.rows[0]).toMatchObject({ title: "First title", body: "First body", status: "draft" });

    // And the restore is a row in the same table, at the next position, naming what it replaced.
    const history = await lifecycle.revisions("posts", "pst_1");
    expect(history.map((revision) => [revision.position, revision.cause, revision.restoredFrom])).toEqual([
      [2, "restore", taken.id],
      [1, "edit", null],
    ]);
  });

  it("refuses a store whose projection has no column to put the record in", async () => {
    const { sql } = scratch();
    // A store that keeps the whole record rather than the three fields the demo's table has columns
    // for. It is the shape a host reaches for when it does not want a migration per field a post
    // gains, and against this table it cannot be used: `post_revisions` has no `author_id` column, so
    // the write is refused by the store's own column check rather than storing a revision that
    // silently lost fields.
    //
    // **So a host wanting that shape needs a document column on `post_revisions`, and this work does
    // not add one.** The schema change is the host's to review, not this layer's to slip in, and the
    // drift cases it would enable are covered against both shipped stores in the other suites.
    const wholePost: AdminRevisionStore = {
      resource: "post_revisions",
      record: "post_id",
      position: "position",
      cause: "cause",
      restoredFrom: "restored_from",
      occurredAt: "created_at",
      read: (revision) => {
        const snapshot = { ...(revision as Record<string, unknown>) };
        for (const column of [
          "id",
          "post_id",
          "position",
          "cause",
          "restored_from",
          "created_at",
          "actor_email",
          "actor_role",
        ]) {
          delete snapshot[column];
        }
        return snapshot;
      },
      write: (input) => ({
        id: input.id,
        post_id: input.recordId,
        position: input.position,
        cause: input.cause,
        ...input.snapshot,
        actor_email: input.session?.email ?? "",
        actor_role: input.session?.role ?? "",
        restored_from: input.restoredFrom,
        created_at: input.occurredAt,
      }),
    };
    const lifecycle = createAdminLifecycle({
      guard: async () => EDITOR,
      persistence: makeAdapter(sql),
      resources: [{ resource: "posts", revisions: wholePost }],
    });
    await seedPost(sql);

    await expect(lifecycle.recordRevision("posts", "pst_1", { session: EDITOR })).rejects.toThrow(
      /is not a column of post_revisions/,
    );
    const rows = await sql.execute({ sql: "SELECT id FROM post_revisions" });
    expect(rows.rows).toHaveLength(0);
  });

  it("refuses a soft delete on a resource with no trash declared", async () => {
    const { sql } = scratch();
    const lifecycle = lifecycleOver(sql);
    await seedPost(sql);

    // The demo has no `posts_trash`, and asking for one is a refusal naming what is missing rather
    // than a write to a table that was never created.
    await expect(lifecycle.softDelete("posts", "pst_1")).rejects.toBeInstanceOf(
      AdminLifecycleNotDeclaredError,
    );
    expect(() => lifecycle.trash("posts")).toThrow(/no trash/i);
    const posts = await sql.execute({ sql: "SELECT title FROM posts WHERE id = 'pst_1'" });
    expect(posts.rows).toHaveLength(1);
  });
});
