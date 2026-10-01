// SPDX-License-Identifier: MIT
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import type { LandingSection } from "../fixtures/app/(helmdeck)/shell/pages/landing-registry";

/**
 * The host contract: what the page owes the engine's editor, and what it owes the store.
 *
 * The editor is uncontrolled, so the browser has to own the value and there has to be somewhere to put
 * every change. `saveLandingSections` is stood in for, which is what makes these tests about the
 * contract rather than about the store: what arrives here is what the action will be handed.
 *
 * **Geometry is stubbed, because a reorder is the milestone and it cannot be exercised without it.**
 * jsdom reports every element as a zero-sized box, so dnd-kit's collision detection sees one point and
 * a keyboard drag has nowhere to go. Each row is given a real rectangle here, so a drop on the row
 * below is a drop on the row below, and the assertions below are about the order that came out the
 * other side rather than about a drag having started.
 */

const saved: LandingSection[][] = [];
const stored: { sections: LandingSection[] } = { sections: [] };

vi.mock("../fixtures/lib/demo-collections", () => ({
  saveLandingSections: vi.fn(async (sections: LandingSection[]) => {
    saved.push(sections);
  }),
  readLandingSections: vi.fn(async () => stored.sections),
}));

const { LandingPageEditor } = await import("../fixtures/app/(helmdeck)/shell/pages/section-editor");
const { default: PagesPage } = await import("../fixtures/app/(helmdeck)/shell/pages/page");

const arrangement: LandingSection[] = [
  { id: "sec_hero", widget: "hero", size: "xl", title: "A sofa that arrives early" },
  { id: "sec_faq", widget: "faq", size: "sm", title: "Sixty days to change your mind" },
];

function renderEditor(initial: LandingSection[] = arrangement) {
  return render(
    <AdminI18nProvider locale="en">
      <LandingPageEditor initial={initial} />
    </AdminI18nProvider>,
  );
}

const lastSaved = () => saved[saved.length - 1];
const savedIds = () => lastSaved().map((section) => section.id);

/** The summary of one entry, which is also how a person opens that entry's fields. */
function summaryOf(heading: string, size: string) {
  return screen.getByRole("button", { name: `${heading} · ${size}` });
}

function handleFor(index: number) {
  return screen.getByRole("button", { name: `Edit ${index + 1}` });
}

/** One real rectangle per row, which is the only way a drag has somewhere to go under jsdom. */
function stubGeometry() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const row = this.closest("li") ?? this;
    const rows: Element[] = Array.from(row.ownerDocument.querySelectorAll("li"));
    const index = Math.max(0, rows.indexOf(row));
    const top = index * ROW_HEIGHT;
    return {
      x: 0,
      y: top,
      top,
      bottom: top + ROW_HEIGHT,
      left: 0,
      right: WIDTH,
      width: WIDTH,
      height: ROW_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

const ROW_HEIGHT = 120;
const WIDTH = 480;

beforeEach(() => {
  saved.length = 0;
  stored.sections = arrangement;
  stubGeometry();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the landing page editor", () => {
  it("adds a section and sends the whole arrangement to the host", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: /^Add/ }));

    await waitFor(() => expect(saved).toHaveLength(1));
    // One write of the whole list rather than an action per operation, because that is what the
    // editor reports and the store reconciles against.
    expect(lastSaved()).toHaveLength(3);
    // What was just added is selected, so its fields are on screen rather than hidden above the fold.
    expect(screen.getByLabelText("Section")).toBeInTheDocument();
  });

  it("duplicates a section under an identity of its own", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Duplicate 1" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(savedIds()).toHaveLength(3);
    // A copy sharing an identity is the failure a duplicate has to avoid, since every later move
    // would then apply to whichever copy happened to be first.
    expect(new Set(savedIds()).size).toBe(3);
  });

  it("edits a heading, which is the host's own field, and sends the edit", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(summaryOf("A sofa that arrives early", "xl"));
    await user.clear(screen.getByLabelText("Heading"));
    await user.type(screen.getByLabelText("Heading"), "Renamed by a person");

    await waitFor(() => expect(saved.length).toBeGreaterThan(0));
    expect(lastSaved()[0]).toMatchObject({ id: "sec_hero", title: "Renamed by a person" });
    // The heading is what the arrangement renders, so the preview follows the edit rather than
    // showing the text the row happened to arrive with.
    expect(screen.getByText("Renamed by a person")).toBeInTheDocument();
  });

  it("edits a width and sends the edit", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(summaryOf("A sofa that arrives early", "xl"));
    await user.selectOptions(screen.getByLabelText("Width"), "md");

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(lastSaved()[0]).toMatchObject({ id: "sec_hero", size: "md" });
  });

  it("moves a section to a width the section it names actually supports", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(summaryOf("Sixty days to change your mind", "sm"));
    // `hero` renders full width only, so naming it has to bring the width with it rather than leave
    // an arrangement the registry rejects on the entry.
    await user.selectOptions(screen.getByLabelText("Section"), "hero");

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(lastSaved()[1]).toMatchObject({ widget: "hero", size: "xl" });
  });

  it("keeps a width the newly named section already supports", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(summaryOf("A sofa that arrives early", "xl"));
    // `faq` renders at every width, so a width the person already chose is still renderable and
    // forcing a different one would discard a decision nobody made.
    await user.selectOptions(screen.getByLabelText("Section"), "faq");

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(lastSaved()[0]).toMatchObject({ widget: "faq", size: "xl" });
  });
});

