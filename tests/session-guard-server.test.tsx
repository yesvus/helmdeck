// SPDX-License-Identifier: MIT
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import { AdminAuthProvider, AdminRequireSession } from "../src/shell/auth";
import { adminReturnTo as adminReturnToFromAuth } from "../src/shell/auth";
import { adminReturnTo as adminReturnToFromTheGuardModule } from "../src/shell/session-guard";
import type { AdminAuthAdapter, AdminSession } from "../src/adapters/index";
import {
  AdminSessionRequiredError,
  createAdminPermissionGuard,
  createAdminSessionGuard,
  readAdminSession,
  type AdminSessionRefusal,
} from "../src/index";

/**
 * The session guard on the server, called the way a caller who is not a browser calls it.
 *
 * The package had no way to refuse a request for a session, because the module carrying both the
 * guard and the destination rules was a client module. A host that wanted the check wrote the
 * read and the redirect itself, in every file that needed it. What is asserted here is that one
 * call refuses, that it refuses the way the host asked, and that nothing in the path a server
 * import takes can be bundled for a browser.
 */

const SESSION: AdminSession = { email: "ada@example.test", role: "admin" };

const navigation = vi.hoisted(() => ({
  pathname: "/admin/products",
  params: new URLSearchParams() as URLSearchParams | null,
  push: vi.fn(),
}));

vi.mock("next/navigation.js", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => navigation.params,
}));

/**
 * A host wired the way the README tells a host to wire one: one resolver, the server guard built
 * from it, and the client adapter whose `getSession` asks the same resolver, which is the wire a
 * real host's server action stands in for.
 */
function host(initial: AdminSession | null = null) {
  let current = initial;
  const resolver = vi.fn(() => current);
  const refusals: AdminSessionRefusal[] = [];
  const guard = createAdminSessionGuard({
    session: resolver,
    onUnauthenticated: (refusal) => {
      refusals.push(refusal);
    },
  });
  const adapter: AdminAuthAdapter = {
    getSession: vi.fn(async () => resolver()),
    login: vi.fn(async () => ({ ok: true, session: SESSION })),
    logout: vi.fn(async () => {}),
  };
  return {
    adapter,
    guard,
    refusals,
    resolver,
    signIn(session: AdminSession = SESSION) {
      current = session;
    },
    signOut() {
      current = null;
    },
  };
}

type Host = ReturnType<typeof host>;

/** The login URL and destination a guard offers, from a host with no session. */
async function refusalFor(returnTo: string | undefined): Promise<AdminSessionRefusal> {
  const seen: AdminSessionRefusal[] = [];
  const guard = createAdminSessionGuard({
    session: () => null,
    onUnauthenticated: (refusal) => {
      seen.push(refusal);
    },
  });
  await expect(guard({ returnTo })).rejects.toThrow(AdminSessionRequiredError);
  return seen[0];
}

/** The `next` a refusal carries, read the way the sign-in page reads it. */
function nextOf(loginHref: string): string {
  return new URL(loginHref, "https://admin.example").searchParams.get("next") ?? "";
}

