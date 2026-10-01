// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signInAction } from "../fixtures/app/(helmdeck)/login/actions";
import {
  cancelScheduleAction,
  listPostSchedulesAction,
  listSchedulablePostsAction,
  moveScheduleAction,
  runDuePublishesAction,
  schedulePostAction,
} from "../fixtures/app/(helmdeck)/shell/schedule/actions";
import { hashPassword } from "../fixtures/lib/demo-users";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { demoCan } from "../fixtures/lib/demo-rules";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { listPostRevisions } from "../fixtures/lib/demo-revisions";
import {
  listPostSchedules,
  listSchedulablePosts,
  publishDuePosts,
  setDemoClock,
  type Clock,
} from "../fixtures/lib/demo-scheduling";

/**
 * Scheduled publishing, exercised through the actions a browser would post to.
 *
 * Nothing here renders a page, because a hidden button is not authorization: every call goes through
 * the exported action with the session the signed cookie resolves to, which is the call a client makes
 * when the button is missing or the form was never drawn. The role comes from the user row, not from
 * an argument, so these are the powers the stored account actually has.
 *
 * The clock is why the file is quick. Nothing waits for a moment to pass: the demo is told what time
 * it is, so a schedule for a moment in the past is exercised by moving the clock rather than by
 * sleeping, and a test that took a minute would mostly be measuring the minute.
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
const POST = "pst_scheduled";

/** The one post this file works on, so a test that edits it cannot change what the next one starts from. */
const BASE_POST = {
  id: POST,
  title: "The autumn release, on the moment we said",
  body: "Everything that changed since the spring release, in one place.",
  status: "draft",
  author_id: "usr_editor",
  position: 0,
};

const HOUR = "2026-10-01T10:00";

let restoreClock: Clock | undefined;

function at(iso: string): Clock {
  return () => new Date(iso);
}

async function signIn(account: { email: string }) {
  const result = await signInAction({ email: account.email, password: DEMO_PASSWORD }, "");
  expect(result.ok).toBe(true);
  return request.session;
}

async function seedPost(overrides: Record<string, unknown> = {}) {
  const row = { ...BASE_POST, ...overrides };
  if (await store.read("posts", POST)) {
    await store.update("posts", POST, row);
  } else {
    await store.create("posts", row);
  }
  return POST;
}

/** An existing post written straight to the store, for a run that has more than one to do. */
async function putPost(id: string, overrides: Record<string, unknown> = {}) {
  const row = { id, title: `A post, ${id}`, body: "Content.", status: "draft", ...overrides };
  if (await store.read("posts", id)) {
    await store.update("posts", id, row);
  } else {
    await store.create("posts", row);
  }
  return id;
}

async function clearRows(resource: string, matches: (id: string) => boolean) {
  for (const row of await store.query<{ id: string }>(resource)) {
    if (matches(row.id)) await store.delete(resource, row.id);
  }
}

/** A form as a browser posts one, which is how the schedule action is reached. */
function form(fields: Record<string, string>): FormData {
  const posted = new FormData();
  for (const [name, value] of Object.entries(fields)) posted.append(name, value);
  return posted;
}

/**
 * Posts an action and returns the reason it redirected with, which is empty when it did not refuse.
 *
 * A server action's answer is a redirect rather than a value, so the redirect is what the caller sees
 * and what a test has to assert on. Both kinds come back the same way and are told apart by their
 * query: a write goes back to the page bare, a refusal goes back carrying the reason. The decode
 * matters, because a reason is a sentence and a sentence in a query string is unreadable.
 */
async function submit(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (cause) {
    if (!(cause instanceof guard.RedirectSignal)) throw cause;
    const [path, query = ""] = String(cause.message).split("?");
    if (path !== "/shell/schedule") throw cause;
    return new URLSearchParams(query).get("refused") ?? "";
  }
  throw new Error("The action neither wrote nor redirected");
}

/** Posts an action that is expected to be refused, and returns the reason it gave. */
async function refused(action: () => Promise<unknown>, expected: RegExp): Promise<string> {
  const reason = await submit(action);
  expect(reason, "the action did not refuse").toMatch(expected);
  return reason;
}

/**
 * The two accounts, whole, as the migration declared them.
 *
 * The memory adapter replaces a record on update rather than merging into it, so writing back only
 * the role leaves a user row with no email on it. Every session then resolves to an account with an
 * empty address, which is not a state this demo can produce and which would make a test assert
 * against a row it had quietly damaged rather than against the code.
 */
async function restoreAccounts() {
  for (const account of demoAccounts) {
    await store.update("users", account.id, {
      id: account.id,
      email: account.email,
      role: account.role,
      password_hash: await publishedHash(),
    });
  }
}

