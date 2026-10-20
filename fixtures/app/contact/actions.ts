// SPDX-License-Identifier: MIT
"use server";

import { demoPersistence } from "../../lib/demo-persistence";
import { ensureDemoSeeded } from "../../lib/ensure-seeded";
import { allowContactSubmission, persistContactSubmission } from "../../lib/contact-submission";

export async function submitContactMessage(input: unknown): Promise<void> {
  allowContactSubmission();
  await ensureDemoSeeded();
  await persistContactSubmission(demoPersistence().adapter, input);
}
