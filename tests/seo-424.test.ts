// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { Pages } from "../examples/payload-host/lib/payload/collections";
import {
  resolvePageMetadata,
  resolveSitemapEntries,
  isValidCanonicalUrl,
} from "../examples/payload-host/lib/payload/seo";

describe("seo #424 canonical validation", () => {
  it("accepts absolute urls and paths", () => {
    expect(isValidCanonicalUrl("https://example.com/x")).toBe(true);
    expect(isValidCanonicalUrl("/about")).toBe(true);
  });
  it("rejects invalid values", () => {
    expect(isValidCanonicalUrl("not a url")).toBe(false);
    expect(isValidCanonicalUrl("")).toBe(false);
    expect(isValidCanonicalUrl(null)).toBe(false);
  });
  it("collection field rejects invalid canonical", async () => {
    const field = (Pages.fields as Array<{ name?: string; validate?: (v: unknown) => unknown }>).find((f) => f.name === "canonicalUrl");
    expect(field).toBeTruthy();
    expect(await (field!.validate as (v: unknown) => unknown)("bad")).not.toBe(true);
    expect(await (field!.validate as (v: unknown) => unknown)("/ok")).toBe(true);
  });
});

describe("seo #424 resolvePageMetadata", () => {
  const base = "https://example.com";
  const settings = { name: "Site Name", description: "Site desc" };

  it("uses seoTitle and seoDescription when present", () => {
    const meta = resolvePageMetadata(
      { title: "Page", slug: "about", seoTitle: "SEO Title", seoDescription: "SEO Desc", summary: "sum" },
      settings,
      { baseURL: base },
    );
    expect(meta.title).toBe("SEO Title");
    expect(meta.description).toBe("SEO Desc");
  });

  it("falls back title to page.title then settings name", () => {
    const meta = resolvePageMetadata({ title: "Page Title", slug: "about" }, settings, { baseURL: base });
    expect(meta.title).toBe("Page Title");
    const meta2 = resolvePageMetadata({ title: null, slug: "about" }, settings, { baseURL: base });
    expect(meta2.title).toBe("Site Name");
  });

  it("falls back description to summary then settings", () => {
    const meta = resolvePageMetadata({ title: "T", slug: "about", summary: "Summary text" }, settings, { baseURL: base });
    expect(meta.description).toBe("Summary text");
    const meta2 = resolvePageMetadata({ title: "T", slug: "about" }, settings, { baseURL: base });
    expect(meta2.description).toBe("Site desc");
  });

  it("derives canonical from baseURL + slug", () => {
    const meta = resolvePageMetadata({ title: "T", slug: "about" }, settings, { baseURL: base });
    expect(meta.alternates?.canonical).toBe("https://example.com/about");
  });

  it("uses explicit canonicalUrl when valid", () => {
    const meta = resolvePageMetadata({ title: "T", slug: "about", canonicalUrl: "https://other.com/x" }, settings, { baseURL: base });
    expect(meta.alternates?.canonical).toBe("https://other.com/x");
  });

  it("ignores invalid canonicalUrl and falls back", () => {
    const meta = resolvePageMetadata({ title: "T", slug: "about", canonicalUrl: "not a url" }, settings, { baseURL: base });
    expect(meta.alternates?.canonical).toBe("https://example.com/about");
  });

  it("resolves ogImage media relationship to url", () => {
    const meta = resolvePageMetadata(
      { title: "T", slug: "about", ogImage: { url: "https://cdn.example/og.png", alt: "og" } },
      settings,
      { baseURL: base },
    );
    expect(meta.openGraph?.images).toEqual(["https://cdn.example/og.png"]);
  });

  it("marks drafts noindex", () => {
    const meta = resolvePageMetadata({ title: "T", slug: "about", _status: "draft" }, settings, { baseURL: base });
    expect((meta.robots as { index?: boolean })?.index).toBe(false);
  });
});

describe("seo #424 resolveSitemapEntries", () => {
  const base = "https://example.com";
  it("excludes drafts and joins urls", () => {
    const entries = resolveSitemapEntries(
      [
        { title: "A", slug: "a", _status: "published", updatedAt: "2026-01-01T00:00:00.000Z" },
        { title: "B", slug: "b", _status: "draft", updatedAt: "2026-02-02T00:00:00.000Z" },
      ],
      null,
      { baseURL: base },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe("https://example.com/a");
    expect(entries[0].lastModified).toBe("2026-01-01T00:00:00.000Z");
  });
});