// SPDX-License-Identifier: MIT
/**
 * Audit hooks for Payload collections and globals: turn writes into activity rows.
 */

export type AdminPayloadAuditAction = "created" | "updated" | "deleted";

export type AdminPayloadAuditWrite = {
  action: AdminPayloadAuditAction;
  resource: string;
  resourceId: string | null;
  actorId: string | null;
  occurredAt: string;
  metadata?: Record<string, unknown> | null;
};

export type AdminPayloadAuditWriter = (
  row: AdminPayloadAuditWrite,
  req?: unknown,
) => unknown | Promise<unknown>;

export type AdminPayloadAuditHooksOptions = {
  resource: string;
  writer?: AdminPayloadAuditWriter;
  activityCollection?: string;
  kind?: "collection" | "global";
  actorId?: (req: unknown) => string | null;
  now?: (() => string) | string;
};

export type AdminPayloadAuditHooks = {
  afterChange: Array<(args: unknown) => unknown>;
  afterDelete: Array<(args: unknown) => unknown>;
};

type HookArgs = {
  doc?: unknown;
  result?: unknown;
  previousDoc?: unknown;
  id?: unknown;
  operation?: string;
  req?: unknown;
};

function asClock(value: unknown): () => string {
  if (typeof value === "function") return value as () => string;
  if (typeof value === "string") return () => value;
  return () => new Date().toISOString();
}

function defaultActorId(req: unknown): string | null {
  const r = req as { user?: unknown; payload?: { user?: unknown } } | null | undefined;
  const user = (r && (r.user ?? r.payload?.user)) as { id?: unknown } | null | undefined;
  if (!user || typeof user !== "object") return null;
  const id = (user as { id?: unknown }).id;
  if (id === null || id === undefined) return null;
  return String(id);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resourceIdOf(args: HookArgs): string | null {
  if (args.id !== undefined && args.id !== null) return String(args.id);
  const doc = args.doc ?? args.result ?? args.previousDoc;
  const rec = asRecord(doc);
  if (rec && rec.id !== undefined && rec.id !== null) return String(rec.id);
  return null;
}

export function createAdminPayloadAuditHooks(options: AdminPayloadAuditHooksOptions): AdminPayloadAuditHooks {
  const resource = options.resource;
  const isGlobal = options.kind === "global";

  const activityCollection = options.activityCollection ?? "admin-activity";

  const actorResolver = options.actorId ?? defaultActorId;

  const nowFn = asClock(options.now);

  let writer: AdminPayloadAuditWriter | undefined = options.writer;

  if (!writer) {
    writer = (row, req) => {
      const payload = (req as { payload?: { create?: (args: unknown) => unknown } } | null | undefined)?.payload;
      if (payload && typeof payload.create === "function") {
        return payload.create({ collection: activityCollection, data: row, overrideAccess: true });
      }
      return undefined;
    };
  }

  const write = writer!;

  const afterChangeHook = async (args: HookArgs): Promise<void> => {
    const operation = args.operation;
    // Deletes are recorded solely by the afterDelete hook, so afterChange must never
    // produce a "deleted" row (otherwise a single delete is recorded twice).
    if (operation === "delete") return;
    let action: AdminPayloadAuditAction;
    if (operation === "create") action = "created";
    else if (operation === "update") action = "updated";
    else if (isGlobal) action = args.previousDoc ? "updated" : "created";
    else action = args.previousDoc ? "updated" : "created";

    const row: AdminPayloadAuditWrite = {
      action,
      resource,
      resourceId: resourceIdOf(args),
      actorId: actorResolver(args.req),
      occurredAt: nowFn(),
    };

    await write(row, args.req);
  };

  const afterDeleteHook = async (args: HookArgs): Promise<void> => {
    const row: AdminPayloadAuditWrite = {
      action: "deleted",
      resource,
      resourceId: resourceIdOf(args),
      actorId: actorResolver(args.req),
      occurredAt: nowFn(),
    };
    await write(row, args.req);
  };

  return {
    afterChange: [afterChangeHook as (args: unknown) => unknown],
    afterDelete: [afterDeleteHook as (args: unknown) => unknown],
  };
}