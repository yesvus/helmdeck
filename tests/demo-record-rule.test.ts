// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminPermissionDeniedError,
  type AdminPermission,
  type AdminPermissionContext,
  type AdminSession,
} from "@yesvus/helmdeck";
import { signInAction } from "../fixtures/app/(helmdeck)/login/actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { checkPermissionAction } from "../fixtures/lib/permission-actions";
import {
  deleteResourceAction,
  queryResourceAction,
  readResourceAction,
  updateResourceAction,
} from "../fixtures/lib/resource-actions";

/**
 * The record a call names, carried all the way to a rule that reads it.
 *
 * The demo's own rule reads no record, so nothing about it changes here: the rule is swapped for one
 * that does, which is the whole of what a host writes when it decides per record. The subject is the
 * wiring, which is where a record could be dropped between the call and the decision. A collection
 * question cannot see one record, so `query` is the call this has to be checked against: if the
 * wiring asked about the collection everywhere, every one of these would pass.
 */
const rule = vi.hoisted(() => ({ withheld: "prd_1" }));

vi.mock("../fixtures/lib/demo-rules", async (importOriginal) => {
  const original = await importOriginal<typeof import("../fixtures/lib/demo-rules")>();
  return {
    ...original,
    demoCan: (session: AdminSession, permission: AdminPermission, context?: AdminPermissionContext) => {
      if (context?.resourceId === rule.withheld) return false;
      return original.demoCan(session, permission);
    },
  };
});

const request = vi.hoisted(() => ({ session: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "helmdeck_session" && request.session !== undefined
        ? { name, value: request.session }
        : undefined,
    set: (name: string, value: string) => {
      request.session = value;
    },
    delete: () => {
      request.session = undefined;
    },
  }),
}));

vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const [owner] = demoAccounts;

beforeEach(async () => {
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  await ensureDemoSeeded();
  for (const row of await demoPersistence().adapter.query<{ id: string }>("sessions")) {
    await demoPersistence().adapter.delete("sessions", row.id);
  }
  const result = await signInAction({ email: owner.email, password: DEMO_PASSWORD }, "");
  expect(result.ok).toBe(true);
});

describe("a record the rule withholds", () => {
  it("is refused by name, before the store is reached", async () => {
    const store = demoPersistence().adapter;
    // Spied on per resource rather than on the whole adapter, because the guard resolving the session
    // reads a row of its own, and a spy that counted those would fail a wiring that is correct.
    const read = vi.spyOn(store, "read");
    const written = vi.spyOn(store, "update");
    const removed = vi.spyOn(store, "delete");

    // The administrator, so only the record can be the reason.
    await expect(readResourceAction("products", rule.withheld)).rejects.toThrow(
      AdminPermissionDeniedError,
    );
    await expect(updateResourceAction("products", rule.withheld, { name: "Renamed" })).rejects.toThrow(
      AdminPermissionDeniedError,
    );
    await expect(deleteResourceAction("products", rule.withheld)).rejects.toThrow(
      AdminPermissionDeniedError,
    );

    // Refused before the record was fetched, so a withheld record is not in the response rather than
    // refused after it arrived.
    expect(read).not.toHaveBeenCalledWith("products", rule.withheld);
    expect(written).not.toHaveBeenCalledWith("products", rule.withheld, expect.anything());
    expect(removed).not.toHaveBeenCalledWith("products", rule.withheld);
    expect(await demoPersistence().adapter.read("products", rule.withheld)).not.toBeNull();
  });

  it("is listed in the collection, because a list names no record", async () => {
    // The question `query` asks is the collection's, so which rows come back is the store's own row
    // scoping. A host whose rule reads records filters inside the query it hands the store; what the
    // wiring must not do is ask the rule per returned row, which would be a second row filter in a
    // place that cannot compose with the first.
    const rows = (await queryResourceAction("products")) as { id: string }[];

    expect(rows.map((row) => row.id)).toContain(rule.withheld);
  });

  it("is refused by the view that asks about the same record", async () => {
    // The form is where a visitor names a record, and the read it asks is the read of that record.
    // The collection question and the record question are different, and the two halves get the same
    // answer to each of them.
    expect(await checkPermissionAction("products.read", { resourceId: rule.withheld })).toBe(false);
    expect(await checkPermissionAction("products.delete", { resourceId: rule.withheld })).toBe(false);
    expect(await checkPermissionAction("products.read", { resourceId: "prd_2" })).toBe(true);
    expect(await checkPermissionAction("products.delete", { resourceId: "prd_2" })).toBe(true);
  });

  it("is refused for a read and a write alike, and the record beside it is not", async () => {
    // Both the read and the write of a record are that record's decision, and a rule that withholds
    // one withholds both. The record next to it stays reachable, so the refusal is the record and
    // not the session, the resource or the call.
    await expect(readResourceAction("products", rule.withheld)).rejects.toThrow(
      AdminPermissionDeniedError,
    );

    expect(await readResourceAction("products", "prd_2")).toMatchObject({ id: "prd_2" });
    await updateResourceAction("products", "prd_2", { name: "Still writable" });
    expect(await readResourceAction("products", "prd_2")).toMatchObject({ name: "Still writable" });
  });
});
