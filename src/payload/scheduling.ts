// SPDX-License-Identifier: MIT

import type { AdminPayloadContent } from "./bridge.js";
import type { AdminPayloadSessionReader, AdminPayloadUser } from "./bridge.js";

export type AdminPayloadJobs = {
  queue: (args: Record<string, unknown>) => Promise<unknown>;
  run: (args?: Record<string, unknown>) => Promise<unknown>;
  runByID: (args: Record<string, unknown>) => Promise<unknown>;
  cancel: (args: Record<string, unknown>) => Promise<void>;
  cancelByID: (args: Record<string, unknown>) => Promise<void>;
  handleSchedules: (args?: Record<string, unknown>) => Promise<unknown>;
};

export type AdminPayloadJobInstance = {
  jobs: AdminPayloadJobs;
  update?: (args: Record<string, unknown>) => Promise<unknown>;
  findByID?: (args: Record<string, unknown>) => Promise<unknown>;
  [key: string]: unknown;
};

export type AdminPayloadSchedulerOptions = {
  payload: AdminPayloadJobInstance;
  resolveUser: AdminPayloadSessionReader;
  task?: string;
  queue?: string;
  content?: AdminPayloadContent;
};

export const PAYLOAD_PAGE_PUBLISH_TASK = "publishPayloadPage";

export function createAdminPayloadPagePublishHandler(options: { payload?: AdminPayloadJobInstance } = {}) {
  return async (args: { input?: Record<string, unknown>; req?: { user?: unknown; payload?: AdminPayloadJobInstance } }) => {
    const input = args?.input ?? {};
    const collection = String(input.collection ?? input.collectionSlug ?? input.slug ?? "pages");
    const id = input.id ?? input.pageId ?? input.documentId;
    if (id === undefined || id === null) {
      throw new Error("A page-publishing job needs a page id.");
    }
    const payload = options.payload ?? args?.req?.payload;
    const user = args?.req?.user;
    if (!payload) {
      throw new Error("No Payload instance available to publish the page.");
    }
    if (typeof payload.findByID === "function") {
      try {
        const found = await payload.findByID({ collection, id, overrideAccess: false, user, depth: 0 });
        if (!found) throw new Error(`Page ${id} no longer exists.`);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (/not found/i.test(message)) {
          throw new Error(`Page ${id} no longer exists.`, { cause });
        }
        throw cause instanceof Error ? cause : new Error(message, { cause });
      }
    }
    await payload.update!({
      collection,
      id,
      data: {},
      draft: false,
      overrideAccess: false,
      user,
      depth: 0,
    });
    return { output: { collection, id, published: true } };
  };
}

function toWaitUntil(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new Error(`"${value}" is not a moment`);
    return d;
  }
  if (typeof value === "string") {
    const sent = value.trim();
    const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(sent) ? `${sent}Z` : sent;
    const d = new Date(zoned);
    if (Number.isNaN(d.getTime())) throw new Error(`"${sent}" is not a moment`);
    return d;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate =
      record.publishAt ?? record.publish_at ?? record.runAt ?? record.run_at ?? record.waitUntil ?? record.when ?? record.at;
    if (candidate !== undefined) return toWaitUntil(candidate);
  }
  throw new Error("A scheduled publish needs a moment.");
}

function normalizeEnqueueArgs(args: unknown[]): Record<string, unknown> {
  if (args.length === 0) return {};
  if (typeof args[0] === "string") {
    const [collection, id, publishAt, rest] = args;
    return { collection, id, publishAt, ...(rest && typeof rest === "object" ? (rest as Record<string, unknown>) : {}) };
  }
  if (args[0] && typeof args[0] === "object") {
    const first = args[0] as Record<string, unknown>;
    const out: Record<string, unknown> = { ...first };
    if (args[1] !== undefined && (typeof args[1] === "string" || typeof args[1] === "number" || args[1] instanceof Date)) {
      out.publishAt = args[1];
    }
    if (args[2] !== undefined && typeof args[2] === "object") {
      Object.assign(out, args[2] as Record<string, unknown>);
    }
    return out;
  }
  return {};
}

