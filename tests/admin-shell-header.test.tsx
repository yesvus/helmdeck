// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminPageHeader } from "../src/shell/admin-page-header";
import { AdminShellProvider } from "../src/shell/context";
import type { AdminShellContextValue } from "../src/shell/context";

const shellValue = { currentPageTitle: "Catalog", nav: [] } as AdminShellContextValue;

describe("persistent shell page context", () => {
  it("keeps the shell title and leaves page headers with actions only", () => {
    render(
      <AdminShellProvider value={shellValue}>
        <AdminPageHeader title="Duplicate catalog title" action={<button>Save</button>} />
      </AdminShellProvider>,
    );

    expect(screen.queryByRole("heading", { name: "Duplicate catalog title" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("uses the shared header-height token for shell and page headers", () => {
    const shell = readFileSync(resolve("src/shell/admin-shell.tsx"), "utf8");
    const pageHeader = readFileSync(resolve("src/shell/admin-page-header.tsx"), "utf8");
    const tokens = readFileSync(resolve("src/theme/tokens.css"), "utf8");

    expect(tokens).toContain("--admin-header-height: 4.5rem");
    expect(shell).toContain("min-h-[var(--admin-header-height)]");
    expect(pageHeader).toContain("min-h-[var(--admin-header-height)]");
  });
});
