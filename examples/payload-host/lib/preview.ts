// SPDX-License-Identifier: MIT
import type { AdminPayloadUser } from "@yesvus/helmdeck";

export type PreviewRouteDeps = {
  readSession: () => Promise<AdminPayloadUser | null>;
  enableDraft: () => Promise<void> | void;
  disableDraft: () => Promise<void> | void;
  loadPayloadConfig?: () => Promise<unknown>;
};

const MAX_PREVIEW_URL_LENGTH = 2048;

function parsePreviewTarget(request: Request): URL | null {
  const rawTarget = new URL(request.url).searchParams.get("url") ?? "/";
  if (!rawTarget || rawTarget.length > MAX_PREVIEW_URL_LENGTH) return null;

  try {
    const target = new URL(rawTarget, request.url);
    if (target.origin !== new URL(request.url).origin) return null;
    return target;
  } catch {
    return null;
  }
}

export function createPreviewRoute(deps: PreviewRouteDeps) {
  return async function GET(request: Request) {
    const session = await deps.readSession();
    if (!session || session.role !== "admin") return Response.json({ error: "denied" }, { status: 401 });
    const target = parsePreviewTarget(request);
    if (!target) return Response.json({ error: "invalid preview URL" }, { status: 400 });
    await deps.loadPayloadConfig?.();
    await deps.enableDraft();
    return Response.redirect(target, 307);
  };
}

export function createExitPreviewRoute(deps: Pick<PreviewRouteDeps, "disableDraft">) {
  return async function GET(request: Request) {
    await deps.disableDraft();
    return Response.redirect(new URL("/", request.url), 307);
  };
}
