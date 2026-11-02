// SPDX-License-Identifier: MIT

export type GitHubRepository = { id: number; name: string; full_name: string; description: string | null; default_branch: string; html_url: string };
export type GitHubInstallation = { id: number; account: { login: string } };
export type GitHubInstallationRepositories = { repositories: GitHubRepository[]; total_count: number };
export type GitHubReadme = { name: string; path: string; sha: string; content: string; encoding: "base64" };
export type GitHubRef = { ref: string; object: { sha: string } };
export type GitHubBlob = { sha: string };
export type GitHubTree = { sha: string };
export type GitHubCommit = { sha: string; html_url: string };
export type GitHubPullRequest = { number: number; html_url: string; title: string };

export class GitHubApiError extends Error {
  constructor(readonly status: number, message = "GitHub request failed.") { super(message); this.name = "GitHubApiError"; }
}

type FetchHttp = typeof fetch;
const API = "https://api.github.com";
const timeoutMs = 10_000;

export function createGitHubClient(fetchHttp: FetchHttp, token = process.env.GITHUB_APP_INSTALLATION_TOKEN) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!token?.trim()) throw new GitHubApiError(503, "GitHub integration is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchHttp(`${API}${path}`, { ...init, signal: controller.signal, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
      if (!response.ok) throw new GitHubApiError(response.status);
      return await response.json() as T;
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      throw new GitHubApiError(502);
    } finally { clearTimeout(timeout); }
  }
  const encoded = (value: string) => encodeURIComponent(value);
  return {
    listInstallations: () => request<GitHubInstallation[]>("/user/installations"),
    listInstallationRepositories: () => request<GitHubInstallationRepositories>("/installation/repositories"),
    getRepository: (owner: string, repo: string) => request<GitHubRepository>(`/repos/${encoded(owner)}/${encoded(repo)}`),
    getReadme: (owner: string, repo: string) => request<GitHubReadme>(`/repos/${encoded(owner)}/${encoded(repo)}/readme`),
    patchRepository: (owner: string, repo: string, description: string) => request<GitHubRepository>(`/repos/${encoded(owner)}/${encoded(repo)}`, { method: "PATCH", body: JSON.stringify({ description }) }),
    getRef: (owner: string, repo: string, branch: string) => request<GitHubRef>(`/repos/${encoded(owner)}/${encoded(repo)}/git/ref/heads/${branch.split("/").map(encoded).join("/")}`),
    createBlob: (owner: string, repo: string, content: string) => request<GitHubBlob>(`/repos/${encoded(owner)}/${encoded(repo)}/git/blobs`, { method: "POST", body: JSON.stringify({ content, encoding: "utf-8" }) }),
    createTree: (owner: string, repo: string, baseTree: string, path: string, sha: string) => request<GitHubTree>(`/repos/${encoded(owner)}/${encoded(repo)}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseTree, tree: [{ path, mode: "100644", type: "blob", sha }] }) }),
    createCommit: (owner: string, repo: string, message: string, tree: string, parent: string) => request<GitHubCommit>(`/repos/${encoded(owner)}/${encoded(repo)}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree, parents: [parent] }) }),
    createRef: (owner: string, repo: string, branch: string, sha: string) => request<GitHubRef>(`/repos/${encoded(owner)}/${encoded(repo)}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) }),
    createPullRequest: (owner: string, repo: string, title: string, head: string, base: string, body: string) => request<GitHubPullRequest>(`/repos/${encoded(owner)}/${encoded(repo)}/pulls`, { method: "POST", body: JSON.stringify({ title, head, base, body }) }),
  };
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;
