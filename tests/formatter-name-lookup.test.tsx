// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { AdminResourceList, type AdminResourceDefinition } from "@yesvus/helmdeck";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";

/**
 * A column's `format` is a name, and a name a host chooses can be anything.
 *
 * The lookup used to be a plain property access, so `toString`, `constructor`, `valueOf` and the
 * rest of Object.prototype all resolved — and they are functions, so the "nothing answers" refusal
 * passed and the column rendered the prototype's output instead. A host who named a column
 * `toString` got a table of `[object Object]` and no error at all, which is the worst of both: it
 * looks like a formatting choice rather than a lookup that never found what it wanted.
 */
const inherited = ["toString", "constructor", "valueOf", "hasOwnProperty", "isPrototypeOf", "__proto__", "__defineGetter__", "toLocaleString"];

function definitionNaming(name: string): AdminResourceDefinition {
  return {
    resource: "items",
    label: "Items",
    columns: [{ key: "n", header: "Number", format: { name } }],
  } as unknown as AdminResourceDefinition;
}

function money(value: unknown): string {
  return `$${String(value)}`;
}

/** The one cell the definition declares, once the list has loaded its rows. */
async function theCell(): Promise<string> {
  return await waitFor(() => {
    const table = screen.getByRole("table");
    const row = within(table).getAllByRole("row")[1];
    const cell = within(row).getAllByRole("cell")[0];
    if (cell.textContent === undefined) throw new Error("no cell yet");
    return cell.textContent;
  });
}

describe("naming a column's format after something inherited", () => {
  it("refuses every name that only exists on Object.prototype", async () => {
    const rendered: string[] = [];
    const refused: string[] = [];

    for (const name of inherited) {
      // One list at a time: eight of them share a document, and a second table is its own error.
      cleanup();
      const adapter = createMemoryPersistenceAdapter();
      await adapter.create("items", { id: "1", n: 500 });
      try {
        render(
          <AdminResourceList definition={definitionNaming(name)} persistence={adapter} formatters={{ money }} />,
        );
        rendered.push(`${name} rendered as ${JSON.stringify(await theCell())}`);
      } catch (error) {
        refused.push(name);
        if (String(error).match(/nothing answers/) === null) {
          throw new Error(`${name} was refused, but not for the right reason`, { cause: error });
        }
      }
    }

    // Each is a name no host registered, so each is the "nothing answers" case. A host that named a
    // column `toString` used to get a table of `[object Object]` and no error at all.
    expect(rendered).toEqual([]);
    expect(refused.sort()).toEqual([...inherited].sort());
  });

  it("still answers a name the host really did register", async () => {
    cleanup();
    const adapter = createMemoryPersistenceAdapter();
    await adapter.create("items", { id: "1", n: 500 });

    render(
      <AdminResourceList definition={definitionNaming("money")} persistence={adapter} formatters={{ money }} />,
    );

    expect(await theCell()).toBe("$500");
  });

  it("still answers the two the package ships, and a host's own wins over nothing", async () => {
    cleanup();
    const adapter = createMemoryPersistenceAdapter();
    await adapter.create("items", { id: "1", n: 500 });

    render(<AdminResourceList definition={definitionNaming("count")} persistence={adapter} formatters={{}} />);
    expect(await theCell()).toBe("500");
  });

  it("lets a host override a shipped name, which is the point of a name", async () => {
    cleanup();
    const adapter = createMemoryPersistenceAdapter();
    await adapter.create("items", { id: "1", n: 500 });

    render(
      <AdminResourceList
        definition={definitionNaming("count")}
        persistence={adapter}
        formatters={{ count: (value) => `${String(value)} units` }}
      />,
    );

    expect(await theCell()).toBe("500 units");
  });
});
