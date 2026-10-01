// SPDX-License-Identifier: MIT
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminPermissionDeniedError,
  AdminResourceNotExposedError,
  evaluateAdminPermission,
  type AdminPermission,
  type AdminPermissionContext,
  type AdminSession,
} from "@yesvus/helmdeck";
import { createMemoryPersistenceAdapter, hashPassword } from "@yesvus/helmdeck/baseline";
import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";
import { signInAction } from "../fixtures/app/(helmdeck)/login/actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { demoCan, exposedResource } from "../fixtures/lib/demo-rules";
import { demoCredentialStore } from "../fixtures/lib/demo-session";
import { checkPermissionAction } from "../fixtures/lib/permission-actions";
import {
  createResourceAction,
  deleteResourceAction,
  queryResourceAction,
  readResourceAction,
  updateResourceAction,
} from "../fixtures/lib/resource-actions";

/**
 * The demo standing on the package's seams, asked the questions a host asks when it adopts them.
 *
 * The package tests the package and the demo tests the demo. What is here is the seam between the
 * two: that the demo's own rule decides what the package's check and guard decide, that both halves
 * of the demo's admin answer from that one rule, and that the store the sign-in reads is the
 * package's over the demo's own tables. Each of those is a place where the two could be wired
 * differently without either set of tests noticing, so each is asked here through the exported seam
 * rather than through the function that implements it.
 */
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

const [owner, editor] = demoAccounts;

/** The exposed set, written out here rather than read back from the module under test. */
const EXPOSED = [
  "products",
  "orders",
  "landing_sections",
  "site_settings",
  "posts",
  "dashboard_placements",
  "customers",
  "shipments",
];

const OPERATIONS = ["read", "create", "update", "delete"];

/** The whole decision surface: a permission per resource per operation, plus what is not one. */
const PERMISSIONS = [
  ...EXPOSED.flatMap((resource) => OPERATIONS.map((operation) => `${resource}.${operation}`)),
  "users.read",
  "sessions.delete",
  "products",
  "products.read.write",
] as AdminPermission[];

/**
 * The permissions an action can be asked about, which is a resource and an operation. A name that is
 * not one of those cannot be produced by a call, because the action names the operation itself, so
 * asking an action about it would be testing nothing.
 */
const CALLABLE = PERMISSIONS.filter((permission) => {
  const [resource, operation] = permission.split(".");
  return (
    permission.split(".").length === 2 &&
    typeof resource === "string" &&
    typeof operation === "string" &&
    OPERATIONS.includes(operation) &&
    operation.length > 0
  );
});

/**
 * What each role is worth, written out here rather than read from the rule.
 *
 * An editor works the catalogue and the content and cannot remove a record, and orders are an
 * administrator's page. Anything else, including a role this file has never heard of, is nothing.
 */
function expected(session: AdminSession, permission: AdminPermission): boolean {
  const parts = permission.split(".");
  // A permission is a resource and an operation and nothing else, which is why one with a third part
  // is not a permission at all rather than one whose operation is the first two.
  if (parts.length !== 2) return false;
  const [resource, operation] = parts;
  if (!EXPOSED.includes(resource)) return false;
  if (!OPERATIONS.includes(operation)) return false;
  if (session.role === "admin") return true;
  if (session.role !== "editor") return false;
  if (resource === "orders") return false;
  return operation !== "delete";
}

const ROLES: AdminSession[] = [
  { email: owner.email, role: "admin" },
  { email: editor.email, role: "editor" },
  { email: owner.email },
  { email: owner.email, role: "" },
  { email: owner.email, role: "superuser" },
  { email: owner.email, role: "Admin" },
  { email: owner.email, role: "constructor" },
  { email: owner.email, role: "__proto__" },
];

async function signIn(account: { email: string }) {
  const result = await signInAction({ email: account.email, password: DEMO_PASSWORD }, "");
  expect(result.ok, `${account.email} could not sign in`).toBe(true);
  return request.session;
}

beforeEach(async () => {
  // The session adapter refuses to reach for a cookie from anything shaped like a browser, and jsdom
  // is one. These are server calls, so they run without one.
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  await ensureDemoSeeded();
  for (const row of await demoPersistence().adapter.query<{ id: string }>("sessions")) {
    await demoPersistence().adapter.delete("sessions", row.id);
  }
});

