// SPDX-License-Identifier: MIT
import { draftMode } from "next/headers";
import { createExitPreviewRoute } from "../../../lib/preview";

export const GET = async (request: Request) => createExitPreviewRoute({
  disableDraft: async () => { (await draftMode()).disable(); },
})(request);
