// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { ordersResource, productsResource } from "../fixtures/lib/admin-resources";
import { demoCan, exposedResource } from "../fixtures/lib/demo-rules";
import { seedOrders, seedProducts } from "../fixtures/lib/seed-data";
import { evaluateAdminPermission, type AdminSession } from "@yesvus/helmdeck";

const owner: AdminSession = { email: "owner@demo.helmdeck.dev", name: "Owner", role: "admin" };

/**
 * The persistence server actions are a boundary where a resource name that arrived from the browser
 * becomes a table name, so what they will and will not answer for is worth asserting here. A browser
 * cannot check it, because reaching the refusal requires calling the action directly with an
 * argument the UI never offers.
 */
describe("which resources the admin exposes", () => {
  it("exposes the two resources the pages render, and nothing else", () => {
    expect(exposedResource("products")).toBe(true);
    expect(exposedResource("orders")).toBe(true);
  });

  it("refuses users and sessions, so a table browser cannot reach hashes or session rows", () => {
    // `users` and `sessions` are addressable through the same persistence interface as products,
    // and the resource name is whatever the caller sent. This is the assertion that keeps password
    // hashes out of reach of a form.
    expect(exposedResource("users")).toBe(false);
    expect(exposedResource("sessions")).toBe(false);
  });

  it("refuses an empty or unknown name rather than treating it as a default", () => {
    expect(exposedResource("")).toBe(false);
    expect(exposedResource("Products")).toBe(false);
    expect(exposedResource("products; DROP TABLE users")).toBe(false);
  });
});

describe("the demo's rule", () => {
  // The rule is asked by the package, with a session it resolved, so a caller with no session is
  // refused before the rule is reached. That is the whole of the first case: the rule has no answer
  // for a session that is not there, and saying so is the package's job rather than the rule's.
  it("answers for a session that holds it, and the package refuses the caller that has none", async () => {
    expect(demoCan(owner, "products.read")).toBe(true);
    expect(await evaluateAdminPermission({ rule: demoCan, session: null, permission: "products.read" })).toBe(
      false,
    );
  });

  it("reads the resource out of the permission, so an unexposed one is refused whatever it asks for", () => {
    // The views only decide what to render, and the persistence actions re-ask this with the
    // operation they are about to perform. Both halves agree only because both come through here.
    expect(demoCan(owner, "products.update")).toBe(true);
    expect(demoCan(owner, "products.delete")).toBe(true);
    expect(demoCan(owner, "users.read")).toBe(false);
    expect(demoCan(owner, "sessions.delete")).toBe(false);
  });
});

describe("the resource definitions", () => {
  const resources = [
    { definition: productsResource, rows: seedProducts },
    { definition: ordersResource, rows: seedOrders },
  ];

  it("name every column and field the seeded records actually have", () => {
    // A column naming a field nothing stores renders an empty cell forever, and a form field
    // naming one writes a key that no record can be read back through. The store has no schema to
    // catch either, so the definition and the seed are checked against each other here.
    for (const { definition, rows } of resources) {
      const stored = new Set(Object.keys(rows[0] ?? {}));
      for (const column of definition.columns) {
        expect(stored, `${definition.resource} column ${column.key}`).toContain(column.key);
      }
      for (const field of definition.fields) {
        expect(stored, `${definition.resource} field ${field.name}`).toContain(field.name);
      }
    }
  });

  it("declare permissions in the form the rule parses, resource then operation", () => {
    // `demoCan` takes the resource from the text before the first dot. A permission written any
    // other way would be answered about a resource that does not exist, and denied for ever, which
    // looks exactly like a roles problem and is not one.
    for (const { definition } of resources) {
      for (const operation of ["read", "create", "update", "delete"] as const) {
        const permission = definition.permissions?.[operation];
        expect(permission).toBe(`${definition.resource}.${operation}`);
        expect(demoCan(owner, permission!)).toBe(true);
      }
    }
  });
});
