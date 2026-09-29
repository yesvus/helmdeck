// SPDX-License-Identifier: MIT
"use client";

import { AdminResourceList } from "@yesvus/helmdeck";
import { contentPosts } from "./content-registry";
import { contentPersistence } from "./content-persistence";

/**
 * Posts, generated from the definition and read from the store.
 *
 * The columns, the empty state, the new-post link and the row controls come from the definition, and
 * the rows come from the store through the content actions. Nothing on this page is a literal, which
 * is the point: a table over a hardcoded array is what put a count of 128 on the page once, over a
 * catalogue of five, and nothing about that was visible from outside.
 *
 * A client component because `AdminResourceList` reads through its adapter from an effect, and the
 * adapter is a set of server actions. A server component cannot pass that object down: functions do
 * not cross the boundary, so the page has to be on the same side as the adapter.
 */
export default function ContentPage() {
  return (
    <AdminResourceList
      definition={contentPosts}
      persistence={contentPersistence}
      detailBaseHref="/shell/content"
    />
  );
}
