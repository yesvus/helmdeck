// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { adminResourceValuesFromRecord, defineAdminResource } from "../src/resources/registry";

const definition = defineAdminResource({
  resource: "articles",
  label: "Articles",
  columns: [],
  fields: [
    { name: "title", label: "Title", required: true },
    { name: "body", label: "Body" },
    { name: "published", label: "Published", type: "checkbox" },
  ],
});

describe("adminResourceValuesFromRecord", () => {
  it("copies only declared own properties and keeps omitted fields absent", () => {
    const values = adminResourceValuesFromRecord(definition, {
      title: "A title",
      published: false,
      ignored: "not declared",
    });

    expect(values).toEqual({ title: "A title", published: false });
    expect(Object.hasOwn(values, "body")).toBe(false);
    expect(Object.hasOwn(values, "published")).toBe(true);
  });

  it("preserves explicit cleared values and does not read inherited properties", () => {
    const input = Object.assign(Object.create({ title: "inherited" }), {
      body: null,
      published: false,
    });

    expect(adminResourceValuesFromRecord(definition, input)).toEqual({
      body: null,
      published: false,
    });
  });

  it.each([null, undefined, [], "text", 5])("refuses non-object input: %j", (value) => {
    expect(() => adminResourceValuesFromRecord(definition, value)).toThrow("A resource value must be an object");
  });
});
