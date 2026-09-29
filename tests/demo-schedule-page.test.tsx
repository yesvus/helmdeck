// SPDX-License-Identifier: MIT
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@yesvus/helmdeck";
import { signInAction } from "../fixtures/app/login/actions";
import SchedulePage from "../fixtures/app/shell/schedule/page";
import { ScheduleRow } from "../fixtures/app/shell/schedule/schedule-form";
import { hashPassword } from "../fixtures/lib/demo-users";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { setDemoClock, type Clock, type PostSchedule } from "../fixtures/lib/demo-scheduling";

/**
 * The schedule page, and the row it renders for a promise that has not been kept yet.
 *
 * The page is the real one, so what it shows is the rule's answer for this session and the store's
 * actual rows. The actions are stubbed, and the reason is in the package rather than here:
 * `createSessionAuthAdapter` refuses to read a cookie from anything shaped like a browser, so a click
 * that reached the real session code would throw before it reached the rule. The boundary itself is
 * tested for real in `demo-scheduling.test.ts`, where every call goes through an exported action with a
 * signed session. What is left to prove here is that a person sees the moment, sees when it is due,
 * and that pressing a button calls the operation with the values on the screen.
 */
const actions = vi.hoisted(() => ({
  cancel: vi.fn(async () => ({})),
  move: vi.fn(async () => ({})),
  run: vi.fn(async () => ({})),
  schedule: vi.fn(async () => ({})),
}));

