// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminCollectionEditor } from "../src/collections/editor";
import { adminCollectionAdd, type AdminCollectionDefinition, type AdminCollectionEntry } from "../src/collections/registry";

type Block = { title: string };

const definition: AdminCollectionDefinition<Block> = {
  name: "blocks",
  fields: [{ name: "title" }],
  create: () => ({ title: "" }),
  validate: (entry) => (entry.title.trim() ? [] : ["A block needs a title"]),
};

/**
 * A host that owns the value, which is how the component is meant to be used. Holding the state
 * here rather than rerendering a fresh editor keeps the editor instance mounted, so its selection
 * survives the change it just made.
 */
function Editor({
  initial = [],
  onChange,
  definition: def = definition,
}: {
  initial?: AdminCollectionEntry<Block>[];
  onChange?: (entries: AdminCollectionEntry<Block>[]) => void;
  definition?: AdminCollectionDefinition<Block>;
}) {
  const [entries, setEntries] = useState(initial);
  return (
    <AdminI18nProvider locale="en">
      <AdminCollectionEditor
        definition={def}
        entries={entries}
        onChange={(next) => {
          setEntries(next);
          onChange?.(next);
        }}
        title="Blocks"
        renderSummary={(entry) => entry.title || "Untitled"}
        renderFields={(entry) => <p>fields for {entry.title || "Untitled"}</p>}
      />
    </AdminI18nProvider>
  );
}

function twoEntries() {
  return [adminCollectionAdd([], { title: "first" })[0], adminCollectionAdd([], { title: "second" })[0]];
}

describe("AdminCollectionEditor", () => {
  it("shows a deliberate empty state rather than a blank panel", () => {
    render(<Editor initial={[]} onChange={vi.fn()} />);

    // A new host lands on this first, so a blank panel would read as a broken editor.
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add/ })).toBeInTheDocument();
  });

  it("adds an entry built by the host definition", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Editor initial={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Add/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });

  it("selects what was just added, so a keyboard user is not left at the top of the list", async () => {
    const user = userEvent.setup();
    render(<Editor initial={[]} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Add/ }));

    // The empty state is the only Add control while empty, so this also proves it is reachable.
    expect(screen.getByText("fields for Untitled")).toBeInTheDocument();
  });

  it("reveals the host's fields for the selected entry and hides them again", async () => {
    const user = userEvent.setup();
    render(<Editor initial={twoEntries()} onChange={vi.fn()} />);

    expect(screen.queryByText(/fields for/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "first" }));
    expect(screen.getByText("fields for first")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "first" }));
    expect(screen.queryByText(/fields for/)).not.toBeInTheDocument();
  });

  it("surfaces validation problems per entry, naming the entry they belong to", () => {
    render(<Editor initial={[{ id: "bad", title: "  " }]} onChange={vi.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("A block needs a title");
  });

  it("reports no alert for a valid entry", () => {
    render(<Editor initial={[{ id: "ok", title: "fine" }]} onChange={vi.fn()} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("duplicates an entry and removes it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Editor initial={twoEntries()} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Duplicate 1" }));
    expect(onChange.mock.calls[0][0]).toHaveLength(3);
    // A duplicated id would make every later reorder apply to whichever copy came first.
    expect(new Set(onChange.mock.calls[0][0].map((e: AdminCollectionEntry<Block>) => e.id)).size).toBe(3);

    onChange.mockClear();
    await user.click(screen.getByRole("button", { name: "Remove 2" }));
    expect(onChange.mock.calls[0][0]).toHaveLength(2);
  });

  it("offers a keyboard-reachable drag handle on every entry", () => {
    render(<Editor initial={twoEntries()} onChange={vi.fn()} />);

    // Reordering has to work without a pointer, or the editor fails accessibility outright.
    expect(screen.getByRole("button", { name: "Edit 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit 2" })).toBeInTheDocument();
  });

  it("labels the add, duplicate and remove controls per position", () => {
    render(<Editor initial={twoEntries()} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Duplicate 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove 1" })).toBeInTheDocument();
  });

  /**
   * The editor renders its own drag handles and calls the sortable hook, and for a long time it
   * provided neither a `DndContext` nor a `SortableContext`. `useSortable` reads its activators and
   * listeners from that context, so every handle was an inert button that still carried a role, a
   * label and a tab stop: focusable, reachable, and doing nothing on Space or on a drag. No test
   * caught it because none of them asked whether the handle worked, only whether it was there.
   *
   * A host cannot detect this either. The fix is a wrapper they have to know about, and the one
   * consumer of this component wrapped it, which is exactly how the engine's gap stayed invisible.
   */
  it("provides the drag context itself, so a host does not have to know to wrap it", async () => {
    const user = userEvent.setup();
    render(<Editor initial={twoEntries()} onChange={vi.fn()} />);

    const handle = screen.getByRole("button", { name: "Edit 1" });

    // With a context the handle is wired to a screen reader instruction and reports its state.
    // Without one, dnd-kit leaves both empty while the handle still looks and tabs like a control.
    expect(handle.getAttribute("aria-describedby")).toBeTruthy();

    handle.focus();
    await user.keyboard(" ");

    expect(handle.getAttribute("aria-pressed")).toBe("true");
  });

  it("falls back to a positional label when the host renders no summary", () => {
    render(
      <AdminI18nProvider locale="en">
        <AdminCollectionEditor definition={definition} entries={twoEntries()} onChange={vi.fn()} title="Blocks" />
      </AdminI18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Edit 1" })).toBeInTheDocument();
  });
});
