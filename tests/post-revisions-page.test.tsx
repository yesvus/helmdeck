// SPDX-License-Identifier: MIT
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@yesvus/helmdeck";
import { hashPassword } from "@yesvus/helmdeck/baseline";
import { signInAction } from "../fixtures/app/(helmdeck)/login/actions";
import PostRevisionsPage from "../fixtures/app/(helmdeck)/shell/revisions/[id]/page";
import { PostHistory } from "../fixtures/app/(helmdeck)/shell/revisions/post-history";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";

/**
 * The history page and the component on it.
 *
 * The page is the real one, so what it renders is what the rule allowed this session and the store
 * actually holds. The actions are stubbed here, and the reason is in the package rather than in this
 * milestone: `createSessionAuthAdapter` refuses to read a cookie from anything shaped like a
 * browser, so a click that reached the real session code would throw before it reached the rule.
 * The boundary itself is tested for real, in `post-revisions.test.ts`, where every call goes through
 * the exported action with a signed session. What is left to prove here is that a person clicking
 * this page calls the right operation with the values on the screen.
 */
const actions = vi.hoisted(() => ({
  publish: vi.fn(async () => ({})),
  restore: vi.fn(async () => ({})),
  save: vi.fn(async () => ({})),
  unpublish: vi.fn(async () => ({})),
}));

vi.mock("../fixtures/app/(helmdeck)/shell/revisions/actions", () => ({
  publishPostAction: actions.publish,
  restorePostRevisionAction: actions.restore,
  savePostAction: actions.save,
  unpublishPostAction: actions.unpublish,
  listPostRevisionsAction: vi.fn(async () => []),
  listPostsWithHistoryAction: vi.fn(async () => []),
}));

const request = vi.hoisted(() => ({ session: undefined as string | undefined }));

const refresh = vi.hoisted(() => vi.fn());

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
  notFound: () => {
    throw new guard.RedirectSignal("not found");
  },
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const [owner, editor] = demoAccounts;
const store = demoPersistence().adapter;
const POST = "pst_page";

const BASE = {
  id: POST,
  title: "Shipping to the EU from the new warehouse",
  body: "Transit times drop to two days for Germany, France and the Netherlands.",
  status: "published",
  author_id: "usr_owner",
  position: 0,
};

/**
 * Runs server code with no `window` in scope, which is what the session adapter insists on before
 * it will read a cookie, and hands back whatever it produced.
 */
async function onTheServer<T>(work: () => Promise<T>): Promise<T> {
  vi.stubGlobal("window", undefined);
  try {
    return await work();
  } finally {
    vi.unstubAllGlobals();
  }
}

async function signIn(account: { email: string }) {
  const result = await onTheServer(() =>
    signInAction({ email: account.email, password: DEMO_PASSWORD }, ""),
  );
  expect(result.ok).toBe(true);
}

/** A render of the page from scratch, which is what a reload is. */
async function openHistory(id: string = POST) {
  cleanup();
  const page = await onTheServer(() => PostRevisionsPage({ params: Promise.resolve({ id }) }));
  return render(<AdminI18nProvider locale="en">{page}</AdminI18nProvider>);
}

async function seed(overrides: Record<string, unknown> = {}) {
  const row = { ...BASE, ...overrides };
  if (await store.read("posts", POST)) {
    await store.update("posts", POST, row);
  } else {
    await store.create("posts", row);
  }
}

async function recordRevision(overrides: Record<string, unknown> = {}) {
  await store.create("post_revisions", {
    id: "rev_pst_page_1",
    post_id: POST,
    position: 1,
    cause: "edit",
    title: BASE.title,
    body: BASE.body,
    status: "published",
    actor_email: editor.email,
    actor_role: "editor",
    restored_from: null,
    created_at: "2026-09-29T10:00:00.000Z",
    ...overrides,
  });
}

beforeEach(async () => {
  request.session = undefined;
  refresh.mockClear();
  for (const mock of Object.values(actions)) mock.mockClear();
  await ensureDemoSeeded();
  for (const row of await store.query<{ id: string }>("sessions")) {
    await store.delete("sessions", row.id);
  }
  for (const row of await store.query<{ id: string }>("post_revisions")) {
    if (row.id.startsWith("rev_pst_page_")) await store.delete("post_revisions", row.id);
  }
  await seed();
});

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

afterEach(async () => {
  for (const account of demoAccounts) {
    await setRole(account, account.role);
  }
});

