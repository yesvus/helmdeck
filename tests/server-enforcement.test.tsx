// SPDX-License-Identifier: MIT
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminPermissionsProvider, useAdminPermission } from "../src/shell/permissions";
import { AdminResourceList, defineAdminResource } from "../src/resources/index";
import { createMemoryPersistenceAdapter } from "../src/baseline";
import {
  AdminPermissionDeniedError,
  AdminResourceNotExposedError,
  AdminUnauthenticatedError,
  createAdminPermissionCheck,
  createAdminPermissionGuard,
  createAdminResourceActions,
  evaluateAdminPermission,
  type AdminPermission,
  type AdminPermissionContext,
  type AdminPermissionGuard,
  type AdminPermissionRule,
  type AdminPersistenceAdapter,
  type AdminResourceActions,
  type AdminSession,
} from "../src/index";

/**
 * The server half of a host's authorization, called the way a caller who is not a browser calls it.
 *
 * Nothing here reads a page to decide whether a refusal happened. Every refusal below is the
 * exported function refusing an argument the caller chose, with the session the server resolved,
 * which is the call an attacker makes when the button is missing. A test that only read the
 * rendered page would pass against actions that were wide open, so the views appear here for the
 * one question they are the only half able to answer: whether the two halves agree.
 */

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin/products",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({
    children,
    href,
    ...rest
  }: { children: React.ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const DENIED_COPY = "You do not have access to this.";

const ADMIN: AdminSession = { email: "owner@example.test", role: "admin" };
const EDITOR: AdminSession = { email: "editor@example.test", role: "editor" };
const SESSIONS: Record<string, AdminSession> = { admin: ADMIN, editor: EDITOR };

/** The record whose delete is withheld, so a per-record decision has something to decide. */
const FROZEN = "prd_frozen";
const OPEN = "prd_open";

const OPERATIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["admin", new Set(["read", "create", "update", "delete"])],
  // An editor works the catalogue and cannot add to it or remove from it, so the two actions a
  // list view offers first are both refused for one role.
  ["editor", new Set(["read", "update"])],
]);
const EXPOSED = new Set(["products"]);

/** The host's rule, in the demo's shape: one function, asked about a session the server resolved. */
function can(session: AdminSession, permission: AdminPermission, context?: AdminPermissionContext) {
  const [resource, operation] = permission.split(".");
  if (!EXPOSED.has(resource)) return false;
  if (permission === "products.delete" && context?.resourceId === FROZEN) return false;
  return OPERATIONS.get(session.role ?? "")?.has(operation ?? "") ?? false;
}

type Role = keyof typeof SESSIONS;

/**
 * A host wired the way the README tells a host to wire one: one rule, one session resolver, one
 * check the views ask through, one guard the server path runs, and the resource calls in front of
 * the store. `wire` is everything a browser is allowed to say on the way to an answer.
 */
async function host(options: { role?: Role | null; rule?: AdminPermissionRule } = {}) {
  let current: Role | null = options.role ?? null;
  const asked: { permission: AdminPermission; context?: AdminPermissionContext }[] = [];
  const seen: AdminSession[] = [];
  const wire: { permission: AdminPermission; context?: AdminPermissionContext }[] = [];

  const resolveSession = () => (current === null ? null : SESSIONS[current]);
  const recording = (rule: AdminPermissionRule): AdminPermissionRule => (session, permission, context) => {
    seen.push(session);
    asked.push({ permission, context });
    return rule(session, permission, context);
  };
  const rule = "rule" in options ? options.rule : recording(can);

  const check = createAdminPermissionCheck({ rule, session: resolveSession });
  const guard = createAdminPermissionGuard({ rule, session: resolveSession });

  const base = createMemoryPersistenceAdapter();
  const calls = {
    query: vi.fn((resource: string, q?: Record<string, unknown>) => base.query(resource, q)),
    read: vi.fn((resource: string, id: string) => base.read(resource, id)),
    create: vi.fn((resource: string, value: unknown) => base.create(resource, value)),
    update: vi.fn((resource: string, id: string, value: unknown) => base.update(resource, id, value)),
    delete: vi.fn((resource: string, id: string) => base.delete(resource, id)),
  };
  const persistence: AdminPersistenceAdapter = {
    query: calls.query as unknown as AdminPersistenceAdapter["query"],
    read: calls.read as unknown as AdminPersistenceAdapter["read"],
    create: calls.create as unknown as AdminPersistenceAdapter["create"],
    update: calls.update as unknown as AdminPersistenceAdapter["update"],
    delete: calls.delete,
  };
  await calls.create("products", { id: OPEN, name: "Open" });
  await calls.create("products", { id: FROZEN, name: "Frozen" });
  // The seed went through the same spies, so a test asserting the store was not touched starts
  // from a call record holding nothing but the seed.
  for (const call of Object.values(calls)) call.mockClear();

  const actions: AdminResourceActions = createAdminResourceActions({
    guard,
    persistence,
    expose: (resource) => EXPOSED.has(resource),
  });

  return {
    ADMIN,
    EDITOR,
    FROZEN,
    OPEN,
    asked,
    seen,
    wire,
    calls,
    persistence,
    actions,
    check,
    guard,
    /** The adapter the views mount, whose `can` is the server action the client calls. */
    adapter: {
      can: vi.fn(async (permission: AdminPermission, context?: AdminPermissionContext) => {
        // The whole of what crosses to the server from a browser: a permission name and the record
        // it is about. No session, no role, no verdict.
        wire.push({ permission, context });
        return check(permission, context);
      }),
    },
    signIn(role: Role) {
      current = role;
    },
    signOut() {
      current = null;
    },
  };
}

