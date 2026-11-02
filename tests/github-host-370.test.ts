// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { createGitHubActions, GitHubAccessRefusedError } from "../examples/payload-host/lib/github/actions";
import { createGitHubRoute } from "../examples/payload-host/app/api/github/route";
import { GitHubApiError, type GitHubClient } from "../examples/payload-host/lib/github/client";
import { listGitHubAudit } from "../examples/payload-host/lib/github/audit";

const repo = { id: 4, name: "site", full_name: "owner/site", description: "old", default_branch: "main", html_url: "https://github.com/owner/site" };
function client(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    listInstallations: vi.fn(async () => []), listInstallationRepositories: vi.fn(async () => ({ repositories: [repo], total_count: 1 })), getRepository: vi.fn(async () => repo),
    getReadme: vi.fn(async () => ({ name: "README.md", path: "README.md", sha: "readme", content: Buffer.from("old text").toString("base64"), encoding: "base64" as const })),
    patchRepository: vi.fn(async () => repo), getRef: vi.fn(async () => ({ ref: "refs/heads/main", object: { sha: "parent" } })),
    createBlob: vi.fn(async () => ({ sha: "blob" })), createTree: vi.fn(async () => ({ sha: "tree" })), createCommit: vi.fn(async () => ({ sha: "commit", html_url: "" })),
    createRef: vi.fn(async () => ({ ref: "refs/heads/branch", object: { sha: "commit" } })), createPullRequest: vi.fn(async () => ({ number: 12, html_url: "https://github.com/owner/site/pull/12", title: "Update" })),
    ...overrides,
  };
}
const admin = async () => ({ id: "admin", role: "admin" });

describe("GitHub host integration #370", () => {
  it("denies anonymous requests before any GitHub fetch", async () => {
    const fetchHttp = vi.fn();
    const route = createGitHubRoute({ readSession: async () => null, fetchHttp });
    expect((await route.GET(new Request("http://localhost/api/github"))).status).toBe(401);
    expect(fetchHttp).not.toHaveBeenCalled();
  });

  it("refuses a repository outside the installation list without writes", async () => {
    const api = client();
    const actions = createGitHubActions({ fetchHttp: vi.fn(), sessionResolver: admin, client: api });
    await expect(actions.previewRepositoryEdit("owner/other", { readme: "text" })).rejects.toBeInstanceOf(GitHubAccessRefusedError);
    expect(api.getReadme).not.toHaveBeenCalled();
    expect(api.createBlob).not.toHaveBeenCalled();
    expect(api.createRef).not.toHaveBeenCalled();
    expect(api.createPullRequest).not.toHaveBeenCalled();
  });

  it("refuses oversized README content before publication", async () => {
    const api = client();
    const actions = createGitHubActions({ fetchHttp: vi.fn(), sessionResolver: admin, client: api });
    await expect(actions.publishRepositoryEdit("owner/site", { readme: "x".repeat(512 * 1024 + 1) }, { branchName: "edit/readme", commitMessage: "edit", prTitle: "edit" })).rejects.toThrow("512 KB");
    expect(api.getReadme).not.toHaveBeenCalled();
    expect(api.createBlob).not.toHaveBeenCalled();
  });

  it("maps GitHub API failures to a typed error without leaking details", async () => {
    const api = client({ listInstallationRepositories: vi.fn(async () => { throw new GitHubApiError(500, "secret response body"); }) });
    const actions = createGitHubActions({ fetchHttp: vi.fn(), sessionResolver: admin, client: api });
    await expect(actions.listAuthorizedRepositories()).rejects.toMatchObject({ name: "GitHubApiError", status: 500 });
    const route = createGitHubRoute({ readSession: admin, fetchHttp: vi.fn(), actions });
    const response = await route.GET(new Request("http://localhost/api/github"));
    expect(await response.json()).toEqual({ error: "GitHub request failed." });
    expect(listGitHubAudit().some((entry) => entry.outcome === "failed")).toBe(false);
  });

  it("previews without publishing, then publishes through read, ref, blob, commit and PR APIs", async () => {
    const order: string[] = [];
    const api = client({
      getReadme: vi.fn(async () => { order.push("read"); return { name: "README.md", path: "README.md", sha: "readme", content: "", encoding: "base64" as const }; }),
      getRef: vi.fn(async () => { order.push("ref"); return { ref: "refs/heads/main", object: { sha: "parent" } }; }),
      createBlob: vi.fn(async () => { order.push("blob"); return { sha: "blob" }; }),
      createTree: vi.fn(async () => { order.push("tree"); return { sha: "tree" }; }),
      createCommit: vi.fn(async () => { order.push("commit"); return { sha: "commit", html_url: "" }; }),
      createRef: vi.fn(async () => { order.push("branch"); return { ref: "refs/heads/edit", object: { sha: "commit" } }; }),
      createPullRequest: vi.fn(async () => { order.push("pr"); return { number: 12, html_url: "https://github.com/owner/site/pull/12", title: "Update" }; }),
    });
    const actions = createGitHubActions({ fetchHttp: vi.fn(), sessionResolver: admin, client: api });
    await actions.previewRepositoryEdit("owner/site", { description: "new", readme: "new text" });
    expect(order).toEqual([]);
    expect(api.createPullRequest).not.toHaveBeenCalled();
    await actions.publishRepositoryEdit("owner/site", { description: "new", readme: "new text" }, { branchName: "edit/readme", commitMessage: "edit", prTitle: "Update" });
    expect(order).toEqual(["read", "ref", "blob", "tree", "commit", "branch", "pr"]);
    expect(api.patchRepository).toHaveBeenCalledOnce();
    expect(api.createPullRequest).toHaveBeenCalledOnce();
    expect(order).not.toContain("push");
  });
});
