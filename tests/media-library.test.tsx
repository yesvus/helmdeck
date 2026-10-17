// SPDX-License-Identifier: MIT
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AdminMediaLibrary,
  AdminMediaLibraryPage,
  adminMediaDeletableItem,
} from "../src/media/library";
import { AdminI18nProvider } from "../src/i18n";
import { turkishAdminMessages } from "../src/i18n/messages";
import { AdminPermissionsProvider } from "../src/shell/permissions";
import type {
  AdminMediaAdapter,
  AdminMediaItem,
  AdminPermissionsAdapter,
} from "../src/adapters/index";

/**
 * A store over three assets a host would actually hold: one it uploaded, one YouTube link, one
 * third-party URL. The three are the whole of the delete question, which is why they are here rather
 * than three uploads.
 */
function adapter(overrides: Partial<AdminMediaAdapter> = {}): AdminMediaAdapter {
  const items: AdminMediaItem[] = [
    {
      name: "Studio desk",
      path: "media/studio-desk.png",
      publicUrl: "https://cdn.example.com/media/studio-desk.png",
      source: "uploaded",
      kind: "image",
      contentType: "image/png",
      size: 2_411_724,
      updatedAt: "2026-10-10T09:00:00.000Z",
    },
    {
      name: "Autumn collection",
      path: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      publicUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      source: "youtube",
      kind: "youtube",
      updatedAt: "2026-10-08T09:00:00.000Z",
    },
    {
      name: "Press photo",
      path: "https://images.example.com/press.jpg",
      publicUrl: "https://images.example.com/press.jpg",
      source: "external",
      kind: "image",
      updatedAt: "2026-10-01T09:00:00.000Z",
    },
  ];

  return {
    list: vi.fn(async () => ({ items, total: items.length })),
    upload: vi.fn(async (file: File) => ({
      name: file.name,
      path: `media/${file.name}`,
      publicUrl: `https://cdn.example.com/media/${file.name}`,
      source: "uploaded" as const,
      kind: "image" as const,
      size: file.size,
      updatedAt: new Date().toISOString(),
    })),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function allowAll(): AdminPermissionsAdapter {
  return { can: vi.fn(async () => true) };
}

function denyAll(): AdminPermissionsAdapter {
  return { can: vi.fn(async () => false) };
}

function tree(element: React.ReactElement, permissions: AdminPermissionsAdapter = allowAll(), locale = "en") {
  return (
    <AdminI18nProvider locale={locale}>
      <AdminPermissionsProvider adapter={permissions}>{element}</AdminPermissionsProvider>
    </AdminI18nProvider>
  );
}

/** The asset tiles the grid printed, in the order it printed them. */
async function tiles(): Promise<HTMLElement[]> {
  return screen.findAllByRole("listitem");
}

function tileNamed(name: string): HTMLElement {
  const found = screen.getAllByRole("listitem").find((tile) => tile.textContent?.includes(name));
  if (!found) throw new Error(`no tile for ${name}`);
  return found;
}

describe("adminMediaDeletableItem", () => {
  it("offers delete for what this library stores, and not for a link to somebody else's file", () => {
    const store = adapter();

    expect(adminMediaDeletableItem({ name: "a", path: "a", publicUrl: "a", source: "uploaded", kind: "image" }, store)).toBe(true);
    expect(adminMediaDeletableItem({ name: "b", path: "b", publicUrl: "b", source: "local", kind: "image" }, store)).toBe(true);
    expect(adminMediaDeletableItem({ name: "c", path: "c", publicUrl: "c", source: "external", kind: "image" }, store)).toBe(false);
    expect(adminMediaDeletableItem({ name: "d", path: "d", publicUrl: "d", source: "youtube", kind: "youtube" }, store)).toBe(false);
  });

  it("offers nothing when the adapter cannot delete at all", () => {
    const readOnly = { list: adapter().list } as AdminMediaAdapter;

    expect(adminMediaDeletableItem({ name: "a", path: "a", publicUrl: "a", source: "uploaded", kind: "image" }, readOnly)).toBe(false);
  });
});

describe("AdminMediaLibrary", () => {
  it("reads the store and prints what it holds, newest first", async () => {
    const store = adapter();
    render(tree(<AdminMediaLibrary adapter={store} />));

    const printed = (await tiles()).map((tile) => tile.querySelector("p")?.textContent);
    expect(printed).toEqual(["Studio desk", "Autumn collection", "Press photo"]);
    expect(store.list).toHaveBeenCalledTimes(1);
  });

  it("names the kind and size under each asset, because a name alone does not say what it is", async () => {
    render(tree(<AdminMediaLibrary adapter={adapter()} />));
    await tiles();

    expect(tileNamed("Studio desk")).toHaveTextContent("Image · 2.3 MB");
    expect(tileNamed("Autumn collection")).toHaveTextContent("YouTube");
  });

  it("hands a typed search to the store rather than fetching everything and filtering it here", async () => {
    const user = userEvent.setup();
    const store = adapter();
    render(tree(<AdminMediaLibrary adapter={store} />));
    await tiles();

    await user.type(screen.getByLabelText("Search media"), "press");

    await waitFor(() => expect(store.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: "press" })));
  });

  it("narrows by kind through the store as well", async () => {
    const user = userEvent.setup();
    const store = adapter();
    render(tree(<AdminMediaLibrary adapter={store} />));
    await tiles();

    await user.selectOptions(screen.getByLabelText("Filter by kind"), "image");

    await waitFor(() => expect(store.list).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "image" })));
  });

  it("shows a load more only while the store says there is more", async () => {
    const user = userEvent.setup();
    const page = adapter({
      list: vi.fn(async (query) => ({
        items: query?.cursor ? [] : [{ name: "First", path: "a", publicUrl: "a", source: "uploaded" as const, kind: "image" as const }],
        nextCursor: query?.cursor ? undefined : "next",
        total: 1,
      })),
    });
    render(tree(<AdminMediaLibrary adapter={page} />));
    await tiles();

    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(page.list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "next" })));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument());
  });

  it("lands an uploaded asset in the grid without waiting for the next read", async () => {
    const user = userEvent.setup();
    const store = adapter();
    render(tree(<AdminMediaLibrary adapter={store} />));
    await tiles();

    await user.click(screen.getByRole("button", { name: "Upload" }));
    const file = new File(["bytes"], "new-logo.png", { type: "image/png" });
    // The drop zone is the control; the file input behind it is what receives the choice.
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    await user.click(screen.getByRole("button", { name: "Upload file" }));

    // The name is on the tile and in the upload control that still holds the file, so this reads the
    // grid rather than the page.
    expect((await tiles()).map((tile) => tile.textContent ?? "")).toContainEqual(
      expect.stringContaining("new-logo.png"),
    );
  });

  it("previews an image in the lightbox rather than replacing the page", async () => {
    const user = userEvent.setup();
    render(tree(<AdminMediaLibrary adapter={adapter()} />));
    await tiles();

    await user.click(within(tileNamed("Studio desk")).getByRole("button", { name: /^Preview image/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("opens a file that is not an image in a new tab, because there is nothing to preview", async () => {
    render(tree(<AdminMediaLibrary adapter={adapter()} />));
    await tiles();

    const link = within(tileNamed("Autumn collection")).getByRole("link");
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("offers delete for an uploaded asset and removes it once the store agrees", async () => {
    const user = userEvent.setup();
    const store = adapter();
    render(tree(<AdminMediaLibrary adapter={store} />));
    await tiles();

    const row = tileNamed("Studio desk");
    await user.click(within(row).getByRole("button", { name: "Delete: Studio desk" }));
    await user.click(await screen.findByRole("button", { name: "Yes, delete" }));

    await waitFor(() => expect(store.delete).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("Studio desk")).not.toBeInTheDocument());
    expect(screen.getByText(/^Deleted: Studio desk$/)).toBeInTheDocument();
  });

  it("offers no delete for a link to somebody else's file", async () => {
    render(tree(<AdminMediaLibrary adapter={adapter()} />));
    await tiles();

    expect(within(tileNamed("Autumn collection")).queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(within(tileNamed("Press photo")).queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
  });

  it("offers no delete at all when the store has no delete", async () => {
    const readOnly = { list: adapter().list, upload: adapter().upload } as AdminMediaAdapter;
    render(tree(<AdminMediaLibrary adapter={readOnly} />));
    await tiles();

    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
  });

  it("leaves the asset in place when the store refuses to delete it", async () => {
    const user = userEvent.setup();
    const store = adapter({ delete: vi.fn(async () => { throw new Error("store refused"); }) });
    render(tree(<AdminMediaLibrary adapter={store} />));
    await tiles();

    await user.click(within(tileNamed("Studio desk")).getByRole("button", { name: "Delete: Studio desk" }));
    await user.click(await screen.findByRole("button", { name: "Yes, delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That asset could not be deleted.");
    expect(screen.getByText("Studio desk")).toBeInTheDocument();
  });

  it("shows no upload and no delete to a session the rule refuses, and asks the store for nothing more", async () => {
    const store = adapter();
    render(tree(<AdminMediaLibrary adapter={store} uploadPermission="media.upload" deletePermission="media.delete" />, denyAll()));
    await tiles();

    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(store.list).toHaveBeenCalledTimes(1);
  });

  it("shows them again to a session the rule allows", async () => {
    render(tree(<AdminMediaLibrary adapter={adapter()} uploadPermission="media.upload" deletePermission="media.delete" />));
    await tiles();

    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete: Studio desk" })).toBeInTheDocument();
  });

  it("says a store refused the read, with a way to ask again", async () => {
    const user = userEvent.setup();
    const store = adapter({
      list: vi.fn(async () => {
        throw new Error("store is down");
      }),
    });
    render(tree(<AdminMediaLibrary adapter={store} />));

    expect(await screen.findByRole("alert")).toHaveTextContent("Media could not be loaded.");

    store.list = vi.fn(async () => ({ items: [], total: 0 }));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("says nothing is wired rather than showing an empty grid a host would read as an empty library", () => {
    render(tree(<AdminMediaLibrary />));

    expect(screen.getByRole("status")).toHaveTextContent("no media store wired");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("renders the assets a host passed instead of reading a store it does not have", async () => {
    render(
      tree(
        <AdminMediaLibrary
          items={[{ name: "From props", path: "a", publicUrl: "a", source: "uploaded", kind: "image" }]}
        />,
      ),
    );

    expect((await tiles())[0]).toHaveTextContent("From props");
  });

  it("prints its own wording in Turkish when the shell is in Turkish", async () => {
    render(tree(<AdminMediaLibrary adapter={adapter()} />, allowAll(), "tr"));
    await tiles();

    expect(screen.getByLabelText("Medya arayın")).toBeInTheDocument();
    expect(screen.getByLabelText("Türe göre filtreleyiniz")).toBeInTheDocument();
    expect(turkishAdminMessages.media.libraryTitle).toBe("Medya");
  });
});

describe("AdminMediaLibraryPage", () => {
  it("mounts the whole page, so a host adds a route rather than a project", async () => {
    render(tree(<AdminMediaLibraryPage adapter={adapter()} />));

    expect(screen.getByRole("heading", { level: 1, name: "Media" })).toBeInTheDocument();
    expect((await tiles())).toHaveLength(3);
  });

  it("lets the host name the page", () => {
    render(tree(<AdminMediaLibraryPage adapter={adapter()} title="Brand assets" description="Logos and photos." />));

    expect(screen.getByRole("heading", { level: 1, name: "Brand assets" })).toBeInTheDocument();
    expect(screen.getByText("Logos and photos.")).toBeInTheDocument();
  });
});