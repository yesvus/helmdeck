// SPDX-License-Identifier: MIT
import type { MetadataRoute } from "next";
import { listPages } from "@/lib/payload/content";
import { resolveSitemapEntries } from "@/lib/payload/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseURL =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.HELMDECK_BASE_URL?.trim() ||
    "http://localhost:3000";
  const pages = await listPages(1000).catch(() => []);
  return resolveSitemapEntries(pages, null, { baseURL });
}
