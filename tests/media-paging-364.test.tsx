// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminMediaLibrary } from "../src/media/library";
import { AdminMediaPicker } from "../src/media/picker";
import { AdminI18nProvider } from "../src/i18n";
import { AdminPermissionsProvider } from "../src/shell/permissions";
import type { AdminMediaAdapter, AdminMediaItem } from "../src/adapters/index";

function libraryAdapter(list: ReturnType<typeof vi.fn>) {
  return { list, upload: vi.fn(), delete: vi.fn() } as AdminMediaAdapter;
}

function pickerAdapter(list: ReturnType<typeof vi.fn>, upload = vi.fn()) {
  return { list, upload } as AdminMediaAdapter;
}

function tree(element: React.ReactElement) {
  return (
    <AdminI18nProvider locale="en">
      <AdminPermissionsProvider adapter={{ can: vi.fn(async () => true) }}>{element}</AdminPermissionsProvider>
    </AdminI18nProvider>
  );
}

const first: AdminMediaItem = {
  name: "First asset",
  path: "media/first.png",
  publicUrl: "/media/first.png",
  source: "uploaded",
  kind: "image",
};

const second: AdminMediaItem = {
  name: "Second asset",
  path: "media/second.png",
  publicUrl: "/media/second.png",
  source: "uploaded",
  kind: "image",
};

describe("media paging 364", () => {
  it("continues to the second page through the adapter continuation token (library)", async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [first], nextCursor: "page-2", total: 2 })
      .mockResolvedValueOnce({ items: [second], total: 2 });
    render(tree(<AdminMediaLibrary adapter={libraryAdapter(list)} pageSize={1} />));

    expect(await screen.findByText("First asset")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "page-2", limit: 1 })));
    expect(await screen.findByText("Second asset")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("re-queries when the search, kind filter or sort changes (library)", async () => {
    const user = userEvent.setup();
    const list = vi.fn().mockResolvedValue({ items: [first, second], total: 2 });
    render(tree(<AdminMediaLibrary adapter={libraryAdapter(list)} />));
    await screen.findAllByRole("listitem");

    await user.type(screen.getByLabelText("Search media"), "second");
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ search: "second" })));
    const lastSearch = list.mock.calls[list.mock.calls.length - 1][0];
    expect(lastSearch.cursor).toBeUndefined();

    await user.selectOptions(screen.getByLabelText("Filter by kind"), "image");
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "image" })));

    await user.selectOptions(screen.getByLabelText("Sort media"), "name-asc");
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "name-asc" })));
  });

  it("shows an error state and retries the read (library)", async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("store is down"))
      .mockResolvedValueOnce({ items: [first], total: 1 });
    render(tree(<AdminMediaLibrary adapter={libraryAdapter(list)} />));

    expect(await screen.findByRole("alert")).toHaveTextContent("Media could not be loaded.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("First asset")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("selects an item from a later page in the picker", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [first], nextCursor: "page-2", total: 2 })
      .mockResolvedValueOnce({ items: [second], total: 2 });
    render(
      <AdminI18nProvider locale="en">
        <AdminMediaPicker
          adapter={pickerAdapter(list)}
          items={[]}
          pageSize={1}
          onClose={vi.fn()}
          onSelect={onSelect}
          open
          title="Choose media"
        />
      </AdminI18nProvider>,
    );

    expect(await screen.findByRole("button", { name: /First asset/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "page-2", limit: 1 })));
    const secondCard = await screen.findByRole("button", { name: /Second asset/ });
    await user.click(secondCard);
    expect(onSelect).toHaveBeenCalledWith(second);
  });

  it("re-queries on search, kind and sort changes in the picker", async () => {
    const user = userEvent.setup();
    const list = vi.fn().mockResolvedValue({ items: [first], total: 1 });
    render(
      <AdminI18nProvider locale="en">
        <AdminMediaPicker
          adapter={pickerAdapter(list)}
          allowedKinds={["image", "video"]}
          items={[]}
          onClose={vi.fn()}
          onSelect={vi.fn()}
          open
          title="Choose media"
        />
      </AdminI18nProvider>,
    );
    await waitFor(() => expect(list).toHaveBeenCalled());

    const search = screen.getByLabelText("Search media");
    await user.type(search, "needle");
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ search: "needle" })));

    await user.selectOptions(screen.getByLabelText("Sort media"), "name-asc");
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "name-asc" })));
  });

  it("shows an error state and retries the read (picker)", async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [first], total: 1 });
    render(
      <AdminI18nProvider locale="en">
        <AdminMediaPicker
          adapter={pickerAdapter(list)}
          items={[]}
          onClose={vi.fn()}
          onSelect={vi.fn()}
          open
          title="Choose media"
        />
      </AdminI18nProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Media could not be loaded.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /First asset/ })).toBeInTheDocument();
  });

  it("makes an uploaded asset selectable from the picker without reloading the catalog", async () => {
    const user = userEvent.setup();
    const uploaded: AdminMediaItem = {
      name: "fresh.png",
      path: "media/fresh.png",
      publicUrl: "/media/fresh.png",
      source: "uploaded",
      kind: "image",
    };
    const list = vi.fn().mockResolvedValue({ items: [first], total: 1 });
    const upload = vi.fn().mockResolvedValue(uploaded);
    const onSelect = vi.fn();
    render(
      <AdminI18nProvider locale="en">
        <AdminMediaPicker
          adapter={pickerAdapter(list, upload)}
          items={[]}
          onClose={vi.fn()}
          onSelect={onSelect}
          open
          title="Choose media"
        />
      </AdminI18nProvider>,
    );
    await screen.findByRole("button", { name: /First asset/ });

    await user.click(screen.getByRole("button", { name: "Upload" }));
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(["bytes"], "fresh.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Upload file" }));

    const card = await screen.findByRole("button", { name: /fresh.png/ });
    await user.click(card);
    expect(onSelect).toHaveBeenCalledWith(uploaded);
  });
});