describe("a guard that returns the session or refuses", () => {
  it("returns the session the host's resolver gave, and asks the resolver once", async () => {
    const app = host(SESSION);

    // Identity rather than equality: the guard handed back the object the resolver answered with,
    // so nothing rebuilt it on the way out.
    await expect(app.guard({ returnTo: "/admin/billing" })).resolves.toBe(SESSION);
    expect(app.resolver).toHaveBeenCalledExactlyOnceWith();
    expect(app.refusals).toEqual([]);
  });

  it("hands the refusal to the host, naming the destination it validated", async () => {
    const app = host(null);

    await expect(app.guard({ returnTo: "/admin/billing" })).rejects.toThrow(AdminSessionRequiredError);

    expect(app.refusals).toEqual([
      {
        session: null,
        reason: "no-session",
        returnTo: "/admin/billing",
        loginHref: "/admin/login?next=%2Fadmin%2Fbilling",
      },
    ]);
    // The destination reaches the host already validated, because building the URL is the one
    // place a destination turns into a link somebody follows.
    expect(nextOf(app.refusals[0].loginHref)).toBe("/admin/billing");
  });

  it("tells the host whether a visitor or an outage caused the refusal", async () => {
    const boom = new Error("session store unreachable");
    const onError = vi.fn();
    const app = createAdminSessionGuard({
      session: () => {
        throw boom;
      },
      onUnauthenticated: () => {},
      onError,
    });

    // A broken read is not an absent session, so a host can answer 401 and a 500 differently
    // rather than bouncing a signed-in visitor to sign-in on every transient failure.
    await expect(app()).rejects.toThrow(AdminSessionRequiredError);
    expect(onError).toHaveBeenCalledExactlyOnceWith(boom);
    await expect(readAdminSession({ session: () => null, onError })).resolves.toBeNull();
  });

  it("keeps a query and a fragment the host already put on the sign-in URL", async () => {
    const refusal = await refusalFor("/admin/billing");
    expect(refusal.loginHref).toBe("/admin/login?next=%2Fadmin%2Fbilling");

    const withQuery = await (async () => {
      const seen: AdminSessionRefusal[] = [];
      const guard = createAdminSessionGuard({
        session: () => null,
        loginHref: "/giris?tenant=acme#sign-in",
        onUnauthenticated: (r) => seen.push(r),
      });
      await expect(guard({ returnTo: "/admin/billing" })).rejects.toThrow(AdminSessionRequiredError);
      return seen[0];
    })();

    // A second "?" would be malformed, and a fragment left in front would swallow the query, so
    // the destination the sign-in page reads back would be the one thing missing.
    expect(withQuery.loginHref).toBe("/giris?tenant=acme&next=%2Fadmin%2Fbilling#sign-in");
    expect(withQuery.loginHref.match(/\?/g)).toHaveLength(1);
    expect(new URL(withQuery.loginHref, "https://admin.example").searchParams.get("tenant")).toBe("acme");
  });

  it("lets one guard serve a sign-in URL per route, and falls back to the root", async () => {
    const seen: AdminSessionRefusal[] = [];
    const guard = createAdminSessionGuard({
      session: () => null,
      onUnauthenticated: (refusal) => seen.push(refusal),
    });

    await expect(guard({ returnTo: "/admin/billing", loginHref: "/t/acme/login" })).rejects.toThrow(
      AdminSessionRequiredError,
    );
    await expect(guard()).rejects.toThrow(AdminSessionRequiredError);

    expect(seen.map((refusal) => refusal.loginHref)).toEqual([
      "/t/acme/login?next=%2Fadmin%2Fbilling",
      "/admin/login?next=%2F",
    ]);
    expect(seen[1].returnTo).toBe("/");
  });

  it("refuses even when the refusal handler returns instead of throwing", async () => {
    // A host whose handler logs and falls through has not chosen to allow, so the work behind
    // the guard is unreachable either way.
    const app = host(null);
    let reached = 0;
    const guard = createAdminSessionGuard({
      session: app.resolver,
      onUnauthenticated: () => "unauthorised",
    });

    await expect(
      guard({ returnTo: "/admin/billing" }).then(() => {
        reached += 1;
      }),
    ).rejects.toThrow(AdminSessionRequiredError);
    expect(reached).toBe(0);
  });

  it("lets the host's own refusal interrupt, so a redirect is the host's response", async () => {
    // What `redirect()` from a framework throws, a thrown value of the host's choosing, and a
    // route handler's `new Response(..., { status: 401 })` is the same seam. A package that
    // imported the navigation module would have decided the response instead.
    const thrown = { digest: "NEXT_REDIRECT", destination: "/admin/login?next=%2Fadmin%2Fbilling" };
    const guard = createAdminSessionGuard({
      session: () => null,
      onUnauthenticated: ({ loginHref }) => {
        expect(loginHref).toBe("/admin/login?next=%2Fadmin%2Fbilling");
        throw thrown;
      },
    });

    // The host's value, not the package's error: a refusal the package answered would be a
    // second opinion on a decision the host already made.
    await expect(guard({ returnTo: "/admin/billing" })).rejects.toBe(thrown);
  });

  it("carries the failure to the error for a host that answered nothing", async () => {
    const boom = new Error("session store unreachable");
    const guard = createAdminSessionGuard({
      session: () => {
        throw boom;
      },
    });

    await expect(guard()).rejects.toThrow(AdminSessionRequiredError);
    // No handler, so the only record of why is the error a route handler would catch.
    const error = await guard({ returnTo: "/admin/billing" }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AdminSessionRequiredError);
    expect((error as AdminSessionRequiredError).reason).toBe("session-failed");
    expect((error as AdminSessionRequiredError).cause).toBe(boom);
    expect((error as AdminSessionRequiredError).message).not.toContain("unreachable");
  });
});

