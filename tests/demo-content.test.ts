// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { hashPassword } from "@yesvus/helmdeck/baseline";
import { AdminPermissionDeniedError } from "@yesvus/helmdeck";
import { signInAction } from "../fixtures/app/login/actions";
import { CONTENT_STATUSES, isContentStatus } from "../fixtures/app/shell/content/content-status";
import { contentPosts } from "../fixtures/app/shell/content/content-registry";
import { contentPersistence } from "../fixtures/app/shell/content/content-persistence";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { demoCan } from "../fixtures/lib/demo-rules";
import { seedPosts } from "../fixtures/lib/seed-data";
import { createTursoPersistenceAdapter, resetTursoAdapterCache, type SqlClient } from "../fixtures/lib/turso-persistence";
import {
  createContentPost,
  deleteContentPost,
  readContentPost,
  readContentPosts,
  updateContentPost,
} from "../fixtures/lib/demo-content";

/**
 * The content actions, asked at the action rather than at a function.
 *
 * The whole point of the milestone is that a change survives a reload, and "a reload" is a claim about
 * a store rather than about a variable. So nothing below holds a value it wrote: every assertion of
 * persistence goes back through the action to the store, and every one of those reads is a second
 * call to the code the browser would make. A demo that kept its rows in a closure would pass a test
 * that read the closure and fail this one.
 *
 * The session comes from the published sign-in and the guard is the real one, so a refusal here is the
 * refusal a visitor posting the action directly would get. The permission rule is not stubbed: if the
 * roles move, these tests move with them.
 */
const request = vi.hoisted(() => ({ session: undefined as string | undefined }));