type Host = Awaited<ReturnType<typeof host>>;

async function served(guard: AdminPermissionGuard, permission: AdminPermission, context?: AdminPermissionContext) {
  try {
    await guard(permission, context);
    return true;
  } catch {
    return false;
  }
}

const products = defineAdminResource({
  resource: "products",
  label: "Products",
  singularLabel: "Product",
  columns: [{ key: "name", header: "Name" }],
  fields: [{ name: "name", label: "Name" }],
  permissions: {
    read: "products.read",
    create: "products.create",
    update: "products.update",
    delete: "products.delete",
  },
});

function Probe({ permission, resourceId }: { permission: AdminPermission; resourceId?: string }) {
  const state = useAdminPermission(permission, resourceId === undefined ? undefined : { resourceId });
  return <span data-testid="state">{state}</span>;
}

function mounted(app: Host, children: React.ReactNode) {
  return (
    <AdminI18nProvider locale="en">
      <AdminPermissionsProvider adapter={app.adapter}>{children}</AdminPermissionsProvider>
    </AdminI18nProvider>
  );
}

/** The state a view reaches, read off the rendered tree rather than off the function under test. */
async function viewSays(
  app: Host,
  permission: AdminPermission,
  resourceId?: string,
): Promise<string> {
  const { unmount } = render(mounted(app, <Probe permission={permission} resourceId={resourceId} />));
  const state = await waitFor(() => {
    const value = screen.getByTestId("state").textContent;
    expect(value, `${permission} never resolved`).not.toBe("checking");
    return value;
  });
  unmount();
  return state as string;
}

