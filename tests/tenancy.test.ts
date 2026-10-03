// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { AdminPersistenceAdapter } from "../src/adapters/index";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import {
  AdminTenantError,
  assertAdminTenant,
  createTenantScopedPersistenceAdapter,
  currentAdminTenant,
  hasAdminTenant,
  requireAdminTenant,
  resolveAdminTenant,
  runWithAdminTenant,
} from "../src/tenant-scope";

describe("the tenant in context", () => {
  it("is there for work it wraps, and gone after", async () => {
    expect(hasAdminTenant()).toBe(false);

    const seen = await runWithAdminTenant("acme", async () => {
      // Two awaits deep, which is the whole reason this is ambient: a store call here has no
      // parameter left to be handed a tenant in.
      await new Promise((resolve) => setTimeout(resolve, 1));
      return currentAdminTenant();
    });

    expect(seen).toBe("acme");
    expect(currentAdminTenant()).toBeUndefined();
  });

  it("puts the outer tenant back when nested work finishes", async () => {
    const order = await runWithAdminTenant("outer", async () => {
      const inner = await runWithAdminTenant("inner", () => currentAdminTenant());
      return [inner, currentAdminTenant()];
    });

    expect(order).toEqual(["inner", "outer"]);
  });

  it("keeps two concurrent requests apart, which is the case a parameter would miss", async () => {
    const one = runWithAdminTenant("one", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return currentAdminTenant();
    });
    const two = runWithAdminTenant("two", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return currentAdminTenant();
    });

    expect(await one).toBe("one");
    expect(await two).toBe("two");
  });

  it("hands back what the work returned rather than a promise of it", async () => {
    await expect(runWithAdminTenant("acme", () => 7)).resolves.toBe(7);
  });

  it("refuses an empty or non-string tenant, because empty is what a query for none matches", () => {
    expect(() => assertAdminTenant("")).toThrow(AdminTenantError);
    expect(() => assertAdminTenant(undefined)).toThrow(AdminTenantError);
    expect(() => assertAdminTenant(7)).toThrow(/non-empty string/);
    expect(() => runWithAdminTenant("", () => 1)).toThrow(AdminTenantError);
  });

  it("refuses a key longer than a hostname, a uuid and a slug combined", () => {
    expect(() => assertAdminTenant("a".repeat(201))).toThrow(/200 characters/);
    expect(() => assertAdminTenant("a".repeat(200))).not.toThrow();
  });

  it("says a missing tenant is a missing tenant rather than a default", () => {
    expect(() => requireAdminTenant("Reading posts 1")).toThrow(AdminTenantError);
    expect(() => requireAdminTenant("Reading posts 1")).toThrow(/Reading posts 1 needs a tenant/);
  });
});

describe("resolveAdminTenant", () => {
  it("returns what the resolver names", async () => {
    await expect(resolveAdminTenant(() => "acme", "Reading posts 1")).resolves.toBe("acme");
  });

  it("refuses a resolver that returns nothing, in the same words as a missing context", async () => {
    await expect(resolveAdminTenant(() => undefined, "Reading posts 1")).rejects.toThrow(
      /Reading posts 1 needs a tenant and the resolver returned none/,
    );
  });

  it("refuses an empty answer rather than treating it as none", async () => {
    await expect(resolveAdminTenant(() => "", "Reading posts 1")).rejects.toThrow(AdminTenantError);
  });

  it("awaits a resolver that reads a request", async () => {
    await expect(
      resolveAdminTenant(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return "acme";
      }, "Reading posts 1"),
    ).resolves.toBe("acme");
  });
});

describe("createTenantScopedPersistenceAdapter", () => {
  /**
   * A store that records the tenant each call was made under, because the question is which tenant
   * the wrapper put in context, and a memory store answers that question only by accident.
   */
  function recording() {
    const seen: (string | undefined)[] = [];
    const store: AdminPersistenceAdapter = {
      read: async () => {
        seen.push(currentAdminTenant());
        return null;
      },
      query: async () => {
        seen.push(currentAdminTenant());
        return [];
      },
      create: async () => ({}) as never,
      update: async () => ({}) as never,
      delete: async () => {
        seen.push(currentAdminTenant());
      },
    };
    return { store, seen };
  }

  const seed = () =>
    createMemoryPersistenceAdapter({
      posts: [
        { id: "1", title: "One", tenant: "acme" },
        { id: "2", title: "Two", tenant: "globex" },
      ],
    });

  it("puts the tenant in context for the call it wraps", async () => {
    const { store, seen } = recording();
    const scoped = createTenantScopedPersistenceAdapter(store, () => "acme");

    await scoped.read("posts", "1");
    await scoped.query("posts");
    await scoped.delete("posts", "1");

    expect(seen).toEqual(["acme", "acme", "acme"]);
  });

  it("refuses a call with no tenant, rather than passing one through unwrapped", async () => {
    const scoped = createTenantScopedPersistenceAdapter(seed());
    await expect(scoped.read("posts", "1")).rejects.toThrow(AdminTenantError);
  });

  it("names the store in the refusal, so the operator is pointed at the right place", async () => {
    const scoped = createTenantScopedPersistenceAdapter(seed());
    await expect(scoped.delete("posts", "1")).rejects.toThrow(/Deleting posts 1 needs a tenant/);
    await expect(scoped.create("posts", { title: "x" })).rejects.toThrow(/Creating a posts needs a tenant/);
  });

  it("carries every method, and does not claim the two the inner store does not have", async () => {
    const bare = recording().store;
    const scoped = createTenantScopedPersistenceAdapter(bare, () => "acme");

    // `queryPage` and `insertIfAbsent` are optional on the contract. A wrapper that declared them
    // unconditionally would offer a list that pages and a write that is atomic against a store that
    // does neither, and the offer would be the wrapper's rather than the store's.
    expect(scoped.queryPage).toBeUndefined();
    expect(scoped.insertIfAbsent).toBeUndefined();

    const paged = createTenantScopedPersistenceAdapter(
      { ...bare, queryPage: async () => ({ rows: [], total: 0 }) },
      () => "acme",
    );
    await expect(paged.queryPage!("posts")).resolves.toEqual({ rows: [], total: 0 });

    const unique = createTenantScopedPersistenceAdapter(
      { ...bare, insertIfAbsent: async () => null },
      () => "acme",
    );
    await expect(unique.insertIfAbsent!("posts", "id", { title: "x" })).resolves.toBeNull();
  });

  it("scopes the optional methods too, so a wrapped store reads one tenant", async () => {
    const seen: (string | undefined)[] = [];
    const scoped = createTenantScopedPersistenceAdapter(
      {
        ...recording().store,
        queryPage: async () => {
          seen.push(currentAdminTenant());
          return { rows: [], total: 0 };
        },
      },
      () => "globex",
    );

    await scoped.queryPage!("posts");
    expect(seen).toEqual(["globex"]);
  });

  it("says plainly that it does not scope rows, because wrapping one store is not isolation", async () => {
    // Two tenants, one seed, one store. The wrapper makes the tenant available and refuses a missing
    // one; it does not divide the rows, and a host reading the name would otherwise believe it does.
    const scoped = createTenantScopedPersistenceAdapter(seed(), () => "acme");
    const forAcme = await scoped.query("posts");
    const forGlobex = await createTenantScopedPersistenceAdapter(seed(), () => "globex").query("posts");

    expect(forAcme).toHaveLength(2);
    expect(forGlobex).toHaveLength(2);
  });
});