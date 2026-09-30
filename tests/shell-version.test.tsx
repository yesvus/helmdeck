// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { AdminI18nProvider, HELMDECK_VERSION, type AdminSession } from "@yesvus/helmdeck";
import { ShellClient } from "../fixtures/app/shell/shell-client";
import { sampleNav } from "../fixtures/nav";

/**
 * The shell reports which version of the package is running, on every page rather than on one.
 *
 * The gap this closes is that the version existed in the `VERSION` file, in package.json and in the
 * README, and no program read it: nothing a person could look at said what they were running. The
 * string was never the hard part. The placement is, because a version on a page a person has to go
 * and find is the same as no version at all.
 *
 * `ShellClient` is rendered rather than `AdminShell`, because the wiring is what can be forgotten:
 * a readout component that exists and is never passed to the shell looks exactly like a working one
 * in a diff, and only rendering the shell that mounts it shows whether it reached the screen.
 */

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/shell",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// The sign-out and the permission rule reach the store, which a rendering test has no session for.
// Neither is what is under test here.
vi.mock("../fixtures/app/shell/sign-out-action", () => ({ signOutAction: vi.fn() }));
vi.mock("../fixtures/lib/demo-permissions", () => ({
  demoPermissionsAdapter: () => ({ can: () => true }),
}));

const session: AdminSession = { email: "ada@example.com", name: "Ada Lovelace", role: "admin" };

function renderShell() {
  return render(
    <AdminI18nProvider locale="en">
      <ShellClient nav={sampleNav} session={session} accent="#b45309" siteName="Northstar Supply">
        <p>Page content</p>
      </ShellClient>
    </AdminI18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("the shell naming the version it is running", () => {
  it("shows the version the package exports", () => {
    renderShell();

    // The export, not a literal written beside it: see the test below for why that matters.
    expect(screen.getByText(`v${HELMDECK_VERSION}`)).toBeInTheDocument();
  });

  it("names the package the version belongs to, so a host's own version is not what it reads as", () => {
    renderShell();

    const readout = screen.getByText(`v${HELMDECK_VERSION}`);
    // A host's sidebar is the natural home for that host's version, so a bare number there would be
    // read as the host's. "Helmdeck v0.4.0" answers a different question than "0.4.0" does.
    expect(readout.closest("p")).toHaveTextContent(`Helmdeck v${HELMDECK_VERSION}`);
  });

  it("reads the constant rather than a version written into the demo", () => {
    // The failure this prevents is the one that costs a release: a fixture that hardcodes "0.4.0"
    // keeps rendering it after the next bump, and every test above still passes, because they
    // import the same constant the fixture stopped reading. So the fixtures are scanned rather than
    // trusted, which is what makes this fail on a version somebody pasted in.
    //
    // String literals and JSX text, read off the parsed source rather than off lines of text, so the
    // comments explaining this failure can name the version they are about without being read as
    // having set it.
    const files = [
      "fixtures/app/shell/version-readout.tsx",
      "fixtures/app/shell/shell-client.tsx",
      "fixtures/app/shell/layout.tsx",
    ];
    const literals = files.flatMap((file) => {
      const path = join(process.cwd(), file);
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const found: string[] = [];
      const visit = (node: ts.Node): void => {
        const text =
          ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)
            ? node.text
            : null;
        if (text !== null && /\d+\.\d+\.\d+/.test(text)) {
          found.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      return found;
    });

    expect(literals, "a version written into the demo instead of read from the package").toEqual([]);
  });

  it("is not a link, so reporting the version adds no route to follow", () => {
    renderShell();

    // A sidebar is a list of claims, and `tests/demo-nav-routes.test.ts` holds every entry in it to a
    // page that exists. A version readout has nothing to navigate to, so it must not read as one.
    expect(screen.getByText(`v${HELMDECK_VERSION}`).closest("a")).toBeNull();
  });
});

describe("the shell is still the shell", () => {
  // The readout is markup added to the one component every page renders, so these are the checks
  // that a version string did not cost the shell a landmark, a label or a working collapse.
  it("keeps its navigation and its content region", () => {
    renderShell();

    // The sidebar, not `getByRole("navigation")`: the shell also renders the mobile nav, so the
    // unscoped query finds two and names neither.
    const sidebar = within(screen.getByRole("complementary"));
    expect(sidebar.getByRole("navigation")).toBeInTheDocument();
    expect(sidebar.getAllByRole("link").length).toBeGreaterThan(1);

    // The scrollable content region, matched on having a name rather than on which one: an unnamed
    // region is the accessibility defect this checks for, and pinning the label would fail on an
    // unrelated rename in the nav.
    const region = screen.getByRole("region", { name: /\S/ });
    expect(region).toHaveTextContent("Page content");
  });

  it("hides the readout when the sidebar collapses and brings it back on the way out", async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.getByText(`v${HELMDECK_VERSION}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    // On the brand label's rule: at 76 pixels the number has nowhere to go but over the edge.
    expect(screen.queryByText(`v${HELMDECK_VERSION}`)).toBeNull();
    // The navigation itself survives the collapse, which is what the readout's rule must not break.
    expect(within(screen.getByRole("complementary")).getByRole("navigation")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByText(`v${HELMDECK_VERSION}`)).toBeInTheDocument();
  });
});
