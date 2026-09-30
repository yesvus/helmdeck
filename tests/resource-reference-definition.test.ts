// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  adminResourceFilters,
  adminResourceReference,
  adminResourceValues,
  defineAdminResource,
} from "../src/resources/index";
import { customersResource, ordersResource, productsResource, shipmentsResource } from "../fixtures/lib/admin-resources";

/**
 * What a reference may say, and what a definition with none of it must keep doing.
 *
 * The refusals here are the build failures this vocabulary could otherwise introduce: a declaration
 * that names nothing, a field with two ways to be drawn, a column whose filter disagrees with the
 * column. Each is found at `defineAdminResource` because a host learns more from its own test than
 * from a blank cell in a page.
 */

const root = resolve(import.meta.dirname, "..");

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

function asJson(_key: string, value: unknown): unknown {
  return typeof value === "function" ? { marker: "function" } : value;
}

/** Runs the value through the serialiser the prerender runs, and returns what it refused. */
function crossing(props: unknown): string[] {
  const output = execFileSync(
    process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", ENCODE, JSON.stringify({ props }, asJson)],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(output) as string[];
}

describe("a reference that names a row of another resource", () => {
  it("carries a resource name on its own, which is the whole of what a host has to know", () => {
    // The minimum that lets the server refuse a value naming a row that is not there, and nothing
    // more. `label` is for the targets whose id is not what a person would say, and a host that has
    // to declare it has already looked at the table.
    const definition = defineAdminResource({
      resource: "shipments",
      label: "Shipments",
      columns: [],
      fields: [{ name: "customer_id", label: "Customer", reference: { resource: "customers" } }],
    });
    expect(definition.fields[0].reference).toEqual({ resource: "customers" });
  });

  it("refuses a resource that is not a name, rather than carrying it to a store", () => {
    // Written out rather than derived, because each of these is a different mistake: a name a caller
    // chose, a name with a join in it, a name with a space, and a value that is not a string at all.
    for (const resource of ["", "customers; DROP TABLE users", "customers.rows", "cus tomer", "7customers"]) {
      expect(
        () =>
          defineAdminResource({
            resource: "shipments",
            label: "Shipments",
            columns: [],
            fields: [{ name: "customer_id", label: "Customer", reference: { resource } }],
          }),
        resource,
      ).toThrow(/which is not a resource/);
    }
  });

  it("refuses a label that is not a field", () => {
    expect(() =>
      defineAdminResource({
        resource: "shipments",
        label: "Shipments",
        columns: [],
        fields: [
          { name: "customer_id", label: "Customer", reference: { resource: "customers", label: "1name" } },
        ],
      }),
    ).toThrow(/which is not a field/);
  });

  it("refuses a field, so a value read by id is not declared as something else", () => {
    // Every part of a reference resolves a row through the adapter's `read`, which takes an id and
    // nothing else. A `field` here would be a declaration the choices, the printed row and the write
    // check could not honour without each looking the value up a different way, and the refusal says
    // so rather than carrying a name the code ignores. Cast because the type is the first line of
    // defence and this is the second: a definition reaching the boundary as data gets no check.
    expect(() =>
      defineAdminResource({
        resource: "shipments",
        label: "Shipments",
        columns: [],
        fields: [
          {
            name: "customer_slug",
            label: "Customer",
            reference: { resource: "customers", field: "slug" } as never,
          },
        ],
      }),
    ).toThrow(/A reference names a resource/);
  });

  it("refuses a part it does not know, so a typo in a declaration is not silently ignored", () => {
    expect(() =>
      defineAdminResource({
        resource: "shipments",
        label: "Shipments",
        columns: [],
        fields: [
          { name: "customer_id", label: "Customer", reference: { resource: "customers", lable: "name" } as never },
        ],
      }),
    ).toThrow(/A reference names a/);
  });

  it("refuses a field that is drawn two ways at once", () => {
    // A custom control and a generated one cannot both draw the same field, and a `render` that
    // quietly won would leave a write checked against a choice the form never offered.
    expect(() =>
      defineAdminResource({
        resource: "shipments",
        label: "Shipments",
        columns: [],
        fields: [
          {
            name: "customer_id",
            label: "Customer",
            reference: { resource: "customers" },
            render: () => null,
          },
        ],
      }),
    ).toThrow(/a control and a reference/);
  });

  it("refuses a column that both formats its value and names a row, rather than picking one", () => {
    expect(() =>
      defineAdminResource({
        resource: "shipments",
        label: "Shipments",
        columns: [
          { key: "customer_id", header: "Customer", format: "money", reference: { resource: "customers" } },
        ],
        fields: [],
      }),
    ).toThrow(/both a format/);
  });

  it("refuses a column and a field of one name pointing at different rows", () => {
    // Two halves read by different code: a form would offer the rows of one and a write would be
    // checked against the other, and nothing about the page would say so.
    expect(() =>
      defineAdminResource({
        resource: "shipments",
        label: "Shipments",
        columns: [{ key: "customer_id", header: "Customer", reference: { resource: "customers" } }],
        fields: [{ name: "customer_id", label: "Customer", reference: { resource: "accounts" } }],
      }),
    ).toThrow(/One value names one row/);
  });

  it("refuses a filter that narrows a reference the field does not declare", () => {
    expect(() =>
      defineAdminResource({
        resource: "shipments",
        label: "Shipments",
        columns: [],
        fields: [{ name: "customer_id", label: "Customer", reference: { resource: "customers" } }],
        filters: [{ field: "customer_id", label: "Customer", reference: { resource: "orders" } }],
      }),
    ).toThrow(/which is not what the field points at/);
  });

  it("refuses a filter that writes its own choices beside a reference", () => {
    // The choices are the store's rows, and a list written here is a second answer to the same
    // question that can disagree about which rows exist.
    expect(() =>
      defineAdminResource({
        resource: "shipments",
        label: "Shipments",
        columns: [],
        fields: [{ name: "customer_id", label: "Customer", reference: { resource: "customers" } }],
        filters: [
          {
            field: "customer_id",
            label: "Customer",
            reference: { resource: "customers" },
            options: [{ value: "cus_a", label: "Alpha" }],
          },
        ],
      }),
    ).toThrow(/both options and a reference/);
  });

  it("accepts a field and a column of one name pointing at the same row", () => {
    // The common shape: one declaration stated in both halves, which is what a host writes when a
    // column is drawn and a field is filled.
    expect(() =>
      defineAdminResource({
        resource: "shipments",
        label: "Shipments",
        columns: [{ key: "customer_id", header: "Customer", reference: { resource: "customers", label: "name" } }],
        fields: [
          { name: "customer_id", label: "Customer", reference: { resource: "customers", label: "name" } },
        ],
      }),
    ).not.toThrow();
  });
});

describe("the filters a list draws", () => {
  it("adds one per reference the definition declares no filter for", () => {
    const filters = adminResourceFilters(shipmentsResource);
    // Both of the shipments' reference fields, and neither of its other two, because a filter over a
    // plain text column is a choice the host has to say it wants.
    expect(filters.map((filter) => filter.field)).toEqual(["customer_id", "order_id"]);
    expect(filters.every((filter) => filter.operator === "eq")).toBe(true);
  });

  it("keeps a filter the host declared for a reference field, rather than drawing a second one", () => {
    // One control for the field, and the host's own label and ordering if they want to say it. Two
    // controls narrowing one field is a page with two answers to one question.
    const custom = defineAdminResource({
      resource: "shipments",
      label: "Shipments",
      columns: [],
      fields: [{ name: "customer_id", label: "Customer", reference: { resource: "customers" } }],
      filters: [{ field: "customer_id", label: "Which customer", operator: "ne" }],
    });
    const filters = adminResourceFilters(custom);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toEqual({ field: "customer_id", label: "Which customer", operator: "ne" });
  });

  it("adds nothing for a definition with no reference, so a list reads exactly as it did", () => {
    // The properties file for this work: products and orders declare none, so their filter lists are
    // the arrays the definitions carry and not one more control on their pages.
    expect(adminResourceFilters(productsResource)).toEqual(productsResource.filters);
    expect(adminResourceFilters(ordersResource)).toEqual([]);
    expect(adminResourceFilters(productsResource)).toHaveLength(1);
  });
});

describe("what a definition with no reference anywhere does", () => {
  it("reads its values exactly as before, including a field nothing was submitted for", () => {
    // `adminResourceValues` gained a branch for a reference and a field with none must not reach it,
    // so this is the same reader as ever: an empty text field is an empty string and an absent one is
    // null, which is what the store and the tests on both sides of it expect.
    const form = new FormData();
    form.append("name", "Amber desk lamp");
    form.append("stock", "");
    const values = adminResourceValues(productsResource, form);

    expect(values).toEqual({
      name: "Amber desk lamp",
      sku: null,
      price_cents: null,
      stock: null,
    });
    // A number field still reads a number, and a field the definition does not declare is still
    // dropped, so a hand-edited request cannot add one.
    expect(typeof values.stock).toBe("object");
    form.append("created_at", "2020-01-01");
    expect(adminResourceValues(productsResource, form)).not.toHaveProperty("created_at");
  });

  it("has no reference to read for any of its names", () => {
    for (const definition of [productsResource, ordersResource]) {
      for (const field of definition.fields) {
        expect(adminResourceReference(definition, field.name), `${definition.resource}.${field.name}`).toBeUndefined();
      }
      for (const column of definition.columns) {
        expect(adminResourceReference(definition, column.key), `${definition.resource}.${column.key}`).toBeUndefined();
      }
    }
  });

  it("declares its filters as it did, with none derived and none added", () => {
    expect(productsResource.filters).toEqual([{ field: "sku", label: "SKU contains", operator: "contains" }]);
    expect(ordersResource.filters).toBeUndefined();
  });
});

describe("the demo's two resources that gained no reference", () => {
  it("still cross the client boundary as data, and the two that gained one do too", () => {
    // A reference is two strings, so it crosses like the rest of a definition. This is the same
    // serialiser `definition-boundary.test.ts` runs, over the real objects the real pages hand down,
    // because a reference that could not cross would be a client page per resource rather than a
    // server one.
    expect(crossing(productsResource)).toEqual([]);
    expect(crossing(ordersResource)).toEqual([]);
    expect(crossing(customersResource)).toEqual([]);
    expect(crossing(shipmentsResource)).toEqual([]);
  }, 30_000);

  it("gives the shipments list a filter for each of its two references, and no others", () => {
    // Tracking and status are plain text, so a filter over them is a choice the demo has not asked
    // for and the list does not draw.
    const filters = adminResourceFilters(shipmentsResource);
    expect(filters).toHaveLength(2);
    expect(filters.map((filter) => filter.field)).not.toContain("tracking");
    expect(filters.map((filter) => filter.field)).not.toContain("status");
  });
});
