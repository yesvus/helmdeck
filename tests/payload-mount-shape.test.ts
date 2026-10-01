// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { payloadAdmin, PAYLOAD_ADMIN_USER } from "../fixtures/lib/payload-admin";
import { payloadCollections } from "../fixtures/lib/payload-collections";
import { demoPayloadCan } from "../fixtures/lib/payload-access";
import { payloadDatabaseClient, payloadDatabaseOptions } from "../fixtures/lib/payload-db";
import { payloadServerURL } from "../fixtures/lib/payload-server-url";

/**
 * The shape of the arrangement, asserted without booting anything.
 *
 * These are the claims a person would otherwise have to take on trust from the config file: the admin
 * panel names the demo's own accounts, the accounts collection reads the demo's own table, Payload's own
 * login is off, and the access rules are the demo's rule rather than a second one. Each is checked here
 * as well as in the suites that boot Payload, because a change to any of them is a change to the
 * arrangement rather than to a detail, and this file is where that shows up.
 *
 * The behaviour is proved elsewhere. `payload-write-boundary` boots Payload and shows a write being
 * refused, and `payload-one-login` signs in through the demo's own adapter and resolves the account.
 * What is here is the wiring those two rely on.
 */

const fixturesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");

const collection = (slug: string) => payloadCollections.find((entry) => entry.slug === slug);

describe("Payload is mounted inside the demo rather than beside it", () => {
  it("keeps its admin panel in its own route group, with its own root layout", () => {
    // Two root layouts is the arrangement the docs prescribe: Payload renders `<html>` itself, so a root
    // layout above it would nest one document inside another. The demo's routes moved into `(helmdeck)`
    // beside it rather than staying above it.
    expect(existsSync(resolve(fixturesRoot, "app/(payload)/layout.tsx"))).toBe(true);
    expect(existsSync(resolve(fixturesRoot, "app/(payload)/admin/[[...segments]]/page.tsx"))).toBe(true);
    expect(existsSync(resolve(fixturesRoot, "app/(payload)/api/[...slug]/route.ts"))).toBe(true);

    // And no root layout above either group, which is what makes them two documents rather than one
    // document with two of everything.
    expect(existsSync(resolve(fixturesRoot, "app/layout.tsx"))).toBe(false);
    expect(existsSync(resolve(fixturesRoot, "app/(helmdeck)/layout.tsx"))).toBe(true);
  });

  it("names the demo's own accounts as the admin panel's user collection", () => {
    expect(payloadAdmin.user).toBe(PAYLOAD_ADMIN_USER);
    expect(PAYLOAD_ADMIN_USER).toBe("demo-accounts");
  });

  it("reads the demo's own users table rather than creating a second one", () => {
    // `dbName` is what makes an account one row instead of two. Without it Payload would create and own a
    // `demo-accounts` table, there would be a second copy of every account, and the two would drift the
    // first time a role changed in one of them.
    expect(collection("demo-accounts")?.dbName).toBe("users");
  });

  it("turns off Payload's own sign-in, so there is one credential store", () => {
    const auth = collection("demo-accounts")?.auth as { disableLocalStrategy?: boolean } | undefined;
    expect(auth?.disableLocalStrategy).toBe(true);
  });

  it("refuses every write to an account row, so a role cannot be granted over HTTP", () => {
    const accounts = collection("demo-accounts");
    const access = accounts?.access ?? {};

    expect(access.create?.({ req: {} } as never)).toBe(false);
    expect(access.update?.({ req: {} } as never)).toBe(false);
    expect(access.delete?.({ req: {} } as never)).toBe(false);
  });

  it("hands Payload's access rules the demo's own rule", () => {
    // The point of `overrideAccess: false` is that Payload asks somebody. That somebody is `demoCan`, so
    // the editor's abilities in the admin panel are the same values the shell's buttons and the resource
    // actions are decided by, and there is no second list to forget.
    // The user object as Payload hands it over: an id, an address and a role read from the account row.
    const editor = { id: "usr_editor", email: "editor@demo.helmdeck.dev", role: "editor" };
    expect(demoPayloadCan(editor, "read")).toBe(true);
    expect(demoPayloadCan(editor, "create")).toBe(true);
    expect(demoPayloadCan(editor, "delete")).toBe(false);

    const owner = { id: "usr_owner", email: "owner@demo.helmdeck.dev", role: "admin" };
    expect(demoPayloadCan(owner, "delete")).toBe(true);
  });

  it("refuses everything for a caller with no session", () => {
    // The negative that matters most: Payload asks its access functions even when there is no user, so a
    // rule that answered permissively for null would grant every collection to an anonymous caller.
    for (const user of [null, undefined, {}, { id: "x" }, { id: "x", role: "admin", email: "" }]) {
      expect(demoPayloadCan(user, "read")).toBe(false);
      expect(demoPayloadCan(user, "update")).toBe(false);
      expect(demoPayloadCan(user, "delete")).toBe(false);
    }
  });

  it("does not let development push schema changes into a shared database", () => {
    // `push` alters the database to match the config at startup. The demo's database is shared with a
    // deployment, and a process that silently added columns to it would be a schema change nobody
    // approved. Read from the same options object the adapter is built from, so this cannot pass while the
    // adapter does something else.
    expect(payloadDatabaseOptions().push).toBe(false);
  });

  it("stores ids as text, because the demo's account ids are text", () => {
    // Payload's default is an autoincrementing integer. Over the demo's `usr_owner` ids that makes every
    // relationship Payload writes point at a row that does not exist, and the failure surfaces as a missing
    // document rather than as a type error.
    expect(payloadDatabaseOptions().idType).toBe("uuid");
  });

  it("points at the same database the demo's own rows are in", () => {
    const turso = payloadDatabaseClient({ HELMDECK_TURSO_URL: "libsql://x", HELMDECK_TURSO_TOKEN: "t" });
    expect(turso).toEqual({ url: "libsql://x", authToken: "t" });

    // Without the environment, a local file. Both are the same driver and the same schema, so a fresh
    // clone exercises the code a deployment runs.
    const local = payloadDatabaseClient({});
    expect(local.url.startsWith("file:")).toBe(true);

    // And an explicit override wins over both, so a suite cannot fall through to a developer's file.
    const overridden = payloadDatabaseClient({ HELMDECK_PAYLOAD_DB_URL: "file:/tmp/x.db" });
    expect(overridden.url).toBe("file:/tmp/x.db");
  });

  it("names its own origin for CSRF, rather than leaving the default to localhost", () => {
    expect(payloadServerURL({ PAYLOAD_SERVER_URL: "https://helmdeck.example" })).toBe(
      "https://helmdeck.example",
    );
    expect(payloadServerURL({ VERCEL_PROJECT_PRODUCTION_URL: "demo.example" })).toBe(
      "https://demo.example",
    );
    expect(payloadServerURL({})).toBe("http://localhost:3000");
  });
});