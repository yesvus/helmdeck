// SPDX-License-Identifier: MIT
import { AdminPageHeader } from "@yesvus/helmdeck";
import { AssistantClient } from "./assistant-client";
import { requireAdminSession } from "@/lib/guard";

export default async function AssistantPage() {
  await requireAdminSession({ returnTo: "/admin/assistant" });
  return <div className="space-y-6"><AdminPageHeader title="Assistant" /><AssistantClient /></div>;
}