describe("the history page", () => {
  it(
    "shows the post as it stands, and says so when nothing has been recorded yet",
    async () => {
      await signIn(editor);
      await openHistory();

      expect(screen.getByRole("heading", { level: 1, name: BASE.title })).toBeInTheDocument();
      expect(screen.getByText(/0 recorded changes/i)).toBeInTheDocument();
    },
    20_000,
  );

  it(
    "lists what the post held before each change, newest first, with who changed it and when",
    async () => {
      await recordRevision();
      await store.create("post_revisions", {
        id: "rev_pst_page_2",
        post_id: POST,
        position: 2,
        cause: "restore",
        title: "An older title",
        body: "An older body.",
        status: "draft",
        actor_email: owner.email,
        actor_role: "admin",
        restored_from: "rev_pst_page_1",
        created_at: "2026-09-29T11:30:00.000Z",
      });
      await seed({ title: BASE.title, body: BASE.body });
      await signIn(editor);
      await openHistory();

      const entries = within(screen.getByRole("list")).getAllByRole("listitem");
      expect(entries).toHaveLength(2);
      // Newest first, and the two are told apart by what caused them.
      expect(within(entries[0]).getByText("Restored")).toBeInTheDocument();
      expect(within(entries[0]).getByText(/from version 1/)).toBeInTheDocument();
      expect(within(entries[0]).getByText(new RegExp(owner.email.replace("@", "@")))).toBeInTheDocument();
      expect(within(entries[0]).getByText(/was a draft/)).toBeInTheDocument();
      expect(within(entries[1]).getByText("Edited")).toBeInTheDocument();
      expect(within(entries[1]).getByText(new RegExp(editor.email))).toBeInTheDocument();
      // Enough of each version to recognise it.
      expect(within(entries[1]).getByText(BASE.title)).toBeInTheDocument();
    },
    20_000,
  );

  it(
    "saves what the person typed, through the save action, and asks for a fresh render",
    async () => {
      await signIn(editor);
      await openHistory();

      const title = screen.getByLabelText("Title");
      await userEvent.clear(title);
      await userEvent.type(title, "Shipping to the EU, faster");
      const body = screen.getByLabelText("Body");
      await userEvent.clear(body);
      await userEvent.type(body, "One day, for Germany and France.");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(actions.save).toHaveBeenCalledWith({
        postId: POST,
        title: "Shipping to the EU, faster",
        body: "One day, for Germany and France.",
      });
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    },
    20_000,
  );

  it(
    "restores the version whose button was pressed, by its id and the post it belongs to",
    async () => {
      await recordRevision();
      await signIn(editor);
      await openHistory();

      await userEvent.click(screen.getByRole("button", { name: "Put this version back" }));

      expect(actions.restore).toHaveBeenCalledWith(POST, "rev_pst_page_1");
    },
    20_000,
  );

  it(
    "offers publish on a draft and unpublish on a published post, and never a status field",
    async () => {
      await seed({ status: "draft" });
      await signIn(editor);
      await openHistory();

      expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Publish" }));
      expect(actions.publish).toHaveBeenCalledWith(POST);
      expect(actions.unpublish).not.toHaveBeenCalled();

      await seed({ status: "published" });
      await openHistory();
      await userEvent.click(screen.getByRole("button", { name: "Unpublish" }));
      expect(actions.unpublish).toHaveBeenCalledWith(POST);
    },
    20_000,
  );

  it(
    "says what the server refused rather than pretending the change happened",
    async () => {
      actions.publish.mockRejectedValueOnce(new Error("Post pst_page has no content to publish"));
      await seed({ status: "draft" });
      await signIn(editor);
      await openHistory();

      await userEvent.click(screen.getByRole("button", { name: "Publish" }));

      const banner = await screen.findByText(/no content to publish/i);
      expect(banner).toBeInTheDocument();
      expect(screen.getByText(/that change was refused/i)).toBeInTheDocument();
    },
    20_000,
  );

  it(
    "sends a visitor with no session to the login page rather than rendering the history",
    async () => {
      request.session = undefined;

      await expect(
        onTheServer(() => PostRevisionsPage({ params: Promise.resolve({ id: POST }) })),
      ).rejects.toThrow(guard.RedirectSignal);
    },
    20_000,
  );

  it(
    "shows nothing to a role the rule does not define, rather than a page it could not have written",
    async () => {
      // The stored role is what the page asks about. A role the rule has never heard of is a missing
      // grant rather than a partial one, so there is no history to read either, and the page says
      // there is nothing here instead of rendering something the actions would refuse.
      await signIn(editor);
      await setRole(editor, "contributor");

      await expect(
        onTheServer(() => PostRevisionsPage({ params: Promise.resolve({ id: POST }) })),
      ).rejects.toThrow(guard.RedirectSignal);
    },
    20_000,
  );

  it("gives an administrator the same page as an editor, because both may update a post", async () => {
    await signIn(owner);
    await openHistory();

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("renders a read-only history for a session the page says may not write", () => {
    render(
      <AdminI18nProvider locale="en">
        <PostHistory
          post={{ id: POST, title: BASE.title, body: BASE.body, status: "published" }}
          revisions={[
            {
              id: "rev_1",
              post_id: POST,
              position: 1,
              cause: "edit",
              title: BASE.title,
              body: BASE.body,
              status: "published",
              actor_email: editor.email,
              actor_role: "editor",
              restored_from: null,
              created_at: "2026-09-29T10:00:00.000Z",
            },
          ]}
          canWrite={false}
        />
      </AdminI18nProvider>,
    );

    expect(screen.getByLabelText("Title")).toBeDisabled();
    expect(screen.getByLabelText("Body")).toBeDisabled();
    expect(screen.getByText("Edited")).toBeInTheDocument();
  });
});
