// SPDX-License-Identifier: MIT

import { AdminPageHeader } from "@yesvus/helmdeck";
import { requireAdminSession } from "@/lib/guard";
import { GitHubClient } from "./github-client";

export default async function GitHubPage() {
  await requireAdminSession({ returnTo: "/admin/github" });
  return <div className="space-y-6"><AdminPageHeader title="GitHub repositories" /><GitHubClient /></div>;
}