describe("the resource calls refuse on the server before the effect", () => {
  it("refuses a delete the view does not draw, and writes nothing", async () => {
    const app = await host({ role: "editor" });

    // The call an attacker makes. Nothing rendered here, and the record is read back afterwards
    // through a call the same session is allowed, so a refusal that quietly deleted would show.
    await expect(app.actions.delete("products", OPEN)).rejects.toThrow(AdminPermissionDeniedError);

    expect(await app.actions.read("products", OPEN)).toMatchObject({ id: OPEN });
    expect(app.calls.delete).not.toHaveBeenCalled();
  });

  it("refuses a create the view does not offer, before the store is reached", async () => {
    const app = await host({ role: "editor" });

    await expect(app.actions.create("products", { name: "Smuggled" })).rejects.toThrow(
      AdminPermissionDeniedError,
    );

    expect(app.calls.create).not.toHaveBeenCalled();
    expect(await app.actions.query("products")).toHaveLength(2);
  });

  it("refuses the one record the rule withholds, whichever role asks", async () => {
    const app = await host({ role: "admin" });

    // A per-record rule with the administrator signed in, so only the record can be the reason.
    await expect(app.actions.delete("products", FROZEN)).rejects.toThrow(AdminPermissionDeniedError);
    expect(app.calls.delete).not.toHaveBeenCalled();

    await app.actions.delete("products", OPEN);
    expect(app.calls.delete).toHaveBeenCalledExactlyOnceWith("products", OPEN);
  });

  it("refuses a resource outside the exposed set, before the session is resolved", async () => {
    const app = await host({ role: "admin" });

    await expect(app.actions.query("users")).rejects.toThrow(AdminResourceNotExposedError);
    // The name is answered without asking anything about the session, so it is not a permission
    // question, and the difference between the two refusals is not an answer to enumerate with.
    expect(app.seen).toEqual([]);
    expect(app.calls.query).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session, and the refusal is its own kind", async () => {
    const app = await host({ role: null });

    await expect(app.actions.query("products")).rejects.toThrow(AdminUnauthenticatedError);
    expect(app.calls.query).not.toHaveBeenCalled();
    // The rule is never asked about a session that does not exist, so a host writes its rule
    // against a session that is there rather than defending itself against a missing one.
    expect(app.seen).toEqual([]);
  });

  it("names the missing session as the reason, rather than blaming the rule", async () => {
    const onUnauthenticated = vi.fn();
    const onDenied = vi.fn();
    const guard = createAdminPermissionGuard({
      rule: can,
      session: () => null,
      onUnauthenticated,
      onDenied,
    });

    await expect(guard("products.read")).rejects.toThrow(AdminUnauthenticatedError);
    expect(onUnauthenticated).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "no-session", session: null }),
    );
    expect(onDenied).not.toHaveBeenCalled();
  });

  it("refuses everything when the host wired no rule, and says so in development", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = await host({ role: "admin", rule: undefined });

    await expect(app.actions.query("products")).rejects.toThrow(AdminPermissionDeniedError);
    await expect(app.actions.create("products", { name: "x" })).rejects.toThrow(AdminPermissionDeniedError);

    // A missing rule is a host that has no authorization at all, and the warning is what makes that
    // different from a host whose roles happen to grant nothing.
    expect(app.calls.query).not.toHaveBeenCalled();
    expect(app.calls.create).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("no rule"));
  });

  it("prepares the store only for a call that was allowed to reach it", async () => {
    const order: string[] = [];
    const app = await host({ role: "admin" });
    const store = createMemoryPersistenceAdapter();
    const actions = createAdminResourceActions({
      guard: app.guard,
      persistence: {
        ...app.persistence,
        query: (async (resource: string, query?: Record<string, unknown>) => {
          order.push(`query:${resource}`);
          return store.query(resource, query);
        }) as unknown as AdminPersistenceAdapter["query"],
      },
      expose: (resource) => EXPOSED.has(resource),
      before: async ({ operation, resource }) => {
        order.push(`before:${operation}:${resource}`);
      },
    });

    // The refused call is one the guard turns away rather than one the exposed set refuses, so
    // this is where the preparation ordering against the refusal shows.
    await expect(actions.delete("products", FROZEN)).rejects.toThrow(AdminPermissionDeniedError);
    await actions.query("products");

    expect(order).toEqual(["before:read:products", "query:products"]);
  });

  it("is not created at all without a guard", () => {
    // Rather than a set of actions that decide nothing, which is the failure this exists to stop.
    expect(() =>
      createAdminResourceActions({
        guard: undefined as never,
        persistence: createMemoryPersistenceAdapter(),
      }),
    ).toThrow(/guard/);
  });

  it("is usable as the persistence the views read through", async () => {
    const app = await host({ role: "admin" });
    // A compile-time claim, checked by naming the type rather than by a comment: the actions are
    // the persistence prop, so the reads a list performs are the ones that refused above.
    const asPersistence: AdminPersistenceAdapter = app.actions;
    expect(await asPersistence.query("products")).toHaveLength(2);
  });
});

