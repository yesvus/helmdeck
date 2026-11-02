// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  createAdminTableSearchAdapter,
  parseAdminTableSearchParams,
  serializeAdminTableSearchParams,
} from "../src/adapters/table-search.js";

describe("createAdminTableSearchAdapter", () => {
  it("parses defaults when the query string is empty", () => {
    const state = parseAdminTableSearchParams("");
    expect(state).toEqual({
      page: 1,
      pageSize: 10,
      sort: null,
      search: "",
      filters: {},
    });
  });

  it("round-trips pagination, sort, search, and filters", () => {
    const params = new URLSearchParams("page=2&pageSize=25&sort=name:desc&search=widget&status=active,pending");
    const state = parseAdminTableSearchParams(params);
    expect(state).toMatchObject({
      page: 2,
      pageSize: 25,
      sort: { field: "name", direction: "desc" },
      search: "widget",
      filters: { status: ["active", "pending"] },
    });
    const serialized = serializeAdminTableSearchParams(state).toString();
    const reparsed = parseAdminTableSearchParams(serialized);
    expect(reparsed).toEqual(state);
  });

  it("reads repeated filter values", () => {
    const state = parseAdminTableSearchParams("tag=a&tag=b&tag=c");
    expect(state.filters).toEqual({ tag: ["a", "b", "c"] });
  });

  it("applies per-key overrides for keys, defaults, and parse/serialize", () => {
    const adapter = createAdminTableSearchAdapter({
      keys: { page: "p", pageSize: "size", sort: "orderBy", search: "q" },
      defaults: { page: 2, pageSize: 5, search: "x" },
    });
    const state = adapter.parse("p=4&size=20&orderBy=price:asc&q=needle&color=red,blue");
    expect(state).toMatchObject({
      page: 4,
      pageSize: 20,
      sort: { field: "price", direction: "asc" },
      search: "needle",
      filters: { color: ["red", "blue"] },
    });
    const serialized = adapter.serialize(state).toString();
    expect(serialized).toContain("p=4");
    expect(serialized).toContain("size=20");
    expect(serialized).toContain("orderBy=price%3Aasc");
    expect(serialized).toContain("q=needle");
    expect(serialized).toContain("color=red%2Cblue");
  });

  it("overrides parse and serialize per concern", () => {
    const adapter = createAdminTableSearchAdapter({
      page: {
        default: 1,
        parse: (value) => Number(value) + 1,
        serialize: (value) => String(Number(value) - 1),
      },
    });
    const state = adapter.parse("page=3");
    expect(state.page).toBe(4);
    expect(adapter.serialize(state).toString()).toBe("page=3");
  });

  it("degrades malformed params to defaults", () => {
    const state = parseAdminTableSearchParams("page=0&pageSize=abc&sort=:desc&search=" + "a".repeat(300) + "&n=, ,");
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(10);
    expect(state.sort).toBeNull();
    expect(state.search).toBe("");
    expect(state.filters.n ?? []).toEqual([]);
  });

  it("omits default values when serializing", () => {
    const state = {
      page: 1,
      pageSize: 10,
      sort: null,
      search: "",
      filters: {},
    };
    expect(serializeAdminTableSearchParams(state).toString()).toBe("");
  });

  it("provides a stateful adapter with setters", () => {
    const adapter = createAdminTableSearchAdapter(new URLSearchParams("page=1"));
    adapter.setPage(3);
    adapter.setSort("title", "asc");
    adapter.setSearch("foo");
    adapter.setFilter("status", ["open", "closed"]);
    expect(adapter.state).toMatchObject({
      page: 3,
      sort: { field: "title", direction: "asc" },
      search: "foo",
      filters: { status: ["open", "closed"] },
    });
    expect(adapter.searchParams.get("page")).toBe("3");
  });

  it("accepts shorthand concern defaults", () => {
    const adapter = createAdminTableSearchAdapter({ pageSize: 50, search: "preset" });
    expect(adapter.defaults.pageSize).toBe(50);
    expect(adapter.defaults.search).toBe("preset");
    expect(adapter.parse("").search).toBe("preset");
  });

  it("filter overrides can rename and default filters", () => {
    const adapter = createAdminTableSearchAdapter({
      filterOverrides: {
        status: { key: "state", default: ["open"] },
      },
    });
    const state = adapter.parse("");
    expect(state.filters.state ?? state.filters.status).toBeDefined();
    const roundtrip = adapter.parse(adapter.serialize(state).toString());
    expect(roundtrip).toEqual(state);
  });
});
