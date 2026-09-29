// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminCollectionEditor } from "../src/collections/editor";
import {
  adminCollectionAdd,
  adminCollectionReorder,
  type AdminCollectionDefinition,
  type AdminCollectionEntry,
} from "../src/collections/registry";
import { AdminSortableDndContext, useAdminSortableList } from "../src/primitives/sortable-list";

type Block = { title: string };

const definition: AdminCollectionDefinition<Block> = {
  name: "blocks",
  fields: [{ name: "title" }],
  create: () => ({ title: "" }),
};

function twoEntries(): AdminCollectionEntry<Block>[] {
  return adminCollectionAdd(adminCollectionAdd([], { title: "first" }), { title: "second" });
}

/**
 * The editor exactly as the package ships it, with nothing around it.
 *
 * Kept because it is the half of the pair that matters: it is what a host gets before it knows the
 * context is missing.
 */
function BareEditor({ initial }: { initial: AdminCollectionEntry<Block>[] }) {
  const [entries, setEntries] = useState(initial);
  return (
    <AdminI18nProvider locale="en">
      <AdminCollectionEditor
        definition={definition}
        entries={entries}
        onChange={setEntries}
        title="Blocks"
        renderSummary={(entry) => entry.title || "Untitled"}
      />
    </AdminI18nProvider>
  );
}

/** The same editor with the drag context a host has to add around it. */
function HostedEditor({ initial }: { initial: AdminCollectionEntry<Block>[] }) {
  const [entries, setEntries] = useState(initial);
  const sortable = useAdminSortableList<AdminCollectionEntry<Block>>({
    items: entries,
    getId: (entry) => entry.id,
    onReorder: async (orderedIds) => {
      setEntries(adminCollectionReorder(entries, orderedIds));
      return { success: true, message: "Reordered" };
    },
  });

  return (
    <AdminI18nProvider locale="en">
      <AdminSortableDndContext
        ids={sortable.ids}
        sensors={sortable.sensors}
        announcements={sortable.announcements}
        onDragEnd={sortable.handleDragEnd}
      >
        <AdminCollectionEditor
          definition={definition}
          entries={entries}
          onChange={setEntries}
          title="Blocks"
          renderSummary={(entry) => entry.title || "Untitled"}
        />
      </AdminSortableDndContext>
    </AdminI18nProvider>
  );
}

function firstHandle() {
  return screen.getByRole("button", { name: "Edit 1" });
}

/**
 * Whether the shipped editor can reorder on its own.
 *
 * The editor renders the cards and the handles and asks the sortable hook for sensors and a drag-end
 * handler, but renders no context for them to attach to. `useSortable` reads its activators and its
 * listeners from that context, so without one the handle is a button that does nothing, while still
 * carrying the role, the label and the focusability that make it look like a working control.
 *
 * This is asserted rather than described because the demo page compensates for it by supplying the
 * context itself, and a compensation with no test is indistinguishable from leaving the defect in.
 */
describe("the editor's drag context", () => {
  it("attaches the keyboard sensor when a host supplies the drag context", async () => {
    const user = userEvent.setup();
    render(<HostedEditor initial={twoEntries()} />);

    const handle = firstHandle();
    handle.focus();
    expect(handle).toHaveFocus();
    await user.keyboard(" ");

    // dnd-kit publishes the instructions it attached through `aria-describedby`, and reports a lifted
    // drag through `aria-pressed`. Both appear only when there is a context to attach to, which is
    // what distinguishes a working handle from a labelled button.
    expect(handle.getAttribute("aria-describedby")).not.toBe("");
    expect(handle).toHaveAttribute("aria-pressed", "true");
  });

  it("describes nothing without a context, and dnd-kit's own instructions with one", () => {
    // The handle keeps its role, its label and its focusability either way, so nothing a person can
    // look at tells the two apart, and the announcement is the only thing that differs. It is the
    // thing a screen reader reads when the handle takes focus, so it is resolved rather than merely
    // checked for presence: an attribute pointing at nothing announces nothing.
    const bare = render(<BareEditor initial={twoEntries()} />);
    // Absent or empty, depending on whether a context has ever been mounted in this document.
    expect(firstHandle().getAttribute("aria-describedby") ?? "").toBe("");
    bare.unmount();

    const hosted = render(<HostedEditor initial={twoEntries()} />);
    const describedBy = firstHandle().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const instructions = document.getElementById(String(describedBy));
    expect(instructions).not.toBeNull();
    expect(instructions?.textContent).not.toBe("");
    hosted.unmount();
  });
});
