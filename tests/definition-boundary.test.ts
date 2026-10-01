// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defineAdminResource, type AdminResourceDefinition } from "../src/resources/index";
import { contentPosts } from "../fixtures/app/(helmdeck)/shell/content/content-registry";
import { ordersResource, productsResource } from "../fixtures/lib/admin-resources";

/**
 * Whether a definition can be handed from a server component to the list that renders it.
 *
 * The failure this file exists for was invisible to every other test, to all three typechecks and to
 * a clean lint, and appeared only in `next build`: `Error occurred prerendering page "/shell/orders"`,
 * a function in a column. So this is not a check on the shape of a definition. It runs the value
 * through the same serialiser the prerender runs, in a child process started with the `react-server`
 * condition, because that is the operation that fails. Asserting that a column's `format` is not a
 * function would pass just as happily against a value the encoder refuses, which is the whole of
 * what went wrong.
 */

const root = resolve(import.meta.dirname, "..");

/**
 * The React Server Components serialiser, as `next build` uses it.
 *
 * The `react-server` condition is what selects it. Without it the module refuses to load with a
 * message about the environment rather than about the value under test, which would be a test passing
 * for the wrong reason.
 */
const ENCODE = `
const { renderToReadableStream } = await import("next/dist/compiled/react-server-dom-webpack/server.edge.js");
const { props } = JSON.parse(process.argv[1]);

function rebuild(node) {
  if (Array.isArray(node)) return node.map(rebuild);
  if (node !== null && typeof node === "object") {
    if (node.marker === "function") return (value) => String(value);
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, rebuild(value)]));
  }
  return node;
}

const errors = [];
const stream = renderToReadableStream(rebuild(props), {}, {
  onError: (error) => {
    errors.push(String(error && error.message ? error.message : error).split("\\n")[0]);
    return "digest";
  },
});
await new Response(stream).text();
process.stdout.write(JSON.stringify(errors));
`;

/**
 * A function cannot be sent through `JSON.stringify` to reach the child, and it is dropped silently
 * rather than refused, so the one this replacer meets becomes a marker the child rebuilds a real
 * function from. Applied to every value including the demo's own definitions, because a replacer used
 * only on the values written out by hand would let a function reintroduced into a fixture vanish here
 * exactly as it does in JSON, and this file would pass on the very definition it exists to police.
 */
function asJson(_key: string, value: unknown): unknown {
  return typeof value === "function" ? { marker: "function" } : value;
}

/** Runs the value through the serialiser and returns what it refused, if anything. */
function crossing(props: unknown): string[] {
  const output = execFileSync(
    process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", ENCODE, JSON.stringify({ props }, asJson)],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(output) as string[];
}

/** A definition carrying a function in one of the three places the type allows one. */
function definitionWith(where: "column" | "field" | "filter"): AdminResourceDefinition {
  const code = (value: unknown) => String(value);
  return defineAdminResource({
    resource: "orders",
    label: "Orders",
    columns:
      where === "column"
        ? [{ key: "total_cents", header: "Total", format: code as never }]
        : [{ key: "total_cents", header: "Total" }],
    fields: where === "field" ? [{ name: "status", label: "Status", render: code }] : [{ name: "status", label: "Status" }],
    ...(where === "filter" ? { filters: [{ field: "status", label: "Status", parse: code }] } : {}),
  });
}

describe("a definition the list is handed from a server component", () => {
  it("crosses for the products and orders the two list pages render", () => {
    // The two pages that failed are server components, and each passes one of these down. A function
    // anywhere in either is a prerender error, so this is asserted over the real objects the real
    // pages import rather than over copies of them.
    expect(crossing(productsResource)).toEqual([]);
    expect(crossing(ordersResource)).toEqual([]);
  });

  it("crosses for a column that names a format the host registered, and one the package ships", () => {
    // A name and nothing else, in both directions: a host's own and the package's `money`, which is
    // the demo's money column. The point of the change is that the code moved to the client
    // component, so what crosses here is a promise the other half keeps.
    const definition = defineAdminResource({
      resource: "orders",
      label: "Orders",
      columns: [
        { key: "total_cents", header: "Total", format: "money" },
        { key: "status", header: "Status", format: { name: "status" } },
      ],
      fields: [{ name: "customer", label: "Customer" }],
    });
    expect(crossing(definition)).toEqual([]);
  });

  it("does not cross for the content posts, because their form declares a custom control", () => {
    // The third of the three pages, and the honest limit of the change. Its columns are names now
    // like the other two, but its status field declares a `render` for a select the primitives do
    // not have, and a custom control is not expressible as a name. So the definition still carries a
    // function, still cannot cross, and its page is a client component for that reason as well as for
    // the adapter. Pinned so a host reading this learns which is which: naming the formats made the
    // columns crossable and did not make this definition crossable.
    const refusals = crossing(contentPosts);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatch(/Functions cannot be passed directly to Client Components/);

    // And what it carries is the field, not the columns, so this pair is not one case twice. Take the
    // field's render away and the same definition crosses.
    const withoutRender = { ...contentPosts, fields: contentPosts.fields.map((field) => ({ ...field, render: undefined })) };
    expect(crossing(withoutRender)).toEqual([]);
  });

  it("is refused when a column carries a function, which is the build failure", () => {
    // Pinned because the check has to be capable of failing. A boundary test that cannot refuse
    // anything is a test that cannot catch the thing it was written for, and the rebuild in the child
    // is what makes this case a real function rather than a description of one. The column is cast,
    // because the type no longer permits this, and the point is that the type is not what stops it.
    const refusals = crossing(definitionWith("column"));
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatch(/Functions cannot be passed directly to Client Components/);
  });

  it("is refused for a field's render and a filter's parse, the two the type still allows", () => {
    // These are named in the docs as code that cannot cross, and this is the evidence. They stay
    // functions because a custom control and a custom comparison are not expressible as a name, so a
    // definition declaring either has to be built on the side that renders it. A host that put one
    // here and rendered from a server component gets exactly this, which is why the message is the
    // same one rather than a clearer one.
    for (const where of ["field", "filter"] as const) {
      const refusals = crossing(definitionWith(where));
      expect(refusals, `a function in a ${where}`).toHaveLength(1);
      expect(refusals[0]).toMatch(/Functions cannot be passed directly to Client Components/);
    }
  });
});
