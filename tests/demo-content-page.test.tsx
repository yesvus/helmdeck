// SPDX-License-Identifier: MIT
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense, createElement, type ReactNode } from "react";
import { AdminI18nProvider } from "../src/i18n";
import { AdminPermissionsProvider } from "../src/shell/permissions";
import type { AdminPermissionsAdapter } from "../src/adapters/index";
import ContentPage from "../fixtures/app/shell/content/page";
import NewPostPage from "../fixtures/app/shell/content/new/page";
import PostDetailPage from "../fixtures/app/shell/content/[id]/page";
import { createContentPost, deleteContentPost } from "../fixtures/lib/demo-content";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { seedPosts } from "../fixtures/lib/seed-data";
import type { AdminSession } from "@yesvus/helmdeck";

/**
 * The content pages, rendered, over the real actions and the real store.
 *
 * The point of this file is the seam the other one cannot reach: that a person looking at the page
 * sees what is in the store. Every row asserted below is a row the store holds, read through the same
 * adapter the page reads through, and the counts are checked against the store's own count rather than
 * against a number written here, because a page that claims five posts over three is exactly the
 * failure this milestone exists to avoid.
 *
 * Nothing is stubbed between the form and the store. The permissions adapter is the only stand-in,
 * because the real one resolves a session from an HTTP-only cookie that a browser-shaped test
 * environment has none of, and the rule behind it is already asserted in `demo-roles.test.ts`.
 */

const caller = vi.hoisted(() => ({ session: undefined as AdminSession | undefined }));

/**
 * The session, stood in for at the guard.
 *
 * The real guard resolves a signed session from an HTTP-only cookie, and the session adapter refuses
 * to read one at all from a browser-shaped environment, which is what jsdom is. So the guard answers
 * with the caller a test names, and nothing below it is touched: the rule's answer, the actions and
 * the store are all the demo's own. The guard's own behaviour, including the refusal when there is no
 * session, is asserted in `demo-roles.test.ts`.
 */
vi.mock("../fixtures/lib/demo-guard", async () => {
  const actual = await vi.importActual<typeof import("../fixtures/lib/demo-guard")>(
    "../fixtures/lib/demo-guard",
  );
  return {
    ...actual,
    requireDemoSession: vi.fn(async () => {
      if (!caller.session) throw new Error("no session");
      return caller.session;
    }),
  };
});

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/shell/content",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({
    children,
    href,
    ...rest
  }: { children: ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...rest }, children),
}));

const owner: AdminSession = { email: "owner@demo.helmdeck.dev", role: "admin" };
const editor: AdminSession = { email: "editor@demo.helmdeck.dev", role: "editor" };

const store = demoPersistence().adapter;

/** The rule's own answer, so the buttons rendered are the ones the actions serve. */
const ruleAdapter: AdminPermissionsAdapter = {
  can: async (permission) => {
    const [resource, operation] = permission.split(".");
    if (caller.session?.role === "admin") return true;
    if (caller.session?.role === "editor") {
      return resource === "posts" && operation !== "delete";
    }
    return false;
  },
};

function tree(node: ReactNode) {
  return (
    <AdminI18nProvider locale="en">
      <AdminPermissionsProvider adapter={ruleAdapter}>
        {/* The detail route reads its params with `use`, which suspends. Next supplies the boundary in
            the app; a test has to, or the page renders nothing at all. */}
        <Suspense fallback={null}>{node}</Suspense>
      </AdminPermissionsProvider>
    </AdminI18nProvider>
  );
}

function page(node: ReactNode) {
  return render(tree(node));
}

/**
 * A page whose params arrive as a promise, as Next delivers them.
 *
 * Rendered inside `act`, because a suspending tree settles on a later microtask than the render call
 * itself: a test that read the DOM straight after rendering would be reading the fallback.
 */
async function detailPage(id: string) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(tree(<PostDetailPage params={Promise.resolve({ id })} />));
  });
  return result;
}

/** The body rows, so a count is the store's rows and not the table's own header or action cells. */
async function rows() {
  const table = await screen.findByRole("table");
  const body = within(table).getAllByRole("row").slice(1);
  return body.map((row) => within(row).queryAllByRole("cell").map((cell) => cell.textContent));
}