describe("a destination that leaves the origin is dropped", () => {
  // Each of these is an open redirect. A guard that passed one through would hand a visitor to
  // another origin the moment the sign-in page sent them on, and the sign-in page is the only
  // place the value is read.
  const OFF_ORIGIN: [string, string][] = [
    ["an absolute URL", "https://evil.example/steal"],
    ["a protocol-relative host", "//evil.example/steal"],
    ["a backslash host", "/\\evil.example/steal"],
    ["an encoded protocol-relative host", "/%2F%2Fevil.example"],
    ["a backslash after the first segment", "/admin/\\evil.example"],
    ["control characters a URL parser strips", "/%0D%0A/evil.example"],
    ["a tab a URL parser strips", "/%09/evil.example"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a data URL", "data:text/html,<script>alert(1)</script>"],
    ["a relative path with no leading slash", "admin/products"],
    ["a bare host", "evil.example"],
  ];

  for (const [label, value] of OFF_ORIGIN) {
    it(`refuses a next of ${label}, so the redirect stays on the origin`, async () => {
      const refusal = await refusalFor(value);

      expect(refusal.returnTo).toBe("/");
      expect(nextOf(refusal.loginHref)).toBe("/");
      expect(new URL(nextOf(refusal.loginHref), "https://admin.example").origin).toBe(
        "https://admin.example",
      );
    });
  }

  it("refuses a next that only leaves the origin once decoded", async () => {
    // Harmless through a router that does not decode, and a redirect through one that does.
    for (const value of ["/%252F%252Fevil.example", "/%5C%5Cevil.example"]) {
      expect((await refusalFor(value)).returnTo).toBe("/");
    }
  });

  it("cannot hand a redirect to another origin, whatever it is given", async () => {
    // The property rather than the cases: whatever the guard accepts must resolve against a base
    // URL to that same origin. Written as a property so a new encoding trick fails here without
    // anyone having to anticipate it.
    const base = "https://admin.example";
    const candidates = [
      ...OFF_ORIGIN.map(([, value]) => value),
      "/admin/products",
      "/admin/products?page=2",
      "/admin/a%20b",
      "/admin/%2e%2e//evil.example",
      "",
      undefined,
    ];
    const kept: string[] = [];

    for (const value of candidates) {
      const next = nextOf((await refusalFor(value)).loginHref);
      if (value !== undefined && next !== "/") kept.push(value);
      expect(`${String(value)} -> ${new URL(next, base).href}`, "left the origin").toContain(base);
    }

    // Guard against the property passing because every candidate was refused.
    expect(kept.length).toBeGreaterThan(0);
  });

  it("writes a destination its own reader accepts back", async () => {
    for (const value of ["/admin/products", "/admin/products?page=2&sort=name", ...OFF_ORIGIN.map(([, v]) => v)]) {
      const refusal = await refusalFor(value);
      const params = new URL(refusal.loginHref, "https://admin.example").searchParams;

      // The guard and the sign-in page apply one set of rules, so what the guard writes is what
      // `adminReturnTo` reads, and no round trip turns a validated path into a refusal.
      expect(adminReturnToFromTheGuardModule(params)).toBe(refusal.returnTo);
    }
  });
});

describe("the read is the host's", () => {
  it("resolves a session that is not a cookie, through the resolver it was given", async () => {
    // A header token, a device row, a mobile store: whatever the host calls a session, the guard
    // answers with it unchanged and never reaches for storage of its own.
    const fromHeader: AdminSession = { email: "ada@example.test", role: "admin", device: "pixel-9" };
    const resolver = vi.fn(() => fromHeader);

    await expect(readAdminSession({ session: resolver })).resolves.toBe(fromHeader);
    expect(resolver).toHaveBeenCalledExactlyOnceWith();
  });

  it("returns nothing rather than throwing when the read fails, and tells the host why", async () => {
    const boom = new Error("cookie store down");
    const onError = vi.fn();

    // The non-refusing half: a route handler that answers 401 wants this to be null, not a
    // rejection it has to catch to learn there is no session.
    await expect(
      readAdminSession({
        session: () => {
          throw boom;
        },
        onError,
      }),
    ).resolves.toBeNull();
    expect(onError).toHaveBeenCalledExactlyOnceWith(boom);
  });

  it("is the same read the permission guard asks, so the two cannot disagree", async () => {
    // One resolver behind both guards. A session resolved twice by two different reads is how a
    // page renders an action the server then refuses.
    const app = host(SESSION);
    const seen: AdminSession[] = [];
    const requirePermission = createAdminPermissionGuard({
      rule: (session) => {
        seen.push(session);
        return true;
      },
      session: () => readAdminSession({ session: app.resolver }),
    });

    await expect(requirePermission("products.read")).resolves.toBe(SESSION);
    expect(seen).toEqual([SESSION]);

    app.signOut();
    await expect(requirePermission("products.read")).rejects.toThrow("No session may products.read");
    // One read per question, so a session that changed between the two did not go unnoticed.
    expect(app.resolver).toHaveBeenCalledTimes(2);
  });
});

describe("the two halves agree about who is signed in", () => {
  /** The answer the server gives, as a caller that is not a browser gets it. */
  async function served(app: Host): Promise<AdminSession | null> {
    return app.guard({ returnTo: "/admin/products" }).catch(() => null);
  }

  /** Whether the browser half rendered the protected tree, read off the rendered page. */
  async function viewSays(adapter: AdminAuthAdapter): Promise<boolean> {
    const { unmount } = render(
      <AdminI18nProvider locale="en">
        <AdminAuthProvider adapter={adapter}>
          <AdminRequireSession>
            <span>Invoices</span>
          </AdminRequireSession>
        </AdminAuthProvider>
      </AdminI18nProvider>,
    );
    await waitFor(() => {
      // The checking state renders neither, so a half that never decided fails here rather than
      // being read as a refusal.
      expect(screen.queryByText("Invoices") ?? screen.queryByRole("link"), "the browser never decided")
        .toBeTruthy();
    });
    const rendered = screen.queryByText("Invoices") !== null;
    unmount();
    return rendered;
  }

  it("moves both halves together through a sign-in and a sign-out", async () => {
    const app = host(null);

    expect(await viewSays(app.adapter), "signed out, in the browser").toBe(false);
    expect(await served(app), "signed out, on the server").toBeNull();

    app.signIn();
    expect(await viewSays(app.adapter), "signed in, in the browser").toBe(true);
    await expect(app.guard({ returnTo: "/admin/products" })).resolves.toBe(SESSION);

    app.signOut();
    expect(await viewSays(app.adapter), "signed out again, in the browser").toBe(false);
    expect(await served(app), "signed out again, on the server").toBeNull();
  });

  it("renders the tree exactly when the guard lets the route through", async () => {
    // The same assertion as above, read as an agreement rather than as a sequence, for the one
    // session where the two halves have something to agree about.
    const app = host(SESSION);

    expect(await viewSays(app.adapter)).toBe(true);
    await expect(app.guard({ returnTo: "/admin/products" })).resolves.toBe(SESSION);
  });

  it("serves a page, a route handler and a server action from one guard", async () => {
    const app = host(SESSION);
    let effect = 0;

    // app/billing/page.tsx, a server component
    const page = async () => {
      await app.guard({ returnTo: "/admin/billing" });
      return effect++;
    };
    // app/billing/route.ts, where a refusal is a 401 rather than a redirect
    const handler = async () =>
      (await readAdminSession({ session: app.resolver })) ? effect++ : 401;
    // app/billing/actions.ts, "use server"
    const serverAction = async () => {
      await app.guard({ returnTo: "/admin/billing" });
      return effect++;
    };

    expect(await page()).toBe(0);
    expect(await handler()).toBe(1);
    expect(await serverAction()).toBe(2);
    expect(effect).toBe(3);

    app.signOut();
    await expect(page()).rejects.toThrow(AdminSessionRequiredError);
    expect(await handler()).toBe(401);
    await expect(serverAction()).rejects.toThrow(AdminSessionRequiredError);
    // The work behind the guard is unreachable for a visitor with no session, whichever of the
    // three the host reached for.
    expect(effect).toBe(3);
  });
});

describe("the server path carries no client boundary", () => {
  const root = resolve(import.meta.dirname, "..");
  const isClient = (path: string) => /^\s*["']use client["']/m.test(readFileSync(path, "utf8"));
  const relativeImports = (source: string) =>
    [...source.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)].map((match) => match[1]);
  const specifiers = (source: string) =>
    [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]);
  const relative = (path: string) => path.slice(root.length + 1);

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

  it("keeps the session guard free of the client boundary", () => {
    // A guard a server module cannot import is the failure this milestone exists for, and it
    // surfaces as a build error in someone else's application, so it is checked here instead.
    const modules = reachable("src/shell/session-guard.ts");
    const clientModules = modules.filter(isClient).map(relative);

    expect({ clientModules }, "the server path must not reach a client module").toEqual({
      clientModules: [],
    });
    // A walk that resolved nothing would report nothing and pass, which is the shape of a check
    // that cannot fail.
    expect(modules.length).toBeGreaterThan(2);
  });

  it("can fail: the same walk finds the client module a client entry reaches", () => {
    // The check above is only worth the empty result if this walk is capable of a non-empty one.
    // `src/shell/index.ts` re-exports both halves, so it reaches the client module by name.
    expect(reachable("src/shell/index.ts").filter(isClient).map(relative)).toContain("src/shell/auth.tsx");
  });

  it("sees a directive that is not on the first line", () => {
    // The client module carries its directive on line 2, behind a licence comment. Anchoring the
    // pattern to the start of the file rather than the start of a line would find no client
    // module anywhere, and the assertion above would pass over that empty set.
    const auth = join(root, "src/shell/auth.tsx");
    expect(readFileSync(auth, "utf8").split("\n")[1].trim()).toBe('"use client";');
    expect(isClient(auth)).toBe(true);
  });

  it("reaches for nothing at runtime, so there is no cookie or framework to find", () => {
    const source = readFileSync(join(root, "src/shell/session-guard.ts"), "utf8");
    const imported = specifiers(source);

    // Type-only, relative, and erased. A value import here would be a dependency the read could
    // reach for, which is how a session read grows a cookie or a framework opinion.
    expect(imported.filter((specifier) => !specifier.startsWith(".")), "a bare import").toEqual([]);
    expect(source.match(/^import\s+(?!type\b)/gm) ?? [], "a value import").toEqual([]);
    // A non-empty list, so neither assertion above is true because the walk found nothing.
    expect(imported.length).toBeGreaterThan(0);
  });
});