function normalizeJobArgs(args: unknown[]): Record<string, unknown> {
  if (args.length === 0) return {};
  if (typeof args[0] === "string" || typeof args[0] === "number") {
    const [id, rest] = args;
    return { id, ...(rest && typeof rest === "object" ? (rest as Record<string, unknown>) : {}) };
  }
  if (args[0] && typeof args[0] === "object") {
    const first = args[0] as Record<string, unknown>;
    const out: Record<string, unknown> = { ...first };
    if (args[1] !== undefined && (typeof args[1] === "string" || typeof args[1] === "number" || args[1] instanceof Date)) {
      out.publishAt = args[1];
      out.waitUntil = args[1];
    }
    return out;
  }
  return {};
}

export function createAdminPayloadScheduler(options: AdminPayloadSchedulerOptions) {
  const payload = options.payload;
  const resolveUser = options.resolveUser;
  const task = options.task ?? PAYLOAD_PAGE_PUBLISH_TASK;
  const defaultQueue = options.queue;

  const currentUser = async (operation: string): Promise<AdminPayloadUser> => {
    const user = await resolveUser();
    if (!user) {
      const { AdminPayloadAccessRefused } = await import("./bridge.js");
      throw new AdminPayloadAccessRefused(operation);
    }
    return user;
  };

  const enqueue = async (...args: unknown[]): Promise<unknown> => {
    const opts = normalizeEnqueueArgs(args);
    const user = await currentUser("schedule");
    const collection = String(opts.collection ?? opts.collectionSlug ?? opts.slug ?? "pages");
    const id = opts.id ?? opts.pageId ?? opts.documentId;
    if (id === undefined || id === null) {
      throw new Error("A scheduled publish needs a page id.");
    }
    const waitUntil = toWaitUntil(opts.publishAt ?? opts.waitUntil ?? opts.runAt ?? opts.when ?? opts.at);
    const input = { collection, id };
    return payload.jobs.queue({
      task,
      input,
      waitUntil,
      overrideAccess: false,
      req: { user },
      queue: opts.queue ?? defaultQueue,
      ...(opts.meta ? { meta: opts.meta } : {}),
    });
  };

  const reschedule = async (...args: unknown[]): Promise<unknown> => {
    const opts = normalizeJobArgs(args);
    const user = await currentUser("reschedule");
    const id = opts.id ?? opts.jobId ?? opts.scheduleId;
    const waitUntil = toWaitUntil(opts.publishAt ?? opts.waitUntil ?? opts.runAt ?? opts.when ?? opts.at);
    const collection = opts.collection ?? opts.collectionSlug;
    const pageId = opts.pageId ?? opts.documentId ?? opts.id2;

    if (id !== undefined && id !== null && collection === undefined && pageId === undefined) {
      try {
        if (typeof payload.update === "function") {
          return await payload.update({
            collection: "payload-jobs",
            id,
            data: { waitUntil: waitUntil.toISOString() },
            overrideAccess: false,
            user,
            req: { user },
          });
        }
      } catch {
        // Fall through to cancel + queue.
      }
    }

    if (id !== undefined && id !== null) {
      try {
        await payload.jobs.cancelByID({ id, overrideAccess: false, req: { user } });
      } catch {
        // The job may already be gone; queuing the new one is still the right move.
      }
    }
    if (collection !== undefined || pageId !== undefined) {
      return payload.jobs.queue({
        task,
        input: { collection: collection ?? "pages", id: pageId },
        waitUntil,
        overrideAccess: false,
        req: { user },
        queue: opts.queue ?? defaultQueue,
      });
    }
    return { id, waitUntil };
  };

  const cancel = async (...args: unknown[]): Promise<void> => {
    const opts = normalizeJobArgs(args);
    const user = await currentUser("cancel");
    const id = opts.id ?? opts.jobId ?? opts.scheduleId;
    if (id !== undefined && id !== null) {
      await payload.jobs.cancelByID({ id, overrideAccess: false, req: { user } });
      return;
    }
    const where = opts.where ?? (opts.filter as unknown);
    await payload.jobs.cancel({
      where: where ?? {},
      overrideAccess: false,
      req: { user },
      queue: opts.queue ?? defaultQueue,
    });
  };

  const run = async (...args: unknown[]): Promise<unknown> => {
    const user = await currentUser("run");
    const opts = (args[0] && typeof args[0] === "object" ? (args[0] as Record<string, unknown>) : {});
    return payload.jobs.run({
      ...opts,
      overrideAccess: false,
      req: { user },
      queue: opts.queue ?? defaultQueue,
    });
  };

  const runByID = async (...args: unknown[]): Promise<unknown> => {
    const opts = normalizeJobArgs(args);
    const user = await currentUser("run");
    const id = opts.id ?? opts.jobId;
    if (id === undefined || id === null) throw new Error("A job id is needed to run.");
    return payload.jobs.runByID({ id, overrideAccess: false, req: { user }, ...(opts.silent ? { silent: opts.silent } : {}) });
  };

  const runDue = async (...args: unknown[]): Promise<unknown> => run(args[0] ?? { allQueues: false });
  const publishDue = runDue;

  const handleSchedules = async (...args: unknown[]): Promise<unknown> => {
    const user = await currentUser("handleSchedules");
    const opts = (args[0] && typeof args[0] === "object" ? (args[0] as Record<string, unknown>) : {});
    return payload.jobs.handleSchedules({ ...opts, req: { user } });
  };

  const runner = async (runArgs?: Record<string, unknown>) => run(runArgs);

  const scheduler = {
    task,
    queue: defaultQueue,
    schedule: enqueue,
    enqueue,
    queueJob: enqueue,
    add: enqueue,
    reschedule,
    move: reschedule,
    cancel,
    cancelByID: cancel,
    cancelJob: cancel,
    run,
    runByID,
    runDue,
    publishDue,
    handleSchedules,
    runner,
  };

  return scheduler;
}

