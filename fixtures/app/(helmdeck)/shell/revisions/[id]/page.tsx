// SPDX-License-Identifier: MIT
import { notFound } from "next/navigation";
import { requireDemoSession } from "../../../../../lib/demo-guard";
import { demoCan } from "../../../../../lib/demo-rules";
import { listPostRevisions, readPost } from "../../../../../lib/demo-revisions";
import { PostHistory } from "../post-history";

/**
 * One post's history, on the server.
 *
 * The session is resolved here and the rule is asked once, so what the page renders and what the
 * actions allow come from the same answer. `canWrite` is not a decoration: it is the value the
 * action will check again, and a session that could not update the post sees no editor and no
 * restore buttons.
 */
export default async function PostRevisionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireDemoSession({ returnTo: "/shell/revisions" });

  const post = await readPost(session, id).catch(() => {
    // A post that is not there and a post this session may not read are the same answer to a
    // request for this page, and a 500 for a role the rule has not heard of would be a worse answer
    // than an empty one. The refusal is enforced on the actions, which is where a caller can be
    // told what it was refused; a page has no caller to tell.
    notFound();
  });
  const revisions = await listPostRevisions(session, post.id);

  return (
    <PostHistory post={post} revisions={revisions} canWrite={demoCan(session, "posts.update")} />
  );
}