vi.mock("../fixtures/app/shell/schedule/actions", () => ({
  cancelScheduleAction: actions.cancel,
  listPostSchedulesAction: vi.fn(async () => []),
  listSchedulablePostsAction: vi.fn(async () => []),
  moveScheduleAction: actions.move,
  runDuePublishesAction: actions.run,
  schedulePostAction: actions.schedule,
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

const editor = demoAccounts[1];
const store = demoPersistence().adapter;
const POST = "pst_page_scheduled";

const BASE_POST = {
  id: POST,
  title: "The autumn release, on the moment we said",
  body: "Everything that changed since the spring release, in one place.",
  status: "draft",
  author_id: "usr_editor",
  position: 0,
};

const HOUR = "2026-10-01T10:00:00.000Z";
const CLOCK = "2026-10-01T08:00:00.000Z";

let restoreClock: Clock | undefined;

function schedule(overrides: Partial<PostSchedule> = {}): PostSchedule {
  return {
    id: "sch_page_1",
    post_id: POST,
    publish_at: HOUR,
    state: "pending",
    actor_email: editor.email,
    actor_role: "editor",
    created_at: CLOCK,
    settled_at: null,
    last_refusal: null,
    ...overrides,
  };
}

/** Server code with no `window` in scope, which is what the session adapter insists on. */
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

/** One hash for the file, because scrypt is deliberately slow and the password is the same one. */
let published: Promise<string> | null = null;
const publishedHash = () => (published ??= hashPassword(DEMO_PASSWORD));

/**
 * Changes an account's role and nothing else about it.
 *
 * An update replaces the record rather than merging into it, so a single-column write leaves the
 * account with no address and no hash. The symptom is not a wrong answer but a redirect to sign-in,
 * because the session the row should resolve to resolves to nothing at all.
 */
async function setRole(account: { id: string; email: string; role: string }, role: unknown) {
  await store.update("users", account.id, {
    id: account.id,
    email: account.email,
    role,
    password_hash: await publishedHash(),
  });
}

async function clearRows(resource: string, matches: (id: string) => boolean) {
  for (const row of await store.query<{ id: string }>(resource)) {
    if (matches(row.id)) await store.delete(resource, row.id);
  }
}

/** A render of the page from scratch, which is what a reload is. */
async function openPage(query: Record<string, string> = {}) {
  cleanup();
  const page = await onTheServer(() => SchedulePage({ searchParams: Promise.resolve(query) }));
  return render(<AdminI18nProvider locale="en">{page}</AdminI18nProvider>);
}

beforeEach(async () => {
  request.session = undefined;
  refresh.mockClear();
  for (const mock of Object.values(actions)) mock.mockClear();
  await ensureDemoSeeded();
  await clearRows("sessions", () => true);
  await clearRows("post_schedules", () => true);
  await clearRows("posts", (id) => id === POST);
  if (await store.read("posts", POST)) {
    await store.update("posts", POST, BASE_POST);
  } else {
    await store.create("posts", BASE_POST);
  }
  restoreClock = setDemoClock(() => new Date(CLOCK));
});

afterEach(async () => {
  if (restoreClock) setDemoClock(restoreClock);
  restoreClock = undefined;
  for (const account of demoAccounts) {
    // The whole row, and the hash from the password rather than from the row being repaired, which
    // by then holds whatever the last partial write left in it.
    await setRole(account, account.role);
  }
});

describe("the schedule page", () => {
  it(
    "says nothing is due when no moment has arrived, and offers no run",
    async () => {
      await signIn(editor);
      await openPage();

      expect(screen.getByRole("heading", { level: 1, name: /scheduled publishing/i })).toBeInTheDocument();
      expect(screen.getByText(/nothing is due/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /publish what is due/i })).toBeDisabled();
    },
    20_000,
  );

  it(
    "says a moment has arrived and offers the run, which is the moment becoming true",
    async () => {
      await signIn(editor);
      await store.create("post_schedules", schedule());
      setDemoClock(() => new Date("2026-10-01T14:00:00.000Z"));
      await openPage();

      expect(screen.getByText(/1 of 1 waiting schedule is due/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /publish what is due/i })).toBeEnabled();
      // The row says the moment arrived rather than that the post is live, because it is not.
      expect(screen.getByText(/the moment has arrived/i)).toBeInTheDocument();
    },
    20_000,
  );

  it(
    "says a moment is still waiting rather than calling it due",
    async () => {
      await signIn(editor);
      await store.create("post_schedules", schedule());
      await openPage();

      expect(screen.getByText(/nothing is due/i)).toBeInTheDocument();
      expect(screen.queryByText(/the moment has arrived/i)).not.toBeInTheDocument();
    },
    20_000,
  );

  it(
    "posts the run when the button is pressed",
    async () => {
      await signIn(editor);
      await store.create("post_schedules", schedule());
      setDemoClock(() => new Date("2026-10-01T14:00:00.000Z"));
      await openPage();

      await userEvent.click(screen.getByRole("button", { name: /publish what is due/i }));

      expect(actions.run).toHaveBeenCalled();
    },
    20_000,
  );

  it(
    "shows the refusal the server gave rather than a schedule that was not made",
    async () => {
      await signIn(editor);
      await openPage({ refused: "Post pst_page_scheduled is already scheduled" });

      expect(screen.getByText(/that was refused/i)).toBeInTheDocument();
      expect(screen.getByText(/already scheduled/i)).toBeInTheDocument();
    },
    20_000,
  );

  it(
    "sends a visitor with no session to the login page rather than rendering the schedules",
    async () => {
      request.session = undefined;

      await expect(
        onTheServer(() => SchedulePage({ searchParams: Promise.resolve({}) })),
      ).rejects.toThrow(guard.RedirectSignal);
    },
    20_000,
  );

  it(
    "shows nothing to a role the rule does not define, rather than a page it could not have written",
    async () => {
      await signIn(editor);
      await store.create("post_schedules", schedule());
      await setRole(editor, "contributor");

      await expect(
        onTheServer(() => SchedulePage({ searchParams: Promise.resolve({}) })),
      ).rejects.toThrow(guard.RedirectSignal);
    },
    20_000,
  );

  it(
    "offers a moment for a draft, and posts the post and the moment that were on screen",
    async () => {
      await signIn(editor);
      await openPage();

      // Named by the post rather than by position, because the seed holds drafts of its own and a
      // field picked by index would be asserting about whichever one happened to be first.
      const field = document.getElementById(`publish_at-${POST}`) as HTMLInputElement;
      expect(field).not.toBeNull();
      expect(field).toHaveValue("2026-10-01T09:00");

      const form = field.closest("form") as HTMLFormElement;
      const posted = new FormData(form);
      expect(posted.get("post_id")).toBe(POST);
      expect(posted.get("publish_at")).toBe("2026-10-01T09:00");
      expect(within(form).getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    },
    20_000,
  );

  it("does not offer a second moment for a draft that already has one", async () => {
    await signIn(editor);
    await store.create("post_schedules", schedule());
    await openPage();

    // The post is named in the schedules list, and the form that would set a second moment for it is
    // not rendered at all. Asking for the other drafts' fields is what shows they are.
    expect(screen.getByText(BASE_POST.title)).toBeInTheDocument();
    expect(document.getElementById(`publish_at-${POST}`)).toBeNull();
    expect(screen.getAllByRole("button", { name: "Schedule" }).length).toBeGreaterThan(0);
  });

  it("offers no run and no form to a session the page says may not write", () => {
    render(
      <AdminI18nProvider locale="en">
        <ScheduleRow
          schedule={schedule()}
          postTitle={BASE_POST.title}
          now={Date.parse(CLOCK)}
          canWrite={false}
        />
      </AdminI18nProvider>,
    );

    expect(screen.queryByRole("button", { name: /^Move$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Cancel$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/may read the schedule and not change it/i)).toBeInTheDocument();
  });
});

describe("one schedule, rendered", () => {
  it(
    "moves it to the moment in the field, by the id the row holds",
    async () => {
      await signIn(editor);
      await store.create("post_schedules", schedule());
      await openPage();

      const field = screen.getByLabelText(/move to/i);
      await userEvent.clear(field);
      await userEvent.type(field, "2026-10-02T16:00");
      await userEvent.click(screen.getByRole("button", { name: /^Move$/ }));

      expect(actions.move).toHaveBeenCalledWith({
        scheduleId: "sch_page_1",
        publishAt: "2026-10-02T16:00",
      });
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    },
    20_000,
  );

  it(
    "cancels it by the id the row holds",
    async () => {
      await signIn(editor);
      await store.create("post_schedules", schedule());
      await openPage();

      await userEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));

      expect(actions.cancel).toHaveBeenCalledWith("sch_page_1");
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    },
    20_000,
  );

  it(
    "says what the server refused rather than a move that did not happen",
    async () => {
      actions.move.mockRejectedValueOnce(new Error("Schedule sch_page_1 is already published"));
      await signIn(editor);
      await store.create("post_schedules", schedule());
      await openPage();

      await userEvent.click(screen.getByRole("button", { name: /^Move$/ }));

      expect(await screen.findByText(/already published/i)).toBeInTheDocument();
      expect(screen.getByText(/that was refused/i)).toBeInTheDocument();
    },
    20_000,
  );

  it(
    "shows a refusal a run recorded, rather than a row that looks like it is simply waiting",
    () => {
      render(
        <AdminI18nProvider locale="en">
          <ScheduleRow
            schedule={schedule({ last_refusal: "Post pst_page_scheduled has no content to publish" })}
            postTitle={BASE_POST.title}
            now={Date.parse("2026-10-01T14:00:00.000Z")}
            canWrite
          />
        </AdminI18nProvider>,
      );

      expect(screen.getByText(/has no content to publish/i)).toBeInTheDocument();
      expect(screen.getByText(/last run/i)).toBeInTheDocument();
    },
  );

  it(
    "shows a settled schedule as settled, and offers neither a move nor a cancel",
    () => {
      render(
        <AdminI18nProvider locale="en">
          <ScheduleRow
            schedule={schedule({ state: "published", settled_at: HOUR })}
            postTitle={BASE_POST.title}
            now={Date.parse("2026-10-01T14:00:00.000Z")}
            canWrite
          />
        </AdminI18nProvider>,
      );

      expect(screen.getByText(/published/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Move$/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Cancel$/ })).not.toBeInTheDocument();
    },
  );
});
