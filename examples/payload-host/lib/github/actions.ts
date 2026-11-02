// SPDX-License-Identifier: MIT

import { GitHubApiError, createGitHubClient, type GitHubClient, type GitHubRepository } from "./client";
import { recordGitHubAudit } from "./audit";

export const MAX_README_BYTES = 512 * 1024;
export type GitHubAccessRefused = { kind: "refused"; message: string };
export type RepositoryEdit = { description?: string; readme?: string };
export class GitHubAccessRefusedError extends Error { constructor(message = "Repository is not authorized for this installation.") { super(message); this.name = "GitHubAccessRefused"; } }
type Session = { id?: string | number; email?: string; role?: unknown } | null;
type ActionsDependencies = { fetchHttp: typeof fetch; sessionResolver: () => Promise<Session>; client?: GitHubClient };

export function createGitHubActions({ fetchHttp, sessionResolver, client = createGitHubClient(fetchHttp) }: ActionsDependencies) {
  async function authorizedRepositories() {
    const session = await sessionResolver();
    if (!session || session.role !== "admin") throw new GitHubAccessRefusedError("Administrator access is required.");
    return { session, repositories: (await client.listInstallationRepositories()).repositories };
  }
  async function repository(name: string): Promise<{ session: NonNullable<Session>; repo: GitHubRepository }> {
    const { session, repositories } = await authorizedRepositories();
    const repo = repositories.find((candidate) => candidate.full_name.toLowerCase() === name.toLowerCase());
    if (!repo) throw new GitHubAccessRefusedError();
    return { session: session!, repo };
  }
  function audit(actor: Session, action: string, name: string, outcome: "completed" | "refused" | "failed") {
    recordGitHubAudit({ at: new Date().toISOString(), actor: String(actor?.id ?? "unknown"), action, repository: name, outcome });
  }
  return {
    async listAuthorizedRepositories() {
      const { session, repositories } = await authorizedRepositories();
      audit(session, "list-repositories", "*", "completed");
      return repositories.map(({ full_name, description, default_branch, html_url }) => ({ full_name, description, default_branch, html_url }));
    },
    async readRepository(name: string) {
      const { session, repo } = await repository(name);
      const readme = await client.getReadme(...repo.full_name.split("/", 2) as [string, string]);
      const content = Buffer.from(readme.content.replace(/\n/g, ""), "base64").toString("utf8");
      if (Buffer.byteLength(content, "utf8") > MAX_README_BYTES) { audit(session, "read-repository", name, "refused"); throw new GitHubAccessRefusedError("README exceeds the 512 KB limit."); }
      audit(session, "read-repository", name, "completed");
      return { repository: repo, readme: content };
    },
    async previewRepositoryEdit(name: string, patch: RepositoryEdit) {
      const { session } = await repository(name);
      if (patch.readme !== undefined && Buffer.byteLength(patch.readme, "utf8") > MAX_README_BYTES) { audit(session, "preview-edit", name, "refused"); throw new GitHubAccessRefusedError("README exceeds the 512 KB limit."); }
      if (patch.description !== undefined && patch.description.length > 350) throw new GitHubAccessRefusedError("Description exceeds the 350 character limit.");
      audit(session, "preview-edit", name, "completed");
      return { repository: name, description: patch.description, readme: patch.readme, publishRequired: true as const };
    },
    async publishRepositoryEdit(name: string, patch: RepositoryEdit, metadata: { branchName: string; commitMessage: string; prTitle: string }) {
      const { session, repo } = await repository(name);
      if (!patch.readme || Buffer.byteLength(patch.readme, "utf8") > MAX_README_BYTES) { audit(session, "publish-edit", name, "refused"); throw new GitHubAccessRefusedError("README must be present and no larger than 512 KB."); }
      if (patch.description !== undefined && patch.description.length > 350) throw new GitHubAccessRefusedError("Description exceeds the 350 character limit.");
      if (!/^[a-zA-Z0-9._/-]{1,120}$/.test(metadata.branchName) || metadata.branchName.startsWith("/") || metadata.branchName.includes("..")) throw new GitHubAccessRefusedError("Invalid branch name.");
      const [owner, repoName] = repo.full_name.split("/", 2);
      try {
        const readme = await client.getReadme(owner!, repoName!);
        const parentRef = await client.getRef(owner!, repoName!, repo.default_branch);
        const blob = await client.createBlob(owner!, repoName!, patch.readme);
        const tree = await client.createTree(owner!, repoName!, parentRef.object.sha, readme.path, blob.sha);
        const commit = await client.createCommit(owner!, repoName!, metadata.commitMessage, tree.sha, parentRef.object.sha);
        await client.createRef(owner!, repoName!, metadata.branchName, commit.sha);
        if (patch.description !== undefined) await client.patchRepository(owner!, repoName!, patch.description);
        const pr = await client.createPullRequest(owner!, repoName!, metadata.prTitle, metadata.branchName, repo.default_branch, "Proposed by the Payload host GitHub integration.");
        audit(session, "publish-edit", name, "completed");
        return { pullRequest: pr.html_url, number: pr.number };
      } catch (error) {
        audit(session, "publish-edit", name, error instanceof GitHubAccessRefusedError ? "refused" : "failed");
        if (error instanceof GitHubApiError || error instanceof GitHubAccessRefusedError) throw error;
        throw new GitHubApiError(502);
      }
    },
  };
}