/**
 * Changes an account's role and nothing else about it.
 *
 * The whole row has to be written, because an update replaces the record rather than merging into it.
 * A single-column write used to be invisible: sign-in read the accounts out of an array, so losing the
 * address and the hash cost nothing. It does now, and the symptom is not a wrong answer but a redirect
 * to the sign-in page, because the session the row should resolve to resolves to nothing at all. The
 * restore above reads the account fixture for the same reason rather than reading back the row it is
 * repairing, which by then holds whatever the last partial write left in it.
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

async function statusOf(postId: string = POST): Promise<string> {
  return ((await store.read<{ status: string }>("posts", postId)) as { status: string }).status;
}

async function history(): Promise<Awaited<ReturnType<typeof listPostRevisions>>> {
  return listPostRevisions({ email: owner.email, role: "admin" }, POST);
}

beforeEach(async () => {
  // The session adapter refuses to reach for a cookie from anything shaped like a browser, and jsdom
  // is one. The actions are server code, so they run without it.
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  await ensureDemoSeeded();
  await clearRows("sessions", () => true);
  await clearRows("post_revisions", (id) => id.startsWith(`rev_${POST}_`) || id.startsWith("rev_pst_second_"));
  await clearRows("post_schedules", () => true);
  await clearRows("posts", (id) => id === POST || id === "pst_second");
  await seedPost();
  restoreClock = setDemoClock(at("2026-10-01T08:00:00.000Z"));
});

afterEach(async () => {
  if (restoreClock) setDemoClock(restoreClock);
  restoreClock = undefined;
  vi.unstubAllGlobals();
  await restoreAccounts();
});

describe("a schedule is a promise and nothing else", () => {
  it("leaves the post a draft and writes nothing to the history, because the moment has not come", async () => {
    await signIn(editor);
    expect(await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })))).toBe("");

    expect(await statusOf()).toBe("draft");
    expect(await history()).toHaveLength(0);
  });

  it("records the moment as it was chosen and who chose it", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));

    const [entry] = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(entry.schedule).toMatchObject({
      post_id: POST,
      publish_at: "2026-10-01T10:00:00.000Z",
      state: "pending",
      actor_email: editor.email,
      actor_role: "editor",
      settled_at: null,
      last_refusal: null,
    });
    expect(entry.post).toMatchObject({ id: POST, status: "draft" });
  });

  it("takes a bare datetime-local value as UTC, which is the zone the column and the page use", async () => {
    // A value with no offset in it is what a `datetime-local` field posts, and the server and the
    // browser would each read it in their own zone. Reading it as UTC is what makes the stored moment
    // the one the person chose, and it is the same reading whichever store holds the row.
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));

    const [entry] = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(entry.schedule.publish_at).toBe("2026-10-01T10:00:00.000Z");
  });

  it("refuses a moment it cannot read, rather than storing a row nothing can fire on", async () => {
    await signIn(editor);
    await refused(() => schedulePostAction(form({ post_id: POST, publish_at: "next tuesday" })), /not a moment/);

    expect(await listPostSchedules({ email: editor.email, role: "editor" })).toHaveLength(0);
  });

  it("refuses a post that is already published, which is what the run would refuse", async () => {
    await seedPost({ status: "published" });
    await signIn(editor);

    await refused(
      () => schedulePostAction(form({ post_id: POST, publish_at: HOUR })),
      /already published/,
    );
    expect(await listPostSchedules({ email: editor.email, role: "editor" })).toHaveLength(0);
  });

  it("refuses a draft with no content, because a publish with nothing in it is refused", async () => {
    await seedPost({ body: "   " });
    await signIn(editor);

    await refused(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })), /no content/);
    expect(await listPostSchedules({ email: editor.email, role: "editor" })).toHaveLength(0);
  });

  it("refuses a second moment for a post that already has one, rather than leaving a promise unkept", async () => {
    // Two waiting rows would be a promise that cannot be kept: the first to arrive publishes the post
    // and the second could never fire, because publishing a live post is refused rather than recorded.
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    await refused(
      () => schedulePostAction(form({ post_id: POST, publish_at: "2026-10-01T12:00" })),
      /already scheduled/,
    );

    const schedules = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(schedules).toHaveLength(1);
    expect(schedules[0].schedule.publish_at).toBe("2026-10-01T10:00:00.000Z");
  });

  it("refuses a post that is not there, rather than writing a row for nothing", async () => {
    await signIn(editor);
    await refused(
      () => schedulePostAction(form({ post_id: "pst_missing", publish_at: HOUR })),
      /No post with id pst_missing/,
    );
  });
});

describe("the run, which is what makes a moment true", () => {
  it("publishes nothing before the moment, however many times it runs", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));

    for (const moment of ["2026-10-01T08:00:00.000Z", "2026-10-01T09:59:59.999Z"]) {
      const run = await publishDuePosts(new Date(moment));
      expect(run.published).toHaveLength(0);
      expect(await statusOf()).toBe("draft");
    }
    expect(await history()).toHaveLength(0);
  });

  it("publishes at the moment and not a moment before it", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));

    const run = await publishDuePosts(new Date("2026-10-01T10:00:00.000Z"));

    expect(run.published).toHaveLength(1);
    expect(await statusOf()).toBe("published");
  });

  it("records the publish in the history, so the post says when it went live", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    const run = await publishDuePosts(new Date("2026-10-01T10:00:00.000Z"));

    const revisions = await history();
    expect(revisions).toHaveLength(1);
    // The same cause a publish by hand gets, because it went through the same operation. A separate
    // cause would be a second answer to "when did this go live" for a transition that has one.
    expect(revisions[0]).toMatchObject({ cause: "publish", status: "draft" });
    expect(revisions[0].actor_email).toBe(editor.email);
    expect(run.published[0].revision_id).toBe(revisions[0].id);
  });

  it("settles the row it published, so the page can show that it happened", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    await publishDuePosts(new Date("2026-10-01T10:00:00.000Z"));

    const [entry] = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(entry.schedule.state).toBe("published");
    expect(entry.schedule.settled_at).toBe("2026-10-01T10:00:00.000Z");
  });

  it("publishes a post scheduled for a moment in the past on the next run, rather than never", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    // The clock has gone past the moment and nobody has run anything.
    setDemoClock(at("2026-10-01T14:00:00.000Z"));
    expect(await statusOf()).toBe("draft");

    const run = await publishDuePosts();

    expect(run.published).toHaveLength(1);
    expect(await statusOf()).toBe("published");
  });

  it("does not publish the same post twice, because a settled row is not a waiting one", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    const atTen = new Date("2026-10-01T10:00:00.000Z");
    await publishDuePosts(atTen);
    const second = await publishDuePosts(atTen);

    expect(second.published).toHaveLength(0);
    expect(second.refused).toHaveLength(0);
    expect(await history()).toHaveLength(1);
  });

  it("keeps a schedule whose post cannot be published, and says why, rather than calling it off", async () => {
    // The body was emptied after the moment was chosen. Cancelling would throw the promise away for a
    // post somebody can write again before the next run, so the row keeps its moment and records why.
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    await store.update("posts", POST, { ...BASE_POST, body: "" });

    const run = await publishDuePosts(new Date("2026-10-01T10:00:00.000Z"));

    expect(run.published).toHaveLength(0);
    expect(run.refused[0].reason).toMatch(/no content to publish/);
    const [entry] = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(entry.schedule.state).toBe("pending");
    expect(entry.schedule.last_refusal).toMatch(/no content to publish/);
    expect(await statusOf()).toBe("draft");
  });

  it("publishes on a later run once the post is publishable again, and clears the refusal", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    await store.update("posts", POST, { ...BASE_POST, body: "" });
    await publishDuePosts(new Date("2026-10-01T10:00:00.000Z"));

    await store.update("posts", POST, { ...BASE_POST });
    const run = await publishDuePosts(new Date("2026-10-01T11:00:00.000Z"));

    expect(run.published).toHaveLength(1);
    const [entry] = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(entry.schedule.last_refusal).toBeNull();
  });

  it("publishes the waiting moments in the order they were due", async () => {
    await putPost("pst_second");
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: "2026-10-01T12:00" })));
    await submit(() =>
      schedulePostAction(form({ post_id: "pst_second", publish_at: "2026-10-01T10:00" })),
    );

    const run = await publishDuePosts(new Date("2026-10-01T13:00:00.000Z"));

    expect(run.published.map((entry) => entry.post_id)).toEqual(["pst_second", POST]);
  });

  it("refuses a row whose moment cannot be read, rather than leaving it waiting for a time", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    const [entry] = await listPostSchedules({ email: editor.email, role: "editor" });
    await store.update("post_schedules", entry.schedule.id, { ...entry.schedule, publish_at: "soon" });

    const run = await publishDuePosts(new Date("2026-10-01T23:00:00.000Z"));

    expect(run.published).toHaveLength(0);
    expect(run.refused[0].reason).toMatch(/cannot be read/);
    expect(await statusOf()).toBe("draft");
  });
});

describe("moving and calling a schedule off", () => {
  it("moves the moment and leaves the post alone", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    const [before] = await listPostSchedules({ email: editor.email, role: "editor" });

    await submit(() =>
      moveScheduleAction({ scheduleId: before.schedule.id, publishAt: "2026-10-01T16:00" }),
    );

    const [after] = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(after.schedule.publish_at).toBe("2026-10-01T16:00:00.000Z");
    expect(after.schedule.id).toBe(before.schedule.id);
    expect(await statusOf()).toBe("draft");
    expect(await history()).toHaveLength(0);
  });

  it("does not publish at the moment it moved away from", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    const [before] = await listPostSchedules({ email: editor.email, role: "editor" });
    await submit(() =>
      moveScheduleAction({ scheduleId: before.schedule.id, publishAt: "2026-10-01T16:00" }),
    );

    const run = await publishDuePosts(new Date("2026-10-01T10:30:00.000Z"));

    expect(run.published).toHaveLength(0);
    expect(await statusOf()).toBe("draft");
  });

  it("publishes at the moment it was moved to", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    const [before] = await listPostSchedules({ email: editor.email, role: "editor" });
    await submit(() =>
      moveScheduleAction({ scheduleId: before.schedule.id, publishAt: "2026-10-01T16:00" }),
    );

    await publishDuePosts(new Date("2026-10-01T15:00:00.000Z"));
    expect(await statusOf()).toBe("draft");

    await publishDuePosts(new Date("2026-10-01T16:00:00.000Z"));
    expect(await statusOf()).toBe("published");
  });

  it("records the mover as the account the run will publish as", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    const [before] = await listPostSchedules({ email: editor.email, role: "editor" });
    await signIn(owner);
    await submit(() =>
      moveScheduleAction({ scheduleId: before.schedule.id, publishAt: "2026-10-01T16:00" }),
    );

    await publishDuePosts(new Date("2026-10-01T16:00:00.000Z"));
    const revisions = await history();
    expect(revisions[0].actor_email).toBe(owner.email);
    expect(revisions[0].actor_role).toBe("admin");
  });

  it("cancels a schedule, and the post stays a draft at the moment it was set for", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    const [before] = await listPostSchedules({ email: editor.email, role: "editor" });

    await submit(() => cancelScheduleAction(before.schedule.id));

    const [after] = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(after.schedule.state).toBe("cancelled");
    expect(after.schedule.settled_at).toBe("2026-10-01T08:00:00.000Z");
    const run = await publishDuePosts(new Date("2026-10-01T10:00:00.000Z"));
    expect(run.published).toHaveLength(0);
    expect(await statusOf()).toBe("draft");
  });

  it("refuses a move and a cancel on a schedule that has already gone live", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    const [before] = await listPostSchedules({ email: editor.email, role: "editor" });
    await publishDuePosts(new Date("2026-10-01T10:00:00.000Z"));

    await refused(
      () => moveScheduleAction({ scheduleId: before.schedule.id, publishAt: "2026-10-01T16:00" }),
      /already published/,
    );
    await refused(() => cancelScheduleAction(before.schedule.id), /already published/);
    expect(await statusOf()).toBe("published");
  });

  it("refuses a schedule that is not there, rather than writing a row for nothing", async () => {
    await signIn(editor);
    await refused(() => cancelScheduleAction("sch_nothing"), /No schedule with id sch_nothing/);
  });
});

describe("what the role is worth over the schedule", () => {
  it("lets an editor schedule, move and cancel, which are all writes to a post", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    const [entry] = await listPostSchedules({ email: editor.email, role: "editor" });

    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: "2026-10-01T12:00" })));
    await submit(() =>
      moveScheduleAction({ scheduleId: entry.schedule.id, publishAt: "2026-10-01T16:00" }),
    );
    await submit(() => cancelScheduleAction(entry.schedule.id));

    expect(demoCan({ email: editor.email, role: "editor" }, "posts.update")).toBe(true);
    const [after] = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(after.schedule.state).toBe("cancelled");
  });

  it("refuses a schedule, a move and a cancel to a session whose stored role is not a role string", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    const [entry] = await listPostSchedules({ email: editor.email, role: "editor" });
    await setRole(editor, null);

    await refused(
      () => schedulePostAction(form({ post_id: POST, publish_at: "2026-10-01T12:00" })),
      /may not update posts/,
    );
    await refused(
      () => moveScheduleAction({ scheduleId: entry.schedule.id, publishAt: "2026-10-01T16:00" }),
      /may not update posts/,
    );
    await refused(() => cancelScheduleAction(entry.schedule.id), /may not update posts/);

    // The row is untouched, so a refusal costs nothing and leaves the promise in place.
    const [after] = await listPostSchedules({ email: owner.email, role: "admin" });
    expect(after.schedule).toMatchObject({
      id: entry.schedule.id,
      state: "pending",
      publish_at: "2026-10-01T10:00:00.000Z",
    });
  });

  it("refuses to read the schedules to a session the rule does not define", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    // Through the action, so the session is the one the stored row resolves to and not one this test
    // wrote down. A hand-made session with a role in it would prove only that the rule works.
    await setRole(editor, "contributor");

    await expect(listPostSchedulesAction()).rejects.toThrow(/may not read posts/);
    await expect(listSchedulablePostsAction()).rejects.toThrow(/may not read posts/);
  });

  it("refuses to read the schedules when nobody is signed in", async () => {
    request.session = undefined;

    await expect(listPostSchedulesAction()).rejects.toThrow(guard.RedirectSignal);
    await expect(listSchedulablePostsAction()).rejects.toThrow(guard.RedirectSignal);
  });

  it("refuses everyone when nobody is signed in, whichever operation is called", async () => {
    request.session = undefined;

    await expect(
      submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR }))),
    ).rejects.toThrow(guard.RedirectSignal);
    await expect(submit(() => cancelScheduleAction("sch_anything"))).rejects.toThrow(
      guard.RedirectSignal,
    );
    await expect(submit(() => runDuePublishesAction())).rejects.toThrow(guard.RedirectSignal);
  });

  it("refuses the run to a session that may not write a post, and publishes nothing", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    setDemoClock(at("2026-10-01T14:00:00.000Z"));
    await setRole(editor, "writer");

    await refused(() => runDuePublishesAction(), /may not update posts/);
    expect(await statusOf()).toBe("draft");
    const listed = await listPostSchedules({ email: owner.email, role: "admin" });
    expect(listed[0].schedule.state).toBe("pending");
  });

  it("does not keep a promise for an account that lost the role after the moment was set", async () => {
    // The role the run decides by is the one on the account now, not the copy on the schedule, so a
    // withdrawn role stops the publish rather than being overwritten by a promise made before it.
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));
    await signIn(owner);
    await setRole(editor, "contributor");

    const run = await publishDuePosts(new Date("2026-10-01T10:00:00.000Z"));

    expect(run.published).toHaveLength(0);
    expect(run.refused[0].reason).toMatch(/may not update posts/);
    expect(await statusOf()).toBe("draft");
    const [entry] = await listPostSchedules({ email: owner.email, role: "admin" });
    expect(entry.schedule.last_refusal).toMatch(/may not update posts/);
  });
});

describe("what a person is shown", () => {
  it("lists the waiting moments first and the settled ones after them", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: "2026-10-01T12:00" })));
    const [first] = await listPostSchedules({ email: editor.email, role: "editor" });
    await submit(() => cancelScheduleAction(first.schedule.id));
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: "2026-10-01T16:00" })));

    const listed = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(listed.map((entry) => entry.schedule.state)).toEqual(["pending", "cancelled"]);
  });

  it("orders waiting moments by when they will fire, not by when they were set", async () => {
    await putPost("pst_second");
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: "2026-10-01T18:00" })));
    await submit(() =>
      schedulePostAction(form({ post_id: "pst_second", publish_at: "2026-10-01T11:00" })),
    );

    const listed = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(listed.map((entry) => entry.post?.id)).toEqual(["pst_second", POST]);
  });

  it("does not offer a moment for a draft that already has one", async () => {
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: HOUR })));

    const schedulable = await listSchedulablePosts({ email: editor.email, role: "editor" });
    expect(schedulable.map((post) => post.id)).not.toContain(POST);
  });

  it("does not offer a moment for a post that is already published", async () => {
    await seedPost({ status: "published" });
    await signIn(editor);

    const schedulable = await listSchedulablePosts({ email: editor.email, role: "editor" });
    expect(schedulable.map((post) => post.id)).not.toContain(POST);
  });

  it("uses the clock it is given, which is what lets a host decide what now means", async () => {
    setDemoClock(at("2030-01-01T00:00:00.000Z"));
    await signIn(editor);
    await submit(() => schedulePostAction(form({ post_id: POST, publish_at: "2030-01-02T09:00" })));

    const [entry] = await listPostSchedules({ email: editor.email, role: "editor" });
    expect(entry.schedule.created_at).toBe("2030-01-01T00:00:00.000Z");
    await publishDuePosts();
    expect(await statusOf()).toBe("draft");
  });
});
