// SPDX-License-Identifier: MIT
"use server";

import { requireDemoSession } from "../../../../lib/demo-guard";
import {
  listPostRevisions,
  listPostsWithHistory,
  publishPost,
  restorePostRevision,
  savePost,
  unpublishPost,
  type PostRevision,
} from "../../../../lib/demo-revisions";

/**
 * The post history's server actions.
 *
 * Each one resolves the session and hands it to the operation, which asks `demoCan` about the post.
 * The session comes from the cookie's signed id and the role on the user row behind it, so a caller
 * cannot talk this boundary into a different role by posting an argument. There is no check here
 * that the UI repeats, because the UI is not where authorization is decided.
 */

const RETURN_TO = "/shell/revisions";

export async function listPostsWithHistoryAction() {
  const session = await requireDemoSession({ returnTo: RETURN_TO });
  return listPostsWithHistory(session);
}

export async function listPostRevisionsAction(postId: string): Promise<PostRevision[]> {
  const session = await requireDemoSession({ returnTo: RETURN_TO });
  return listPostRevisions(session, postId);
}

export async function savePostAction(input: {
  postId: string;
  title?: unknown;
  body?: unknown;
}): Promise<PostRevision> {
  const session = await requireDemoSession({ returnTo: RETURN_TO });
  return savePost(session, input.postId, { title: input.title, body: input.body });
}

export async function publishPostAction(postId: string): Promise<PostRevision> {
  const session = await requireDemoSession({ returnTo: RETURN_TO });
  return publishPost(session, postId);
}

export async function unpublishPostAction(postId: string): Promise<PostRevision> {
  const session = await requireDemoSession({ returnTo: RETURN_TO });
  return unpublishPost(session, postId);
}

export async function restorePostRevisionAction(
  postId: string,
  revisionId: string,
): Promise<PostRevision> {
  const session = await requireDemoSession({ returnTo: RETURN_TO });
  return restorePostRevision(session, postId, revisionId);
}
