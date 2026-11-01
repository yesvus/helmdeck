// SPDX-License-Identifier: MIT

import type { AdminPayloadContent } from "./bridge.js";
import type { AdminPayloadSessionReader, AdminPayloadUser } from "./bridge.js";

/**
 * The slice of the installed Payload Jobs surface a scheduler calls, and nothing more. The arg
 * types are the shapes the calls make, narrow on purpose: a real Payload instance (whose own queue
 * is typed against its config) then satisfies this slice rather than fighting it.
 */
export type AdminPayloadJobs = {
  queue: (args: {
    task: string;
    input: unknown;
    waitUntil?: Date;
    overrideAccess: boolean;
    req: { user: unknown };
    queue?: string;
    meta?: Record<string, unknown>;
  }) => Promise<unknown>;
  run: (args?: { allQueues?: boolean; queue?: string; limit?: number; silent?: boolean } & Record<string, unknown>) => Promise<unknown>;
  runByID: (args: { id: string | number; overrideAccess: boolean; req: { user: unknown }; silent?: boolean }) => Promise<unknown>;
  cancel: (args: { where: Record<string, unknown>; overrideAccess: boolean; req: { user: unknown }; queue?: string }) => Promise<void>;
  cancelByID: (args: { id: string | number; overrideAccess: boolean; req: { user: unknown } }) => Promise<void>;
  handleSchedules: (args?: Record<string, unknown>) => Promise<unknown>;
};

export type AdminPayloadJobInstance = {
  jobs: AdminPayloadJobs;
  /** The direct writes the scheduler and its handler need, both carrying the session themselves. */
  update?: (args: {
    collection: string;
    id: string | number;
    data?: unknown;
    draft?: boolean;
    overrideAccess: boolean;
    user?: unknown;
    req?: { user: unknown };
    depth?: number;
  }) => Promise<unknown>;
  findByID?: (args: { collection: string; id: string | number; overrideAccess: boolean; user?: unknown; depth?: number }) => Promise<unknown>;
  [key: string]: unknown;
};

export type AdminPayloadSchedulerOptions = {
  payload: AdminPayloadJobInstance;
  resolveUser: AdminPayloadSessionReader;
  /** The task the schedule queues; a host scheduling other work names its own. */
  task?: string;
  queue?: string;
  content?: AdminPayloadContent;
};

export const PAYLOAD_PAGE_PUBLISH_TASK = "publishPayloadPage";

export type AdminPayloadScheduleInput = {
  collection?: string;
  id: string | number;
  publishAt: string | number | Date;
  queue?: string;
  meta?: Record<string, unknown>;
};

export type AdminPayloadRescheduleInput = {
  /** The scheduled job to move. Naming `collection` and `id` instead requeues a new job directly. */
  id?: string | number;
  collection?: string;
  pageId?: string | number;
  publishAt: string | number | Date;
  queue?: string;
};

export type AdminPayloadCancelInput = {
  id?: string | number;
  where?: Record<string, unknown>;
  queue?: string;
};

export type AdminPayloadRunInput = {
  allQueues?: boolean;
  queue?: string;
  limit?: number;
  silent?: boolean;
};

export type AdminPayloadScheduler = {
  task: string;
  queue: string | undefined;
  schedule: (input: AdminPayloadScheduleInput) => Promise<unknown>;
  reschedule: (input: AdminPayloadRescheduleInput) => Promise<unknown>;
  cancel: (input: AdminPayloadCancelInput) => Promise<void>;
  run: (input?: AdminPayloadRunInput) => Promise<unknown>;
  runByID: (input: { id: string | number; silent?: boolean }) => Promise<unknown>;
  handleSchedules: (input?: Record<string, unknown>) => Promise<unknown>;
};

