// SPDX-License-Identifier: MIT
"use server";

import { demoPersistence } from "../../lib/demo-persistence";
import { ensureDemoSeeded } from "../../lib/ensure-seeded";
import {
  persistContactSubmission,
  validateAndThrottleContactSubmission,
} from "../../lib/contact-submission";

export async function submitContactMessage(input: unknown): Promise<void> {
  const submission = validateAndThrottleContactSubmission(input);
  await ensureDemoSeeded();
  await persistContactSubmission(demoPersistence().adapter, submission);
}
