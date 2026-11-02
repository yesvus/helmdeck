// SPDX-License-Identifier: MIT

export type GitHubAuditEntry = { at: string; actor: string; action: string; repository: string; outcome: "completed" | "refused" | "failed" };
const entries: GitHubAuditEntry[] = [];
export function recordGitHubAudit(entry: GitHubAuditEntry): void { entries.unshift({ ...entry }); if (entries.length > 100) entries.length = 100; }
export function listGitHubAudit(): GitHubAuditEntry[] { return entries.map((entry) => ({ ...entry })); }
