// SPDX-License-Identifier: MIT
import { draftMode } from "next/headers";
import { readPayloadSession } from "../../../lib/session";
import { createPreviewRoute } from "../../../lib/preview";

export const GET = async (request: Request) => createPreviewRoute({
  readSession: readPayloadSession,
  loadPayloadConfig: async () => import("../../../payload.config"),
  enableDraft: async () => { (await draftMode()).enable(); },
  disableDraft: async () => { (await draftMode()).disable(); },
})(request);
