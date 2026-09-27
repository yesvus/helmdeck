// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { LayoutGrid } from "lucide-react";
import {
  AdminFormCard,
  AdminListItemCard,
  AdminSectionCard,
  AdminStatCard,
  AdminSurfaceCard,
} from "../src/primitives/layout";

function backgroundsOf(element: Element | null): string[] {
  return (element?.className ?? "").split(/\s+/).filter((name) => name.startsWith("bg-"));
}

// One list of card roots, shared by the checks below. Duplicated per block, the two lists could
// drift apart and a card could satisfy the radius rule while quietly breaking the background rule.
const cardFixtures: [string, ReactElement][] = [
  ["AdminSurfaceCard", <AdminSurfaceCard key="a">Content</AdminSurfaceCard>],
  ["AdminSectionCard", <AdminSectionCard key="b" icon={LayoutGrid} title="Overview">Content</AdminSectionCard>],
  ["AdminStatCard", <AdminStatCard key="c" icon={LayoutGrid} label="Orders" value="12" detail="Since Monday" />],
  ["AdminListItemCard", <AdminListItemCard key="d" title="Row" />],
  ["AdminFormCard", <AdminFormCard key="e" title="Details">Content</AdminFormCard>],
  [
    "AdminFormCard collapsible",
    <AdminFormCard key="f" title="Details" collapsible>
      Content
    </AdminFormCard>,
  ],
];

describe("admin card primitives", () => {
  it("exposes section descriptions through contextual help only", () => {
    render(
      <AdminSectionCard icon={LayoutGrid} title="Overview" description="Review the current activity">
        <p>Primary content</p>
      </AdminSectionCard>,
    );

    expect(screen.getByRole("heading", { name: /^Overview/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help: Overview" })).toBeInTheDocument();
    expect(screen.getAllByText("Review the current activity")).toHaveLength(1);
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Review the current activity");
    expect(screen.getByText("Primary content")).toBeInTheDocument();
  });

  it("uses the shared semantic card surface and radius", () => {
    const { container } = render(<AdminSurfaceCard>Content</AdminSurfaceCard>);

    expect(container.firstElementChild).toHaveClass("rounded-admin-card", "border", "border-admin-border", "bg-admin-surface");
  });

  it.each(cardFixtures)("gives %s the shared radius and border", (_name, element) => {
    const { container } = render(element);

    // "border" is the width utility; "border-admin-border" only sets the colour, so a surface missing
    // the width renders no visible edge at all.
    expect(container.firstElementChild).toHaveClass("rounded-admin-card", "border", "border-admin-border");
  });

  it("emits exactly one background utility per card, so stylesheet order cannot decide it", () => {
    // cn does not merge. A shared "bg-" plus a per-variant "bg-" leaves two background utilities in
    // one class list and hands the winner to stylesheet order, which is how the muted accent used to
    // be decided. Every card root is covered, not just the one that first showed the problem.
    const { container: muted } = render(
      <AdminFormCard title="Details" accent="muted">
        Content
      </AdminFormCard>,
    );
    const { container: plain } = render(<AdminFormCard title="Details">Content</AdminFormCard>);

    expect(backgroundsOf(muted.firstElementChild)).toEqual(["bg-admin-surface-subtle"]);
    expect(backgroundsOf(plain.firstElementChild)).toEqual(["bg-admin-surface"]);
  });

  it.each(cardFixtures)("gives %s exactly one background utility", (_name, element) => {
    const { container } = render(element);

    expect(backgroundsOf(container.firstElementChild)).toHaveLength(1);
  });

  it("separates a card header and footer from the body", () => {
    render(
      <AdminFormCard title="Details" action={<button type="button">Save</button>} collapsible>
        <p>Body</p>
      </AdminFormCard>,
    );

    const summary = screen.getByText("Details").closest("summary");
    const save = screen.getByRole("button", { name: "Save" });
    // A summary row is the disclosure control, so an action inside it would toggle the card too.
    expect(summary).not.toContainElement(save);
    expect(save.closest("details")).toHaveClass("rounded-admin-card");
    expect(save.parentElement).toHaveClass("border-t", "border-admin-border", "sm:justify-end");
  });

  it("exposes list item subtitles through contextual help, like every other card", () => {
    render(<AdminListItemCard title="Row" subtitle="Updated by Ada" />);

    expect(screen.getByRole("button", { name: "Help: Row" })).toBeInTheDocument();
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Updated by Ada");
  });
});

// A circle is a shape rather than a surface radius, so rounded-full stays allowed. Bare "rounded" is
// Tailwind's own default radius and has to be caught.
function hardcodedRadii(text: string): string[] {
  return text.match(/\brounded\b(?!-(?:admin-card|admin-control|full)\b)[\w[\]-]*/g) ?? [];
}

describe("card surface contract", () => {
  const file = join(process.cwd(), "src/primitives/layout.tsx");
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  it("keeps a hardcoded radius out of the card primitives", () => {
    // The card primitives had drifted across rounded-lg, rounded-xl and the radius token. Rendering
    // checks cannot stop a new card from reintroducing it, so the source is checked directly.
    //
    // Every string literal is scanned, not just JSX className attributes: the surface radius lives in
    // a constant that is applied through cn(), so an attribute-only scan never sees it. Bare
    // "rounded" is Tailwind's own default radius and has to be caught as well.
    const offenders: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        for (const radius of hardcodedRadii(node.text)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          offenders.push(`layout.tsx:${line + 1} ${radius}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    expect(offenders, "card surfaces use rounded-admin-card").toEqual([]);
  });

  it("still finds a hardcoded radius, and still allows the tokens and a circle", () => {
    // A count of scanned strings would couple this to how the file happens to be factored today, so
    // the detector is checked against known input instead. Without it, a matcher that stopped
    // matching anything would leave the scan above passing forever.
    expect(hardcodedRadii("rounded-xl border")).toEqual(["rounded-xl"]);
    expect(hardcodedRadii("rounded-lg")).toEqual(["rounded-lg"]);
    expect(hardcodedRadii("rounded border")).toEqual(["rounded"]);
    expect(hardcodedRadii("rounded-t-2xl")).toEqual(["rounded-t-2xl"]);
    expect(hardcodedRadii("rounded-admin-card border")).toEqual([]);
    expect(hardcodedRadii("rounded-admin-control")).toEqual([]);
    expect(hardcodedRadii("rounded-full")).toEqual([]);
  });

  it("still uses the radius token, so the guard is not guarding an absence", () => {
    expect(readFileSync(file, "utf8")).toContain("rounded-admin-card");
  });
});
