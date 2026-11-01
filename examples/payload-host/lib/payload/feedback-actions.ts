// SPDX-License-Identifier: MIT

"use server";

import { revalidatePath } from "next/cache";
import { payloadInstance } from "./content";
import { readPayloadSession } from "../session";
import { isAdmin, principal } from "../rules";

async function admin() {
  const user = principal(await readPayloadSession());
  if (!isAdmin(user)) throw new Error("Not authorized");
  return user;
}

async function feedbackContent() {
  const user = await admin();
  const payload = await payloadInstance();
  return {
    find: (page: number) => payload.find({ collection: "feedback", overrideAccess: false, user: user as never, limit: 50, page, sort: "-submitted_at", depth: 0 }),
    findByID: (id: string) => payload.findByID({ collection: "feedback", id, overrideAccess: false, user: user as never, depth: 0 }),
    update: (id: string, data: { status: "archived" }) => payload.update({ collection: "feedback", id, data, overrideAccess: false, user: user as never }),
  };
}

export async function listFeedback(page = 1) {
  return (await feedbackContent()).find(page);
}

export async function readFeedback(id: string) {
  return (await feedbackContent()).findByID(id);
}

export async function archiveFeedback(id: string) {
  await (await feedbackContent()).update(id, { status: "archived" });
  revalidatePath("/admin/inbox");
  revalidatePath(`/admin/inbox/${encodeURIComponent(id)}`);
}
