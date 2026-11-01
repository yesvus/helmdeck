// SPDX-License-Identifier: MIT

import { payloadInstance } from "./content";
import { readPayloadSession } from "../session";
import { assertBlogDraftAccess } from "./blog-access";

export async function readBlogPosts(draft = false) {
  const user = await readPayloadSession();
  if (draft) assertBlogDraftAccess(user);
  const payload = await payloadInstance();
  return payload.find({
    collection: "posts",
    where: draft ? undefined : { status: { equals: "published" } },
    sort: "-publishedAt",
    depth: 2,
    limit: 100,
    draft,
    overrideAccess: false,
    user: user ?? undefined,
  });
}

export { assertBlogDraftAccess } from "./blog-access";

export async function readBlogPost(slug: string, draft = false) {
  const posts = await readBlogPosts(draft);
  return posts.docs.find((post) => post.slug === slug) ?? null;
}
