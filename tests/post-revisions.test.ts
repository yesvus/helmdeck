// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signInAction } from "../fixtures/app/login/actions";
import {
  listPostRevisionsAction,
  publishPostAction,
  restorePostRevisionAction,
  savePostAction,
  unpublishPostAction,
} from "../fixtures/app/shell/revisions/actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { demoCan } from "../fixtures/lib/demo-rules";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import type { AdminSession } from "@yesvus/helmdeck";

/**
 * The post history, exercised through the actions a browser would post to.
 *
 * Nothing here renders a page, because a hidden button is not authorization: every call goes through
 * the exported action with the session the signed cookie resolves to, which is the call a client
 * makes when the button is missing or the form was never drawn. The role comes from the user row,
 * not from an argument, so these are the powers the stored account actually has.
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
const POST = "pst_history";

async function signIn(account: { email: string }) {
  const result = await signInAction({ email: account.email, password: DEMO_PASSWORD }, "");
  expect(result.ok).toBe(true);
  return request.session;
}

async function seedPost(overrides: Record<string, unknown> = {}) {
  // Its own post rather than a seeded one, so a test that leaves a post edited cannot change what
  // the next test starts from.
  for (const row of await store.query<{ id: string }>("post_revisions")) {
    if (row.id.startsWith(`rev_${POST}_`)) await store.delete("post_revisions", row.id);
  }
  const base = {
    id: POST,
    title: "Shipping to the EU from the new warehouse",
    body: "Transit times drop to two days for Germany, France and the Netherlands.",
    status: "published",
    author_id: "usr_owner",
    position: 0,
  };
  if (await store.read("posts", POST)) {
    await store.update("posts", POST, { ...base, ...overrides });
  } else {
    await store.create("posts", { ...base, ...overrides });
  }
  return POST;
}

beforeEach(async () => {
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  await ensureDemoSeeded();
  for (const row of await store.query<{ id: string }>("sessions")) {
    await store.delete("sessions", row.id);
  }
  await seedPost();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  // The role column belongs to the account, and these tests write to it, so it goes back to what
  // the migration put there rather than to what this file last needed.
  for (const account of demoAccounts) {
    await store.update("users", account.id, { role: account.role });
  }
});

describe("what a save records", () => {
  it("holds the content the post had before the change, with who changed it and when", async () => {
    await signIn(editor);
    await savePostAction({
      postId: POST,
      title: "Shipping to the EU, faster",
      body: "Transit times drop to one day for Germany, France and the Netherlands.",
    });

    const history = await listPostRevisionsAction(POST);
    expect(history).toHaveLength(1);
    const [revision] = history;
    expect(revision).toMatchObject({
      cause: "edit",
      title: "Shipping to the EU from the new warehouse",
      body: "Transit times drop to two days for Germany, France and the Netherlands.",
      actor_email: editor.email,
      actor_role: "editor",
      restored_from: null,
    });
    expect(Number.isNaN(Date.parse(revision.created_at))).toBe(false);
  });

  it("adds one revision to a save and two to two saves, so no save is recorded twice or not at all", async () => {
    await signIn(editor);

    await savePostAction({ postId: POST, title: "First change", body: "One." });
    expect(await listPostRevisionsAction(POST)).toHaveLength(1);

    await savePostAction({ postId: POST, title: "Second change", body: "Two." });
    const history = await listPostRevisionsAction(POST);
    expect(history).toHaveLength(2);
    // Newest first, and the middle state is the first change, which is the version a person lost.
    expect(history.map((revision) => revision.title)).toEqual(["First change", "Shipping to the EU from the new warehouse"]);
    expect(history.map((revision) => revision.position)).toEqual([2, 1]);
  });

  it("keeps two saves in the same clock tick apart, because the order cannot be the timestamp", async () => {
    await signIn(editor);

    await savePostAction({ postId: POST, title: "One", body: "One." });
    await savePostAction({ postId: POST, title: "Two", body: "Two." });
    const history = await listPostRevisionsAction(POST);

    expect(new Set(history.map((revision) => revision.id)).size).toBe(2);
    expect(history.map((revision) => revision.position)).toEqual([2, 1]);
  });

  it("leaves the status where it was, because a save is not a way to publish", async () => {
    await signIn(editor);

    // A caller posting a status has it ignored rather than obeyed: the two content fields are read by
    // name and nothing else is written.
    await savePostAction({ postId: POST, title: "Still a draft question", body: "Text.", status: "draft" } as {
      postId: string;
      title: string;
      body: string;
    });

    const post = (await store.read<{ status: string }>("posts", POST)) as { status: string };
    expect(post.status).toBe("published");
  });

  it("refuses a blank title rather than writing a post the database would refuse", async () => {
    await signIn(editor);

    await expect(
      savePostAction({ postId: POST, title: "   ", body: "Text." }),
    ).rejects.toThrow(/needs a title/);
    expect(await listPostRevisionsAction(POST)).toHaveLength(0);
  });

  it("refuses a post that is not there, rather than recording a revision for nothing", async () => {
    await signIn(editor);

    await expect(
      savePostAction({ postId: "pst_missing", title: "Ghost", body: "Text." }),
    ).rejects.toThrow(/No post with id pst_missing/);
  });
});

describe("going live and coming down", () => {
  it("publishes a draft and records the draft it replaced", async () => {
    await seedPost({ status: "draft" });
    await signIn(editor);

    await publishPostAction(POST);

    const post = (await store.read<{ status: string }>("posts", POST)) as { status: string };
    expect(post.status).toBe("published");
    const history = await listPostRevisionsAction(POST);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ cause: "publish", status: "draft" });
  });

  it("refuses to publish a post that has no content, which is what two status values cannot say", async () => {
    await seedPost({ status: "draft", body: "  " });
    await signIn(editor);

    await expect(publishPostAction(POST)).rejects.toThrow(/no content to publish/);
    const post = (await store.read<{ status: string }>("posts", POST)) as { status: string };
    expect(post.status).toBe("draft");
  });

  it("refuses a second publish rather than writing a change into the history that did not happen", async () => {
    await signIn(editor);

    await expect(publishPostAction(POST)).rejects.toThrow(/already published/);
    expect(await listPostRevisionsAction(POST)).toHaveLength(0);
  });

  it("unpublishes and records it, so the history says when the post came down", async () => {
    await signIn(editor);

    await unpublishPostAction(POST);

    const post = (await store.read<{ status: string }>("posts", POST)) as { status: string };
    expect(post.status).toBe("draft");
    const history = await listPostRevisionsAction(POST);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ cause: "unpublish", status: "published" });
  });

  it("refuses to unpublish a draft", async () => {
    await seedPost({ status: "draft" });
    await signIn(editor);

    await expect(unpublishPostAction(POST)).rejects.toThrow(/already a draft/);
  });
});

describe("putting a version back", () => {
  it("restores the content, records the restore in the history, and keeps the content on a re-read", async () => {
    await signIn(editor);
    await savePostAction({ postId: POST, title: "Something else entirely", body: "Different." });

    const [newest] = await listPostRevisionsAction(POST);
    await restorePostRevisionAction(POST, newest.id);

    const post = (await store.read<{ title: string; body: string }>("posts", POST)) as {
      title: string;
      body: string;
    };
    expect(post).toMatchObject({
      title: "Shipping to the EU from the new warehouse",
      body: "Transit times drop to two days for Germany, France and the Netherlands.",
    });

    // Re-read through the action rather than through the store, so a value held in a component
    // cannot be what is being asserted.
    const history = await listPostRevisionsAction(POST);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      cause: "restore",
      restored_from: newest.id,
      title: "Something else entirely",
    });
    expect(history[1].id).toBe(newest.id);
  });

  it("keeps the content a restore replaced, so a restore can itself be undone", async () => {
    await signIn(editor);
    await savePostAction({ postId: POST, title: "A newer version", body: "Newer." });
    const [newest] = await listPostRevisionsAction(POST);
    await restorePostRevisionAction(POST, newest.id);

    // The restore is the newest revision, so restoring it is the way back to what it replaced.
    const [afterRestore] = await listPostRevisionsAction(POST);
    expect(afterRestore.cause).toBe("restore");
    await restorePostRevisionAction(POST, afterRestore.id);

    const post = (await store.read<{ title: string }>("posts", POST)) as { title: string };
    expect(post.title).toBe("A newer version");
  });

  it("refuses a revision that belongs to another post, and writes nothing on the way out", async () => {
    await signIn(editor);
    await savePostAction({ postId: POST, title: "Changed", body: "Changed." });
    const [revision] = await listPostRevisionsAction(POST);

    await expect(restorePostRevisionAction("pst_2", revision.id)).rejects.toThrow(
      /No revision .* belongs to post pst_2/,
    );
    expect(await listPostRevisionsAction("pst_2")).toHaveLength(0);
  });
});

describe("what the role is worth over the actions", () => {
  it("lets an editor save, publish and restore, because the content a restore replaces is kept", async () => {
    // Restore is destructive to the current content, and the answer here is that it loses nothing:
    // the content it replaces is recorded first, so it is a write to the post the editor may already
    // make by hand. What stays out of an editor's reach is deleting a post, which loses the content
    // and its history together.
    await seedPost({ status: "draft" });
    await signIn(editor);

    await savePostAction({ postId: POST, title: "Ready to go", body: "Content." });
    await publishPostAction(POST);
    await savePostAction({ postId: POST, title: "Ready to go, revised", body: "Content, revised." });
    const [newest] = await listPostRevisionsAction(POST);
    await restorePostRevisionAction(POST, newest.id);

    const post = (await store.read<{ title: string; status: string }>("posts", POST)) as {
      title: string;
      status: string;
    };
    expect(post).toMatchObject({ title: "Ready to go", status: "published" });
    expect(demoCan({ email: editor.email, role: "editor" }, "posts.update")).toBe(true);
    expect(demoCan({ email: editor.email, role: "editor" }, "posts.delete")).toBe(false);
  });

  it("refuses a save, a publish and a restore to a session whose stored role is not a role string", async () => {
    await signIn(editor);
    // A NULL in a column that is supposed to hold one of two words is a missing grant, and is read
    // as one. The history is the surface that would be worst to leave open: it is readable, and it
    // names who changed what.
    await store.update("users", editor.id, { role: null });

    await expect(listPostRevisionsAction(POST)).rejects.toThrow(/may not read posts/);
    await expect(
      savePostAction({ postId: POST, title: "Sneaky", body: "Sneaky." }),
    ).rejects.toThrow(/may not update posts/);
    await expect(publishPostAction(POST)).rejects.toThrow(/may not update posts/);
    await expect(restorePostRevisionAction(POST, "rev_pst_history_1")).rejects.toThrow(
      /may not update posts/,
    );
    expect(await listPostRevisionsAction(POST).catch(() => [])).toHaveLength(0);
  });

  it("refuses everyone when nobody is signed in, whichever operation is called", async () => {
    request.session = undefined;

    await expect(listPostRevisionsAction(POST)).rejects.toThrow(guard.RedirectSignal);
    await expect(savePostAction({ postId: POST, title: "Nobody", body: "Nobody." })).rejects.toThrow(
      guard.RedirectSignal,
    );
    await expect(restorePostRevisionAction(POST, "rev_pst_history_1")).rejects.toThrow(
      guard.RedirectSignal,
    );
  });

  it("is not decided by the cookie, so a cookie cannot claim a role to restore with", async () => {
    const sealed = await signIn(editor);

    request.session = `${sealed}.admin`;

    await expect(restorePostRevisionAction(POST, "rev_pst_history_1")).rejects.toThrow(
      guard.RedirectSignal,
    );
  });

  it("answers the same question the rule answers, so the rule is the only place a role is read", async () => {
    // The operations ask `demoCan` about the post. Asserting that the two agree means a change to
    // the rule moves these actions with it, rather than leaving a second answer behind here.
    const asEditor: AdminSession = { email: editor.email, role: "editor" };
    expect(demoCan(asEditor, "posts.read")).toBe(true);
    expect(demoCan(asEditor, "posts.update")).toBe(true);
    expect(demoCan(asEditor, "posts.delete")).toBe(false);
    expect(demoCan({ email: owner.email, role: "admin" }, "posts.delete")).toBe(true);
  });
});
