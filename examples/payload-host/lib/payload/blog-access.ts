// SPDX-License-Identifier: MIT

import { AdminPayloadAccessRefused } from "@yesvus/helmdeck";
import { isAdmin, principal } from "../rules";

export function assertBlogDraftAccess(user: unknown): void {
  if (!isAdmin(principal(user))) throw new AdminPayloadAccessRefused("find");
}