describe("the rule the package evaluates", () => {
  it("answers the same with a record in the context as without one", async () => {
    // The demo's rule reads no record, so a decision made for one must be the decision made for the
    // collection. The package hands the record's id along precisely so a host whose rule does read
    // one can decide per record, and this is what says the demo's move onto that seam changed no
    // answer: the whole surface, for every role, asked both ways.
    const named: AdminPermissionContext = { resourceId: "prd_1" };
    const decided: string[] = [];

    for (const session of ROLES) {
      for (const permission of PERMISSIONS) {
        const collection = await evaluateAdminPermission({ rule: demoCan, session, permission });
        const record = await evaluateAdminPermission({ rule: demoCan, session, permission, context: named });
        const other = await evaluateAdminPermission({
          rule: demoCan,
          session,
          permission,
          context: { resourceId: "prd_withheld" },
        });

        expect(record, `${session.role ?? "(none)"} ${permission}`).toBe(collection);
        expect(other, `${session.role ?? "(none)"} ${permission}`).toBe(collection);
        expect(collection, `${session.role ?? "(none)"} ${permission}`).toBe(expected(session, permission));
        decided.push(`${session.role ?? ""}:${permission}`);
      }
    }

    // A surface that answered nothing would satisfy every assertion above, which is the shape of a
    // check that cannot fail.
    expect(decided).toHaveLength(ROLES.length * PERMISSIONS.length);
  });

  it("exposes the eight resources it is written to expose, and hides the two it must", () => {
    for (const resource of EXPOSED) {
      expect(exposedResource(resource), resource).toBe(true);
    }

    // `users` and `sessions` are addressable through the same persistence interface as products, and
    // the resource name is whatever the caller sent, so what keeps password hashes and session rows
    // out of a form is their absence from this set.
    for (const hidden of ["users", "sessions", "", "Products", "products; DROP TABLE users"]) {
      expect(exposedResource(hidden), hidden).toBe(false);
    }
  });

  it("answers as the table says for every resource the demo's own pages ask about", () => {
    // The names are collected from the demo's source rather than from the set, so a resource added to
    // the rule and asked about by a page fails here rather than going unnoticed, and a name a page
    // asks about is checked against the table rather than assumed to agree.
    const root = resolve(import.meta.dirname, "..", "fixtures");
    const mentioned = new Set<string>();
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== ".next" && entry !== "node_modules") walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry)) continue;
        for (const [, name] of readFileSync(path, "utf8").matchAll(/["'`]([a-z][a-z0-9_]{2,})\.[a-z]+["'`]/g)) {
          mentioned.add(name);
        }
      }
    };
    walk(root);

    // A name the demo asks about that the rule exposes is one this file's table also exposes, and a
    // name the rule hides is not one it exposes. Nothing the demo asks about is allowed by accident.
    const allowed = [...mentioned].filter((name) => exposedResource(name)).sort();
    expect(allowed).toEqual([...mentioned].filter((name) => EXPOSED.includes(name)).sort());
    // And the walk found something, so a pattern that stopped matching would not read as agreement.
    expect(mentioned.size).toBeGreaterThan(3);
  });
});

describe("the two halves of the demo's admin", () => {
  it("refuse the same permissions, asked once as a view and once as an action", async () => {
    // The view asks through the package's check and the action through the package's guard, both
    // over the demo's one rule. The whole surface is walked for both accounts, and the claim is only
    // about refusals: a call the rule allows can still fail on a record that is not there, and that
    // is the store's answer rather than the rule's.
    for (const account of [editor, owner]) {
      await signIn(account);

      for (const permission of CALLABLE) {
        const view = await checkPermissionAction(permission);
        const [resource, operation] = permission.split(".");
        const refusal = await refusalFrom(async () => {
          if (operation === "read") return queryResourceAction(resource);
          if (operation === "create") return createResourceAction(resource, { name: "x" });
          if (operation === "update") return updateResourceAction(resource, "prd_1", { name: "x" });
          if (operation === "delete") return deleteResourceAction(resource, "prd_1");
          return undefined;
        });

        if (view) {
          expect(refusal, `${account.email} ${permission}`).not.toBe(true);
        } else {
          // A refusal, and specifically the rule's: the guard runs before the store, so a permission
          // the view refused cannot have reached a table and come back as a missing row.
          expect(refusal, `${account.email} ${permission}`).toBe(true);
        }
      }
    }
  });

  it("refuses a name outside the exposed set before it resolves the session", async () => {
    // Refused as a name rather than as a permission question, so the answer cannot be used to ask
    // what a caller with a session would have been allowed to do with it.
    request.session = undefined;

    await expect(queryResourceAction("users")).rejects.toThrow(AdminResourceNotExposedError);
    await expect(readResourceAction("sessions", "anything")).rejects.toThrow(AdminResourceNotExposedError);
    await expect(deleteResourceAction("users", "usr_owner")).rejects.toThrow(AdminResourceNotExposedError);
  });
});

/**
 * Whether a call was refused by the rule or by the exposed set, rather than by the store.
 *
 * A record that is not there is the store answering, so it reads as "not refused" here. A test that
 * counted it as a refusal would report a rule that allows things as one that refuses them, and one
 * that counted it as success would report a rule that refuses things as one that allows them.
 */
async function refusalFrom(call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call();
    return false;
  } catch (cause) {
    return cause instanceof AdminPermissionDeniedError || cause instanceof AdminResourceNotExposedError;
  }
}

describe("the store the demo signs in through", () => {
  it("is the package's store over the demo's own tables", async () => {
    // Written with the package's adapter and read back with the demo's: a host with a schema of its
    // own supplies the six methods, and the demo supplies the tables it already had instead.
    const memory = createMemoryPersistenceAdapter();
    await memory.create("users", {
      id: "usr_written_by_the_package",
      email: "written@demo.helmdeck.dev",
      password_hash: await hashPassword("whatever this was"),
      role: "editor",
    });

    const store = demoCredentialStore(memory as AdminPersistenceAdapter);

    expect(await store.findUserByEmail("written@demo.helmdeck.dev")).toMatchObject({
      id: "usr_written_by_the_package",
      role: "editor",
    });
    // And a session row written through it is one the demo's own sign-in can resolve.
    const session = await store.createSession("usr_written_by_the_package", 4102444800);
    expect(await store.readSession(session.id)).toMatchObject({ userId: "usr_written_by_the_package" });
  });
});