describe("the guard", () => {
  it("returns the server session for a permission the rule grants", async () => {
    const app = await host({ role: "admin" });

    await expect(app.guard("products.delete")).resolves.toBe(app.ADMIN);
    await expect(app.guard("orders.read")).rejects.toThrow(AdminPermissionDeniedError);
  });

  it("tells a host which refusal it was, without putting that in the message", async () => {
    const onDenied = vi.fn();
    const onUnauthenticated = vi.fn();
    const guard = createAdminPermissionGuard({
      rule: can,
      session: () => SESSIONS.editor,
      onDenied,
      onUnauthenticated,
    });

    await expect(guard("products.delete")).rejects.toThrow(AdminPermissionDeniedError);
    expect(onDenied).toHaveBeenCalledWith(expect.objectContaining({ reason: "denied", allowed: false }));
    // The reason is the host's; the message is the only part a caller sees, and it names nothing
    // about how the decision was reached.
    expect(onUnauthenticated).not.toHaveBeenCalled();
    await expect(guard("products.delete")).rejects.toThrow("This session may not products.delete");
  });

  it("refuses even when a refusal handler returns instead of throwing", async () => {
    // A host whose `onDenied` logs and falls through has not chosen to allow. An effect reached
    // after that would be the guard's answer rather than the handler's.
    const guard = createAdminPermissionGuard({
      rule: can,
      session: () => SESSIONS.editor,
      onDenied: () => "not authorised",
    });

    await expect(guard("products.delete")).rejects.toThrow(AdminPermissionDeniedError);
    await expect(guard("products.update")).resolves.toBe(EDITOR);
  });

  it("denies when the rule throws, and hands the failure to the host", async () => {
    const boom = new Error("the role table is unreachable");
    const onDenied = vi.fn();
    const guard = createAdminPermissionGuard({
      rule: () => {
        throw boom;
      },
      session: () => SESSIONS.admin,
      onDenied,
    });

    await expect(guard("products.delete")).rejects.toThrow(AdminPermissionDeniedError);
    expect(onDenied).toHaveBeenCalledWith(expect.objectContaining({ reason: "rule-failed", cause: boom }));
  });

  it("denies when resolving the session fails, because a broken store is not a session", async () => {
    const onError = vi.fn();
    const check = createAdminPermissionCheck({
      rule: () => true,
      session: () => {
        throw new Error("cookie store down");
      },
      onError,
    });

    expect(await check("products.delete")).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("refuses a rule that answers with something that is not a boolean", async () => {
    // A rule is one function answering one boolean. A string or an object coming back from an early
    // return is a bug in the rule, and a truthy one read as a grant would be a grant.
    for (const answer of ["granted", 1, { allowed: true }, [], "true"]) {
      const check = createAdminPermissionCheck({
        rule: () => answer as unknown as boolean,
        session: () => SESSIONS.admin,
      });
      expect(await check("products.delete"), String(answer)).toBe(false);
    }

    expect(
      await evaluateAdminPermission({
        rule: () => true,
        session: SESSIONS.admin,
        permission: "products.read",
      }),
    ).toBe(true);
  });
});

describe("the two halves decide the same thing", () => {
  const CALL: Record<AdminPermission, (actions: AdminResourceActions) => Promise<unknown>> = {
    "products.read": (actions) => actions.query("products"),
    "products.create": (actions) => actions.create("products", { name: "x" }),
    "products.update": (actions) => actions.update("products", OPEN, { name: "x" }),
    "products.delete": (actions) => actions.delete("products", OPEN),
    "orders.read": (actions) => actions.query("orders"),
    "users.read": (actions) => actions.query("users"),
  };
  const PERMISSIONS = Object.keys(CALL) as AdminPermission[];

  async function refused(call: Promise<unknown>) {
    try {
      await call;
      return false;
    } catch {
      return true;
    }
  }

  for (const role of ["admin", "editor"] as Role[]) {
    it(`answers the view, the guard and the action the same for a ${role}`, async () => {
      const app = await host({ role });

      for (const permission of PERMISSIONS) {
        const onServer = await served(app.guard, permission);
        expect(await viewSays(app, permission), `${permission} in the view`).toBe(
          onServer ? "allowed" : "denied",
        );
        expect(await refused(CALL[permission](app.actions)), `${permission} in the action`).toBe(!onServer);
      }
    });
  }

  it("withholds one row's delete in the table and refuses it in the action", async () => {
    const app = await host({ role: "admin" });

    render(mounted(app, <AdminResourceList definition={products} persistence={app.actions} />));

    // The table reads through the actions, so a row appearing here is a read the server allowed.
    expect(await screen.findByText("Frozen")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: `Delete: ${OPEN}` })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: `Delete: ${FROZEN}` })).not.toBeInTheDocument(),
    );

    // The row the rule withheld, asked for by name, which is the whole point.
    await expect(app.actions.delete("products", FROZEN)).rejects.toThrow(AdminPermissionDeniedError);
    expect(app.calls.delete).not.toHaveBeenCalled();
  });

  it("asks the same question on both sides, per record and per collection alike", async () => {
    const app = await host({ role: "admin" });

    await app.actions.delete("products", OPEN);
    await expect(app.actions.delete("products", FROZEN)).rejects.toThrow(AdminPermissionDeniedError);
    await app.actions.query("products");

    // The view decides a read for the collection, so the action must not start asking about a
    // record for it, and the reverse for the calls the view decides per row. Two halves asking
    // different questions get different answers from a per-record rule, which is the disagreement
    // this seam exists to make impossible.
    expect(app.asked).toEqual([
      { permission: "products.delete", context: { resourceId: OPEN } },
      { permission: "products.delete", context: { resourceId: FROZEN } },
      { permission: "products.read", context: undefined },
    ]);
  });

  it("gives the view no way to name a session, and the rule only the server's", async () => {
    const app = await host({ role: "admin" });

    expect(await viewSays(app, "products.read")).toBe("allowed");

    // Everything the browser said on the way there.
    expect(app.wire).toEqual([{ permission: "products.read", context: undefined }]);
    // And every session the rule was handed, which is one the resolver returned.
    expect(app.seen.length).toBeGreaterThan(0);
    for (const session of app.seen) expect([app.ADMIN, app.EDITOR]).toContain(session);
  });

  it("refuses both halves when the server has nobody signed in, whatever the browser believes", async () => {
    const app = await host({ role: null });

    // The client half's own idea of who is asking, which the transport above never carries.
    const browser = { email: "attacker@example.test", role: "admin" };
    expect(browser.role).toBe("admin");

    expect(await viewSays(app, "products.read")).toBe("denied");
    await expect(app.actions.query("products")).rejects.toThrow(AdminUnauthenticatedError);
    expect(app.calls.query).not.toHaveBeenCalled();
  });

  it("changes both halves together when the row behind the session changes", async () => {
    const app = await host({ role: "editor" });
    expect(await viewSays(app, "products.delete")).toBe("denied");

    app.signIn("admin");
    expect(await viewSays(app, "products.delete")).toBe("allowed");
    await expect(app.actions.delete("products", OPEN)).resolves.toBeUndefined();

    app.signOut();
    expect(await viewSays(app, "products.delete")).toBe("denied");
    await expect(app.actions.delete("products", OPEN)).rejects.toThrow(AdminUnauthenticatedError);
  });
});