/** The task handler a host config registers, so a queued job publishes its page when it runs. */
export function createAdminPayloadPagePublishHandler(options: { payload?: AdminPayloadJobInstance } = {}) {
  // The request Payload passes carries its own tightly typed instance, which no slice type can name;
  // the instance is taken through `unknown` and narrowed once here.
  return async (args: { input?: Record<string, unknown>; req?: { user?: unknown; payload?: unknown } }) => {
    const input = args?.input ?? {};
    const collection = String(input.collection ?? "pages");
    const id = input.id;
    if (id === undefined || id === null || (typeof id !== "string" && typeof id !== "number")) {
      throw new Error("A page-publishing job needs a page id.");
    }
    const payload = (options.payload ?? args?.req?.payload) as AdminPayloadJobInstance | undefined;
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

function toWaitUntil(value: string | number | Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new Error(`"${value}" is not a moment`);
    return d;
  }
  const sent = value.trim();
  // The installed Jobs surface wants a wall-clock moment; a bare local time string is UTC.
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(sent) ? `${sent}Z` : sent;
  const d = new Date(zoned);
  if (Number.isNaN(d.getTime())) throw new Error(`"${sent}" is not a moment`);
  return d;
}

/**
 * Every scheduled write rides the session: no user, no call, and `overrideAccess` stays off so the
 * access rules of the host decide what a reader with a session may schedule.
 */
export function createAdminPayloadScheduler(options: AdminPayloadSchedulerOptions): AdminPayloadScheduler {
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

  const reqOf = (user: AdminPayloadUser) => ({ user });

  return {
    task,
    queue: defaultQueue,

    schedule: async (input) => {
      const user = await currentUser("schedule");
      const queue = input.queue ?? defaultQueue;
      return payload.jobs.queue({
        task,
        input: { collection: input.collection ?? "pages", id: input.id },
        waitUntil: toWaitUntil(input.publishAt),
        overrideAccess: false,
        req: reqOf(user),
        ...(queue ? { queue } : {}),
        ...(input.meta ? { meta: input.meta } : {}),
      });
    },

    reschedule: async (input) => {
      const user = await currentUser("reschedule");
      const waitUntil = toWaitUntil(input.publishAt);
      const queue = input.queue ?? defaultQueue;
      // A schedule moved by id edits its own waitUntil when Payload allows it, and falls back to a
      // requeue so the old moment never survives the new instruction.
      if (input.id !== undefined && input.collection === undefined && input.pageId === undefined) {
        try {
          if (typeof payload.update === "function") {
            return await payload.update({
              collection: "payload-jobs",
              id: input.id,
              data: { waitUntil: waitUntil.toISOString() },
              overrideAccess: false,
              user,
              req: reqOf(user),
            });
          }
        } catch {
          // Fall through to cancel the job, which survives without requeueing a page the caller
          // never named.
        }
      }
      if (input.id !== undefined) {
        try {
          await payload.jobs.cancelByID({ id: input.id, overrideAccess: false, req: reqOf(user) });
        } catch {
          // The job may already be gone; queuing the new one is still the right move.
        }
      }
      if (input.pageId === undefined) {
        return { id: input.id, waitUntil };
      }
      return payload.jobs.queue({
        task,
        input: { collection: input.collection ?? "pages", id: input.pageId },
        waitUntil,
        overrideAccess: false,
        req: reqOf(user),
        ...(queue ? { queue } : {}),
      });
    },

    cancel: async (input) => {
      const user = await currentUser("cancel");
      const queue = input.queue ?? defaultQueue;
      if (input.id !== undefined) {
        await payload.jobs.cancelByID({ id: input.id, overrideAccess: false, req: reqOf(user) });
        return;
      }
      await payload.jobs.cancel({
        where: input.where ?? {},
        overrideAccess: false,
        req: reqOf(user),
        ...(queue ? { queue } : {}),
      });
    },

    run: async (input) => {
      const user = await currentUser("run");
      const queue = input?.queue ?? defaultQueue;
      return payload.jobs.run({
        ...input,
        overrideAccess: false,
        req: reqOf(user),
        ...(queue ? { queue } : {}),
      });
    },

    runByID: async (input) => {
      const user = await currentUser("run");
      return payload.jobs.runByID({
        id: input.id,
        overrideAccess: false,
        req: reqOf(user),
        ...(input.silent ? { silent: input.silent } : {}),
      });
    },

    handleSchedules: async (input) => {
      const user = await currentUser("handleSchedules");
      return payload.jobs.handleSchedules({ ...input, req: reqOf(user) });
    },
  };
}

export { AdminPayloadAccessRefused } from "./bridge.js";
