// SPDX-License-Identifier: MIT
/**
 * SEO helpers for Payload pages in the host.
 *
 * Maps a Payload page document plus the `siteSettings` global into a Next.js `Metadata` object
 * (for `generateMetadata`) and into `MetadataRoute.Sitemap` entries (for `app/sitemap.ts`),
 * excluding unpublished drafts. Kept example-side: the shape of a page and its settings is the
 * host's, not the package's.
 */

import type { Metadata, MetadataRoute } from "next";

export type SeoPage = {
  id?: string | number | null;
  title?: string | null;
  slug?: string | null;
  summary?: string | null;
  updatedAt?: string | Date | null;
  _status?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  ogImage?: unknown;
};

export type SeoSiteSettings = {
  name?: string | null;
  siteName?: string | null;
  site_name?: string | null;
  description?: string | null;
  siteDescription?: string | null;
  site_description?: string | null;
  seoDescription?: string | null;
  seoTitle?: string | null;
};

export type ResolvePageMetadataOptions = { baseURL: string };

export type ResolveSitemapEntriesOptions = { baseURL: string };

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function isValidCanonicalUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeBase(baseURL: string): string {
  const trimmed = (baseURL ?? "").trim();
  return trimmed.replace(/\/+$/, "");
}

function pagePath(page: SeoPage): string {
  const slug = nonEmptyString(page.slug);
  if (!slug) return "/";
  const clean = slug.replace(/^\/+/, "");
  return clean ? `/${clean}` : "/";
}

function resolveMediaUrl(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "object" && value !== null) {
    const url = (value as { url?: unknown }).url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) return trimmed;
  }
  return undefined;
}

function settingsTitle(settings: SeoSiteSettings | null | undefined): string | undefined {
  if (!settings) return undefined;
  return (
    nonEmptyString(settings.seoTitle) ??
    nonEmptyString(settings.siteName) ??
    nonEmptyString(settings.site_name) ??
    nonEmptyString(settings.name)
  );
}

function settingsDescription(settings: SeoSiteSettings | null | undefined): string | undefined {
  if (!settings) return undefined;
  return (
    nonEmptyString(settings.seoDescription) ??
    nonEmptyString(settings.siteDescription) ??
    nonEmptyString(settings.site_description) ??
    nonEmptyString(settings.description)
  );
}

export function resolvePageMetadata(
  page: SeoPage,
  settings: SeoSiteSettings | null | undefined,
  options: ResolvePageMetadataOptions,
): Metadata {
  const baseURL = options?.baseURL ?? "";
  const base = normalizeBase(baseURL);

  const title =
    nonEmptyString(page.seoTitle) ??
    nonEmptyString(page.title) ??
    settingsTitle(settings);

  const description =
    nonEmptyString(page.seoDescription) ??
    nonEmptyString(page.summary) ??
    settingsDescription(settings);

  const explicitCanonical = nonEmptyString(page.canonicalUrl);
  const canonical =
    explicitCanonical && isValidCanonicalUrl(explicitCanonical)
      ? explicitCanonical
      : `${base}${pagePath(page)}`;

  const ogImage = resolveMediaUrl(page.ogImage);
  const images = ogImage ? [ogImage] : undefined;

  const isDraft = page._status === "draft";

  const metadata: Metadata = {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      images,
    },
    robots: { index: !isDraft, follow: !isDraft },
  };

  return metadata;
}

export function resolveSitemapEntries(
  pages: SeoPage[] | null | undefined,
  settings: SeoSiteSettings | null | undefined,
  options: ResolveSitemapEntriesOptions,
): MetadataRoute.Sitemap {
  const base = normalizeBase(options?.baseURL ?? "");
  const entries: MetadataRoute.Sitemap = [];
  for (const page of pages ?? []) {
    if (!page || page._status !== "published") continue;
    const url = `${base}${pagePath(page)}`;
    const lastModified =
      page.updatedAt instanceof Date
        ? page.updatedAt
        : nonEmptyString(page.updatedAt) ?? undefined;
    entries.push({ url, lastModified });
  }
  return entries;
}