describe("reordering, which is the part that has to work without a pointer", () => {
  it("reorders with the keyboard, from the focused handle", async () => {
    const user = userEvent.setup();
    renderEditor();

    const handle = handleFor(1);
    handle.focus();
    expect(handle).toHaveFocus();

    // Space lifts, the arrow key moves over the row above, Space drops. The lift alone would pass
    // against an editor whose keyboard path is decorative, so the order that comes out is asserted.
    await user.keyboard(" ");
    expect(handle).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("{ArrowUp}");
    await user.keyboard(" ");

    await waitFor(() => expect(saved.length).toBeGreaterThan(0));
    expect(savedIds()).toEqual(["sec_faq", "sec_hero"]);
  });

  it("reorders with a pointer drag", async () => {
    const user = userEvent.setup();
    renderEditor();

    const handle = handleFor(1);
    const box = handle.getBoundingClientRect();
    await user.pointer([
      { keys: "[MouseLeft>]", target: handle, coords: { clientX: 10, clientY: box.y + 10 } },
      // Past the sensor's activation distance, then onto the row above.
      { target: handle, coords: { clientX: 10, clientY: box.y - 40 } },
      { target: handle, coords: { clientX: 10, clientY: box.y - 100 } },
      { keys: "[/MouseLeft]", target: handle, coords: { clientX: 10, clientY: box.y - 100 } },
    ]);

    await waitFor(() => expect(saved.length).toBeGreaterThan(0));
    expect(savedIds()).toEqual(["sec_faq", "sec_hero"]);
  });

  it("gives every entry a handle the keyboard can reach", () => {
    renderEditor();

    // Reordering has to work without a pointer, or the editor fails accessibility outright, and a
    // handle that is not focusable is the ordinary way that happens.
    for (const name of ["Edit 1", "Edit 2"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("tabindex", "0");
    }
  });
});

describe("what the page says about the write", () => {
  it("says so when the host refuses the write rather than showing it as saved", async () => {
    const user = userEvent.setup();
    const { saveLandingSections } = await import("../fixtures/lib/demo-collections");
    vi.mocked(saveLandingSections).mockRejectedValueOnce(
      new Error("This session may not delete landing_sections"),
    );
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Remove 2" }));

    // A refused write that reported success would leave a removal that looks saved and is not.
    expect(await screen.findByText(/Not saved: This session may not delete/)).toBeInTheDocument();
  });

  it("reports success once the host has taken the arrangement", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: /^Add/ }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("shows an empty page as a deliberate empty state", () => {
    renderEditor([]);

    // A new host lands on this first, so a blank panel reads as a broken editor.
    expect(screen.getByText("No sections yet")).toBeInTheDocument();
  });
});

describe("the page as the route serves it", () => {
  it("hands the editor the stored arrangement, rather than an editor that fills in afterwards", async () => {
    // The page is a server component, so the arrangement has to be resolved before anything reaches
    // the browser. Calling it rather than rendering it is the point: an async server component cannot
    // be rendered by the test renderer at all, and what is being checked is what the route hands over
    // rather than how it paints afterwards.
    const { readLandingSections } = await import("../fixtures/lib/demo-collections");
    const storedArrangement: LandingSection[] = [
      ...arrangement,
      { id: "sec_pricing", widget: "pricing", size: "md", title: "Under 900, delivery included" },
    ];
    vi.mocked(readLandingSections).mockResolvedValueOnce(storedArrangement);

    const element = await PagesPage();

    expect(vi.mocked(readLandingSections)).toHaveBeenCalledTimes(1);
    expect((element.props as { initial: LandingSection[] }).initial).toEqual(storedArrangement);
  });
});