const guard = vi.hoisted(() => {
  class RedirectSignal extends Error {}
  return { RedirectSignal };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "helmdeck_session" && request.session !== undefined
        ? { name, value: request.session }
        : undefined,
    set: (name: string, value: string) => {
      request.session = value;
    },
    delete: () => {
      request.session = undefined;
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new guard.RedirectSignal(url);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const [owner, editor] = demoAccounts;
const store = demoPersistence().adapter;

async function signIn(account: { email: string }) {
  const result = await signInAction({ email: account.email, password: DEMO_PASSWORD }, "");
  expect(result.ok).toBe(true);
  return request.session;
}

/**
 * The account row, with the role it holds.
 *
 * The whole row, not just the role: an update replaces the record rather than merging into it, and the
 * accounts are what a sign-in now reads, so a role-only write would leave a row with no address and
 * no hash, which is answered exactly as an address nobody has. These tests change the role and
 * nothing else about the account.
 */
async function setRole(account: { id: string; email: string; role: string }, role: unknown) {
  await store.update("users", account.id, {
    id: account.id,
    email: account.email,
    role,
    password_hash: await publishedHash(),
  });
}

/** One hash for the file, because scrypt is deliberately slow and the password is the same one. */
let published: Promise<string> | null = null;
const publishedHash = () => (published ??= hashPassword(DEMO_PASSWORD));

beforeEach(async () => {
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  await ensureDemoSeeded();
  for (const row of await store.query<{ id: string }>("sessions")) {
    await store.delete("sessions", row.id);
  }
  for (const account of demoAccounts) {
    await setRole(account, account.role);
  }
  // Exactly the seeded rows, and nothing else. A test that changes a post has changed it for the
  // file, and one that created one would leave it behind for a later count to trip over, so the store
  // is put back rather than tidied.
  const seededIds = new Set(seedPosts.map((row) => row.id));
  for (const row of await store.query<{ id: string }>("posts")) {
    if (!seededIds.has(row.id)) await store.delete("posts", row.id);
  }
  for (const row of seedPosts) {
    await store.update("posts", row.id, row);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the seeded posts, read back", () => {
  it("returns every seeded post, with the seed's own values rather than the definition's", async () => {
    await signIn(owner);

    const posts = await readContentPosts();

    expect(posts.map((post) => post.id).sort()).toEqual(seedPosts.map((post) => post.id).sort());
    for (const seeded of seedPosts) {
      const found = posts.find((post) => post.id === seeded.id);
      expect(found, seeded.id).toMatchObject({ title: seeded.title, body: seeded.body, status: seeded.status });
    }
  });

  it("orders by the position the column stores, so the list is the arrangement rather than an accident", async () => {
    await signIn(owner);

    const posts = await readContentPosts();
    const positions = posts.map((post) => post.position);

    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    // The seed positions its own posts 0, 1, 2, so an order that ignored them would have to be a
    // coincidence for all three to land ascending.
    expect(posts.map((post) => post.id)).toEqual(seedPosts.map((post) => post.id));
  });

  it("reads a title and a body that arrived as something other than text as the text that was written", async () => {
    // The driver parses a text column on the way back when it happens to be valid JSON, so a post
    // titled "42" arrives as the number 42 and one titled "null" arrives as nothing at all. Read
    // naively, the second loses its name on the way to the screen and the first reaches a form that
    // will write it back as a string. The values are put in the store as those parsed values, because
    // going through the action would write text and the parser would be exercised in the driver
    // rather than here.
    await signIn(owner);
    const created = await createContentPost({ title: "Typed normally", body: "Typed normally" });
    await store.update("posts", created.id, { title: null, body: 42, status: "published" });

    const found = await readContentPost(created.id);

    expect(found).toMatchObject({ title: "null", body: "42", status: "published" });
    expect(typeof found?.title).toBe("string");
    expect(typeof found?.body).toBe("string");
  });

  it("refuses everyone when nobody is signed in", async () => {
    request.session = undefined;

    await expect(readContentPosts()).rejects.toThrow(guard.RedirectSignal);
    await expect(createContentPost({ title: "x" })).rejects.toThrow(guard.RedirectSignal);
    await expect(deleteContentPost("pst_1")).rejects.toThrow(guard.RedirectSignal);
  });
});

describe("editing a post", () => {
  it("survives a reload, read back through a second call rather than held in a variable", async () => {
    await signIn(owner);

    const saved = await updateContentPost("pst_1", {
      title: "Shipping to the EU, updated",
      body: "Germany and the Netherlands only, from March.",
    });

    // The store, not the answer: the shape of a returned record is what a write claimed about itself.
    const stored = await store.read<{ title: string; body: string }>("posts", "pst_1");
    expect(stored).toMatchObject({
      title: "Shipping to the EU, updated",
      body: "Germany and the Netherlands only, from March.",
    });
    expect(saved.title).toBe(stored?.title);
  });

  it("writes only the fields it was given, so an edit cannot blank the body it did not mention", async () => {
    // A definition that declared every column and sent empty strings for the untouched ones would
    // quietly empty a post's body on a title change, and the form would report success.
    await signIn(owner);

    await updateContentPost("pst_2", { title: "Winter hours, extended" });

    const stored = await store.read<{ title: string; body: string }>("posts", "pst_2");
    expect(stored).toMatchObject({ title: "Winter hours, extended", body: "Support is on reduced cover between the 24th and the 2nd." });
  });

  it("refuses a blank title rather than storing one, which is what the column's own check does", async () => {
    await signIn(owner);

    await expect(updateContentPost("pst_1", { title: "   " })).rejects.toThrow(/needs a title/);

    expect(await readContentPost("pst_1")).toMatchObject({ title: "Shipping to the EU from the new warehouse" });
  });

  it("trims a title rather than storing the spaces a person typed around it", async () => {
    await signIn(owner);

    await updateContentPost("pst_1", { title: "  EU shipping  " });

    expect(await readContentPost("pst_1")).toMatchObject({ title: "EU shipping" });
  });
});

describe("a post's status", () => {
  it("moves between draft and published, and the change is in the store afterwards", async () => {
    await signIn(owner);

    await updateContentPost("pst_3", { status: "published" });
    expect(await store.read<{ status: string }>("posts", "pst_3")).toMatchObject({ status: "published" });

    await updateContentPost("pst_3", { status: "draft" });
    expect(await store.read<{ status: string }>("posts", "pst_3")).toMatchObject({ status: "draft" });
  });

  it("refuses a status the column cannot hold, on both stores", async () => {
    // The CHECK constraint is the guarantee; the action's own list is what makes the in-memory store
    // agree with it, so a demo running without a database does not quietly accept a value its schema
    // forbids. Both are exercised here rather than only the one this store happens to be.
    await signIn(owner);

    await expect(updateContentPost("pst_1", { status: "archived" })).rejects.toThrow(/not a status/);
    expect(await store.read<{ status: string }>("posts", "pst_1")).toMatchObject({ status: "published" });

    const dir = mkdtempSync(join(tmpdir(), "helmdeck-content-"));
    const client = createClient({ url: `file:${join(dir, "demo.db")}` });
    try {
      for (const name of readdirSync(join(process.cwd(), "fixtures/lib/migrations")).sort()) {
        await client.executeMultiple(readFileSync(join(process.cwd(), "fixtures/lib/migrations", name), "utf8"));
      }
      resetTursoAdapterCache();
      const sql = createTursoPersistenceAdapter(client as unknown as SqlClient);

      // A migrated database holds the table and no rows, so the post this constraint is about is
      // written first. A CHECK on an absent row proves nothing.
      await sql.create("posts", { ...seedPosts[0] });

      await expect(sql.update("posts", "pst_1", { status: "archived" })).rejects.toThrow();
      expect(await sql.read<{ status: string }>("posts", "pst_1")).toMatchObject({ status: "published" });
    } finally {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("agrees with the column's constraint rather than restating it", async () => {
    // The list the action checks is a copy of a CHECK constraint, and a copy drifts. This is what
    // catches the drift, and it is a parse of the migration rather than a comment about it.
    const migration = readFileSync(join(process.cwd(), "fixtures/lib/migrations/0001_initial.sql"), "utf8");
    const constraint = migration.match(/status TEXT NOT NULL DEFAULT 'draft' CHECK \(status IN \(([^)]*)\)\)/);
    expect(constraint, "the posts status constraint").not.toBeNull();

    const inTheColumn = [...(constraint?.[1] ?? "").matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(inTheColumn).toEqual([...CONTENT_STATUSES]);
  });

  it("is the only two values, so nothing in the demo can name a third", () => {
    expect(CONTENT_STATUSES).toEqual(["draft", "published"]);
    for (const value of ["draft", "published"]) expect(isContentStatus(value)).toBe(true);
    for (const value of ["", "Draft", "archived", "published ", 1, null, undefined]) {
      expect(isContentStatus(value), String(value)).toBe(false);
    }
  });
});

describe("creating a post", () => {
  it("lands at the end of the list, past the posts already there", async () => {
    await signIn(owner);
    const before = await readContentPosts();

    const created = await createContentPost({ title: "Autumn sale", body: "Starts Monday." });

    const after = await readContentPosts();
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1].id).toBe(created.id);
    expect(created.position).toBeGreaterThan(0);
  });

  it("stores a new post as a draft, which is the column's own default rather than a choice", async () => {
    // Stated as the column's default because it is one: an update that published a draft nobody
    // published would be the demo making a decision nobody made.
    await signIn(owner);

    const created = await createContentPost({ title: "Winter sale" });

    expect(created.status).toBe("draft");
    expect(await store.read<{ status: string }>("posts", created.id)).toMatchObject({ status: "draft" });
  });

  it("refuses a blank title, so the column's check has nothing to catch", async () => {
    await signIn(owner);

    await expect(createContentPost({ title: "" })).rejects.toThrow(/needs a title/);
  });
});

describe("the roles, at the action rather than at the button", () => {
  it("serves an editor its content and refuses the delete the administrator is given", async () => {
    await signIn(editor);

    expect(await readContentPosts()).toHaveLength(seedPosts.length);

    // The package's guard refuses, and names the permission it was asked rather than the operation in
    // a sentence of its own: the same fact, in the wording the host's rule is written in.
    await expect(deleteContentPost("pst_1")).rejects.toThrow(AdminPermissionDeniedError);
    await expect(deleteContentPost("pst_1")).rejects.toThrow("This session may not posts.delete");
    // Refused before the write, so the post is intact rather than deleted with an error shown.
    expect(await readContentPost("pst_1")).not.toBeNull();
  });

  it("still lets an editor write content, so the rule is a split rather than a wall", async () => {
    await signIn(editor);

    const created = await createContentPost({ title: "Editor's post", body: "Written by the editor." });
    await updateContentPost(created.id, { status: "published" });

    expect(await readContentPost(created.id)).toMatchObject({ status: "published" });
    expect(demoCan({ email: editor.email, role: "editor" }, "posts.update")).toBe(true);
    expect(demoCan({ email: editor.email, role: "editor" }, "posts.delete")).toBe(false);
  });

  it("performs the administrator's delete, which the same call refused for the editor", async () => {
    await signIn(owner);

    await deleteContentPost("pst_1");

    expect(await readContentPost("pst_1")).toBeNull();
    await store.create("posts", { ...seedPosts[0] });
  });

  it("leaves orders unreachable from the content pages, whatever the role", async () => {
    // The content adapter is wired to the post actions alone, so a definition pointed at another table
    // is refused rather than served through the post actions while labelled with another resource.
    for (const account of [owner, editor]) {
      await signIn(account);
      await expect(contentPersistence.query("orders")).rejects.toThrow(/not a resource the content pages/);
      await expect(contentPersistence.read("orders", "ord_1")).rejects.toThrow(/not a resource the content pages/);
      await expect(contentPersistence.update("orders", "ord_1", { status: "paid" })).rejects.toThrow(
        /not a resource the content pages/,
      );
      await expect(contentPersistence.delete("orders", "ord_1")).rejects.toThrow(
        /not a resource the content pages/,
      );
    }
  });
});

describe("the content definition", () => {
  it("names only columns and fields the seeded records actually have", () => {
    // A column naming a field nothing stores renders an empty cell for ever, and a form field naming
    // one writes a key no record can be read back through. The store has no schema to catch either.
    const stored = new Set(Object.keys(seedPosts[0] ?? {}));
    for (const column of contentPosts.columns) {
      expect(stored, `column ${column.key}`).toContain(column.key);
    }
    for (const field of contentPosts.fields) {
      expect(stored, `field ${field.name}`).toContain(field.name);
    }
  });

  it("declares permissions in the form the rule parses, and the rule grants them", () => {
    // `demoCan` takes the resource from the text before the first dot, so a permission written any
    // other way is denied for ever and looks exactly like a roles problem.
    for (const operation of ["read", "create", "update", "delete"] as const) {
      const permission = contentPosts.permissions?.[operation];
      expect(permission).toBe(`posts.${operation}`);
      expect(demoCan({ email: owner.email, role: "admin" }, permission as string)).toBe(true);
    }
  });

  it("routes to the content path the pages are mounted at", () => {
    expect(contentPosts.path).toBe("content");
    expect(contentPosts.resource).toBe("posts");
  });
});
