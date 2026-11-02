// SPDX-License-Identifier: MIT

import { readPayloadSession } from "../../../lib/session";
import { createGitHubActions, GitHubAccessRefusedError } from "../../../lib/github/actions";
import { GitHubApiError } from "../../../lib/github/client";

type RouteDependencies = { readSession: typeof readPayloadSession; fetchHttp: typeof fetch; actions?: ReturnType<typeof createGitHubActions> };
export function createGitHubRoute(deps: RouteDependencies) {
  const actions = deps.actions ?? createGitHubActions({ fetchHttp: deps.fetchHttp, sessionResolver: deps.readSession });
  async function gate() { const session = await deps.readSession(); return session?.role === "admin"; }
  async function handle(request: Request) {
    if (!await gate()) return Response.json({ error: "denied" }, { status: 401 });
    try {
      if (request.method === "GET") return Response.json({ repositories: await actions.listAuthorizedRepositories() });
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "invalid request" }, { status: 400 }); }
      if (typeof body.repository !== "string" || !body.repository) return Response.json({ error: "invalid request" }, { status: 400 });
      if (body.action === "read") return Response.json(await actions.readRepository(body.repository));
      if (body.action === "preview" || body.action === "publish") {
        if (!body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) return Response.json({ error: "invalid request" }, { status: 400 });
        const patch = body.patch as { description?: string; readme?: string };
        if ((patch.description !== undefined && typeof patch.description !== "string") || (patch.readme !== undefined && typeof patch.readme !== "string")) return Response.json({ error: "invalid request" }, { status: 400 });
        if (body.action === "preview") return Response.json({ preview: await actions.previewRepositoryEdit(body.repository, patch) });
        const metadata = body.metadata as { branchName?: string; commitMessage?: string; prTitle?: string } | undefined;
        if (!metadata || typeof metadata.branchName !== "string" || typeof metadata.commitMessage !== "string" || typeof metadata.prTitle !== "string") return Response.json({ error: "invalid request" }, { status: 400 });
        return Response.json(await actions.publishRepositoryEdit(body.repository, patch, { branchName: metadata.branchName, commitMessage: metadata.commitMessage, prTitle: metadata.prTitle }));
      }
      return Response.json({ error: "invalid request" }, { status: 400 });
    } catch (error) {
      if (error instanceof GitHubAccessRefusedError) return Response.json({ error: error.message }, { status: 403 });
      if (error instanceof GitHubApiError) return Response.json({ error: "GitHub request failed." }, { status: error.status >= 500 ? 502 : 502 });
      return Response.json({ error: "GitHub request failed." }, { status: 502 });
    }
  }
  return { GET: handle, POST: handle };
}
const route = createGitHubRoute({ readSession: readPayloadSession, fetchHttp: fetch });
export const GET = route.GET;
export const POST = route.POST;