describe("what a missing rule does to the view", () => {
  it("hides the resource rather than showing it, and says which failure that is", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = await host({ role: "admin", rule: undefined });

    render(mounted(app, <AdminResourceList definition={products} persistence={app.actions} />));

    // Hidden, not shown. Both answers are the server's decision, so neither is a security
    // difference; what differs is what the person who misconfigured the host sees. A view showing
    // everything is indistinguishable from a host whose roles grant nothing, and sends the host
    // looking at role rules instead of at the rule that is not there.
    expect(await screen.findByText(DENIED_COPY)).toBeInTheDocument();
    expect(screen.queryByText("Frozen")).not.toBeInTheDocument();
    expect(app.calls.query).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalled();
  });

  it("shows a guard with no adapter at all as a refusal, which is the same decision", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <AdminI18nProvider locale="en">
        <AdminPermissionsProvider>
          <Probe permission="products.read" />
        </AdminPermissionsProvider>
      </AdminI18nProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("denied"));
    expect(warning).toHaveBeenCalled();
  });
});

describe("the server path carries no client boundary", () => {
  const root = resolve(import.meta.dirname, "..");
  const isClient = (path: string) => /^\s*["']use client["']/m.test(readFileSync(path, "utf8"));
  const relativeImports = (source: string) =>
    [...source.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)].map((match) => match[1]);

  /** The modules an entry reaches, following its own relative imports. */
  function reachable(entry: string): string[] {
    const found = new Set<string>();
    const pending = [join(root, entry)];
    while (pending.length > 0) {
      const path = pending.pop() as string;
      if (found.has(path)) continue;
      found.add(path);
      for (const specifier of relativeImports(readFileSync(path, "utf8"))) {
        const base = resolve(path, "..", specifier.replace(/\.js$/, ""));
        const resolved = [".ts", ".tsx"]
          .map((extension) => `${base}${extension}`)
          .find((candidate) => {
            try {
              return statSync(candidate).isFile();
            } catch {
              return false;
            }
          });
        if (!resolved) throw new Error(`${path} imports ${specifier}, which resolves to no module`);
        pending.push(resolved);
      }
    }
    return [...found];
  }

  it("keeps the enforcement modules free of the client boundary", () => {
    // The seam exists to run where the session is. One `"use client"` above it, or one import of a
    // client module under it, and a host's server action cannot import the thing that refuses for
    // it. That failure is a build error in someone else's application, so it is checked here.
    const modules = [...reachable("src/shell/permission-rule.ts"), ...reachable("src/resources/actions.ts")];
    const clientModules = modules.filter(isClient).map((path) => path.slice(root.length + 1));

    expect({ clientModules }, "the server path must not reach a client module").toEqual({
      clientModules: [],
    });
    // A walk that resolved nothing would report nothing and pass, which is the shape of a check
    // that cannot fail.
    expect(modules.length).toBeGreaterThan(2);
  });
});