export const createAdminPayloadJobScheduler = createAdminPayloadScheduler;
export const createAdminPayloadPublishScheduler = createAdminPayloadScheduler;
export const createAdminPayloadJobsScheduler = createAdminPayloadScheduler;
export const createPayloadJobScheduler = createAdminPayloadScheduler;
export const createPayloadScheduler = createAdminPayloadScheduler;

export async function schedulePayloadPage(...args: unknown[]): Promise<unknown> {
  let payload: AdminPayloadJobInstance;
  let resolveUser: AdminPayloadSessionReader;
  let opts: Record<string, unknown>;
  if (args[0] && typeof args[0] === "object" && "payload" in (args[0] as Record<string, unknown>)) {
    const o = args[0] as Record<string, unknown>;
    payload = o.payload as AdminPayloadJobInstance;
    resolveUser = o.resolveUser as AdminPayloadSessionReader;
    opts = (args[1] as Record<string, unknown>) ?? {};
  } else {
    payload = args[0] as AdminPayloadJobInstance;
    if (typeof args[args.length - 1] === "function") {
      resolveUser = args[args.length - 1] as AdminPayloadSessionReader;
      opts = (args[1] && typeof args[1] === "object" ? args[1] : {}) as Record<string, unknown>;
    } else {
      resolveUser = async () => null;
      opts = (args[1] && typeof args[1] === "object" ? args[1] : {}) as Record<string, unknown>;
    }
  }
  const scheduler = createAdminPayloadScheduler({ payload, resolveUser });
  return scheduler.schedule(opts);
}

export const enqueuePayloadPagePublish = schedulePayloadPage;
export const queuePayloadPagePublish = schedulePayloadPage;
export const schedulePayloadPagePublish = schedulePayloadPage;

export { AdminPayloadAccessRefused } from "./bridge.js";