describe("the browser half is unchanged", () => {
  it("renders the protected tree only for a session, and links onward without one", async () => {
    // The component a host already uses, through the module it already imports, with the
    // destination rules now living somewhere else entirely.
    const app = host(SESSION);
    const { unmount } = render(
      <AdminI18nProvider locale="en">
        <AdminAuthProvider adapter={app.adapter}>
          <AdminRequireSession>
            <span>Invoices</span>
          </AdminRequireSession>
        </AdminAuthProvider>
      </AdminI18nProvider>,
    );

    expect(await screen.findByText("Invoices")).toBeInTheDocument();
    unmount();

    app.signOut();
    render(
      <AdminI18nProvider locale="en">
        <AdminAuthProvider adapter={app.adapter}>
          <AdminRequireSession>
            <span>Invoices</span>
          </AdminRequireSession>
        </AdminAuthProvider>
      </AdminI18nProvider>,
    );

    expect(await screen.findByRole("link", { name: "Go to sign in" })).toHaveAttribute(
      "href",
      "/admin/login?next=%2Fadmin%2Fproducts",
    );
    expect(screen.queryByText("Invoices")).not.toBeInTheDocument();
  });

  it("re-exports one copy of the destination reader, rather than a second set of rules", async () => {
    // Identity, not equality: a copy would answer the same way today and drift the first time
    // either side was changed.
    expect(adminReturnToFromAuth).toBe(adminReturnToFromTheGuardModule);
  });
});
