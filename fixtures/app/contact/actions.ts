// SPDX-License-Identifier: MIT
"use server";

import { demoPersistence } from "../../lib/demo-persistence";
import { ensureDemoSeeded } from "../../lib/ensure-seeded";
import { persistContactSubmission } from "../../lib/contact-submission";

export async function submitContactMessage(input: unknown): Promise<void> {
  await ensureDemoSeeded();
  await persistContactSubmission(demoPersistence().adapter, input);
}