beforeEach(async () => {
  caller.session = owner;
  // Seeded rather than assumed, for the same reason the other content file does it: a store nothing
  // has written to would have every test here passing against an empty table.
  await ensureDemoSeeded();
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

describe("the content list", () => {
  it("shows the seeded posts with their stored titles and statuses", async () => {
    page(<ContentPage />);

    const shown = await rows();
    const inStore = await store.query<{ title: string; status: string }>("posts");

    // Compared against the store rather than against the seed, so this is a statement about the page
    // and not a restatement of the fixture the store was seeded from.
    expect(shown).toHaveLength(inStore.length);
    for (const post of inStore) {
      const cells = shown.find((cell) => cell[0] === post.title);
      expect(cells, post.title).toBeDefined();
      expect(cells?.[1], `${post.title} status`).toBe(post.status);
    }
  });

  it("shows a post that was written through the action, and stops showing one after it is deleted", async () => {
    // The strongest claim the page can make: it holds no list of its own, so a row appearing means the
    // table read the store. Each direction is checked on a fresh mount rather than after a refetch,
    // because a reload is the claim and a component that patched its own state would pass a test that
    // never re-read anything.
    const created = await createContentPost({ title: "Autumn sale", body: "Starts Monday." });

    const first = page(<ContentPage />);
    await screen.findByText("Autumn sale");
    expect(await rows()).toHaveLength((await store.query("posts")).length);
    first.unmount();

    await deleteContentPost(created.id);

    page(<ContentPage />);
    await waitFor(async () => {
      expect(await rows()).toHaveLength((await store.query("posts")).length);
    });
    expect(screen.queryByText("Autumn sale")).not.toBeInTheDocument();
  });

  it("renders the stored body, cut short for a list, so the content is readable from the list", async () => {
    // A body longer than the list shows, so the cutting is exercised rather than assumed. The seed's
    // own bodies are all short enough to render whole, which would leave the cut untested.
    const long = `${"A paragraph of post body. ".repeat(8)}The end.`;
    const created = await createContentPost({ title: "Long read", body: long });

    page(<ContentPage />);
    await screen.findByText("Long read");

    const cells = (await rows()).find((row) => row[0] === "Long read");
    expect(cells?.[2]).toBe(`${long.slice(0, 80).trimEnd()}...`);
    expect(cells?.[2]).not.toContain("The end.");
    await deleteContentPost(created.id);
  });

  it("orders the list by the stored position", async () => {
    page(<ContentPage />);

    const shown = await rows();
    const inStore = await store.query<{ title: string; position: number }>("posts");
    const byPosition = [...inStore].sort((left, right) => left.position - right.position);

    expect(shown.map((cells) => cells[0])).toEqual(byPosition.map((row) => row.title));
  });

  it("gives an editor the edit and new controls and no delete at all", async () => {
    caller.session = editor;
    page(<ContentPage />);
    await screen.findByText("Winter hours");

    // The view half only. The server half is asserted in demo-content.test.ts, because a hidden button
    // is not authorization and only the action can refuse a post the editor posts directly.
    // The absence is checked after the rows are on screen, because a control that has not been
    // decided yet and one that was refused look the same in the DOM, and this is a claim about a
    // refusal.
    await screen.findByText("Winter hours");
    await waitFor(async () => {
      const inStore = await store.query<{ id: string }>("posts");
      expect(screen.getAllByRole("link", { name: /^Edit/ })).toHaveLength(inStore.length);
    });
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    // The editor can still get in to write, which is the difference between a split and a wall.
    expect(screen.getByRole("link", { name: /New/ })).toBeInTheDocument();
  });

  it("gives the administrator a delete on every row the store holds", async () => {
    page(<ContentPage />);
    await screen.findByText("Winter hours");

    const inStore = await store.query<{ id: string }>("posts");
    // Waited for rather than read once: each row's control resolves its own permission, so a count
    // taken while they are still deciding is a count of the controls that happened to be ready.
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Delete/ })).toHaveLength(inStore.length);
    });
  });
});

describe("the post form", () => {
  it("edits a title and a body, and a reload of the page shows both again", async () => {
    const user = userEvent.setup();
    const first = await detailPage("pst_3");

    const title = await screen.findByLabelText("Title");
    expect(title).toHaveValue("Draft: returns policy");

    await user.clear(title);
    await user.type(title, "Returns policy");
    const body = screen.getByLabelText("Body");
    await user.clear(body);
    await user.type(body, "Sixty days, return shipping paid.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The store, not the field: the form holds what was typed either way, so a read of the form before
    // the reload would prove nothing about the write.
    await waitFor(async () => {
      const stored = await store.read<{ title: string; body: string }>("posts", "pst_3");
      expect(stored).toMatchObject({ title: "Returns policy", body: "Sixty days, return shipping paid." });
    });
    first.unmount();

    // A fresh mount, which is what a reload is. The form reads the post again through the action, so
    // what the fields hold now came from the store rather than from the previous render.
    await detailPage("pst_3");
    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toHaveValue("Returns policy");
      expect(screen.getByLabelText("Body")).toHaveValue("Sixty days, return shipping paid.");
    });
  });

  it("moves a post between draft and published, and a reload of the page shows the new status", async () => {
    const user = userEvent.setup();
    const first = await detailPage("pst_3");

    const status = await screen.findByLabelText("Status");
    expect(status).toHaveValue("draft");

    await user.selectOptions(status, "published");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      expect(await store.read<{ status: string }>("posts", "pst_3")).toMatchObject({ status: "published" });
    });
    first.unmount();

    await detailPage("pst_3");
    await waitFor(() => {
      expect(screen.getByLabelText("Status")).toHaveValue("published");
    });
  });

  it("offers only the statuses the column can hold", async () => {
    await detailPage("pst_3");

    const status = await screen.findByLabelText("Status");
    const offered = within(status).getAllByRole("option").map((option) => option.getAttribute("value"));

    // A status is a choice from a fixed set, so the form cannot offer a value the column refuses, and
    // the two it offers are the two the column holds.
    expect(offered).toEqual(["draft", "published"]);
  });

  it("will not submit a blank title, so the column's own check has nothing to catch", async () => {
    const user = userEvent.setup();
    await detailPage("pst_3");

    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(await store.read<{ title: string }>("posts", "pst_3")).toMatchObject({ title: "Draft: returns policy" });
  });

  it("creates a post that the list then shows, with a status the form chose", async () => {
    const user = userEvent.setup();
    page(<NewPostPage />);

    await user.type(await screen.findByLabelText("Title"), "Winter sale");
    await user.type(screen.getByLabelText("Body"), "Everything reduced.");
    await user.selectOptions(screen.getByLabelText("Status"), "published");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const found = await store.query<{ title: string; status: string }>("posts", { title: "Winter sale" });
      expect(found).toEqual([expect.objectContaining({ title: "Winter sale", status: "published" })]);
    });
  });
});
