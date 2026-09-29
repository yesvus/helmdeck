// SPDX-License-Identifier: MIT
"use client";

import { AdminResourceList, type AdminResourceDefinition } from "@yesvus/helmdeck";
import { clientPersistence, pagedClientPersistence } from "../lib/client-persistence";

/**
 * The generated list, on the client, over whichever adapter the demo's store can answer.
 *
 * `paged` is decided on the server and passed in, because that is the only side that knows what the
 * demo's store is. A generated list reads the shape of the adapter it was handed rather than being
 * told whether it may search, and the two are the same question: an adapter with no `queryPage` gets
 * no search box, no sortable headers, no filter controls and no pager, and sees the list it saw
 * before. Passing the flag down is what keeps those two from disagreeing, since a flag the client
 * guessed would put a search box over a store that cannot search.
 */
export function DemoResourceList({
  definition,
  detailBaseHref,
  paged,
}: {
  definition: AdminResourceDefinition;
  detailBaseHref: string;
  paged: boolean;
}) {
  return (
    <AdminResourceList
      definition={definition}
      persistence={paged ? pagedClientPersistence : clientPersistence}
      detailBaseHref={detailBaseHref}
    />
  );
}
