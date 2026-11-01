// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { Categories } from "../examples/payload-host/lib/payload/categories";
import { Posts, publishedPostsRead } from "../examples/payload-host/lib/payload/posts";
import { blogRouteMatches } from "../examples/payload-host/lib/payload/routes";
import { assertBlogDraftAccess } from "../examples/payload-host/lib/payload/blog-access";

describe("Payload blog starter", () => {
  it("declares unique required post slugs, draft status and category relations", () => {
    const fields = Posts.fields as Array<{ name?: string; [key: string]: unknown }>;
    const slug = fields.find((field) => field.name === "slug")!;
    const status = fields.find((field) => field.name === "status")!;
    const categories = fields.find((field) => field.name === "categories")!;
    expect(slug).toMatchObject({ required: true, unique: true });
    expect(status).toMatchObject({ type: "select", required: true, defaultValue: "draft", options: ["draft", "published"] });
    expect(categories).toMatchObject({ type: "relationship", relationTo: "categories", hasMany: true });
    expect((Categories.fields as Array<{ name?: string; [key: string]: unknown }>).find((field) => field.name === "slug")).toMatchObject({ required: true, unique: true });
  });

  it("filters public reads, denies public writes, and allows administrator operations", async () => {
    expect(await publishedPostsRead({ req: { user: null } } as never)).toEqual({ status: { equals: "published" } });
    expect(await Posts.access!.create!({ req: { user: null } } as never)).toBe(false);
    expect(await Posts.access!.create!({ req: { user: { id: "a", role: "admin" } } } as never)).toBe(true);
    expect(await publishedPostsRead({ req: { user: { id: "a", role: "admin" } } } as never)).toBe(true);
  });

  it("does not match blog routes when the route is disabled", () => {
    expect(blogRouteMatches("/blog", "")).toBe(false);
    expect(blogRouteMatches("/blog/story", undefined)).toBe(false);
    expect(blogRouteMatches("/journal/story", "/journal")).toBe(true);
  });

  it("refuses draft reads without an administrator session", () => {
    expect(() => assertBlogDraftAccess(null)).toThrow();
    expect(() => assertBlogDraftAccess({ id: "e", role: "editor" })).toThrow();
    expect(() => assertBlogDraftAccess({ id: "a", role: "admin" })).not.toThrow();
  });
});
