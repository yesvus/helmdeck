// SPDX-License-Identifier: MIT
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { adminReturnTo, type AdminPersistenceAdapter } from "@yesvus/helmdeck";
import { createMemoryPersistenceAdapter } from "@yesvus/helmdeck/baseline";
import { config, proxy } from "../fixtures/proxy";
import { DEFAULT_AFTER_LOGIN, LOGIN_PATH, requireDemoSession } from "../fixtures/lib/demo-guard";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { SESSION_COOKIE, demoAuth, demoCredentialStore } from "../fixtures/lib/demo-session";
import { seedDemo } from "../fixtures/lib/seed";

/**
 * Where a signed-out visitor is sent back to, asked the way the request asks.
 *
 * The bug was that a layout guards a segment and cannot read the path inside it, so the guard could
 * only name the segment's root and a visitor who opened `/shell/content` came back to `/shell`.
 * The redirect therefore lives in `fixtures/proxy.ts`, and these are its two halves asked directly:
 * what the proxy answers for a request, and what the guard in the layout still refuses. A proxy that
 * merely checked a cookie's presence would pass the first set and fail the second, so both are here
 * rather than one of them being assumed from the other.
 */

const guard = vi.hoisted(() => {
  class RedirectSignal extends Error {}
  return { RedirectSignal, calls: [] as string[] };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    guard.calls.push(url);
    throw new guard.RedirectSignal(url);
  },
}));

const ORIGIN = "https://demo.helmdeck.test";
const APP = resolve(import.meta.dirname, "..", "fixtures", "app");

function filesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path));
    else if (/\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/** A route as a request for it reads, so a dynamic segment is a value rather than a bracket. */
function asRoute(file: string): string {
  const segments = relative(APP, file)
    .replace(/\.tsx?$/, "")
    .split(sep)
    .filter((segment) => segment !== "page" && segment !== "route");
  return `/${segments.map((segment) => (segment.startsWith("[") ? "sample" : segment)).join("/")}`;
}

/** The routes the demo serves, read from its own files rather than from a list kept here. */
function routes(): string[] {
  return filesUnder(APP)
    .filter((file) => /\/(page|route)\.tsx?$/.test(file))
    .map(asRoute)
    .sort();
}

/** The segment roots whose guard is in a layout, which are the segments a layout cannot name. */
function layoutGuardedSegments(): string[] {
  return filesUnder(APP)
    .filter((file) => /[/\\]layout\.tsx$/.test(file))
    .filter((file) => readFileSync(file, "utf8").includes("requireDemoSession"))
    .map((file) => {
      const segments = relative(APP, resolve(file, "..")).split(sep).filter(Boolean);
      return `/${segments.join("/")}`;
    })
    .sort();
}

/** What the proxy answers for a request, in the words the test cares about. */
function answer(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextResponse | undefined {
  return proxy(new NextRequest(`${ORIGIN}${path}`, init));
}

/** The `next` a signed-out visitor would be sent back to, or null when nobody was sent anywhere. */
function destination(path: string, cookie?: string): string | null {
  const response = answer(path, cookie ? { headers: { cookie } } : undefined);
  const location = response?.headers.get("location");
  return location === undefined || location === null
    ? null
    : new URL(location).searchParams.get("next");
}

function sealedCookie(value: string): string {
  return `${SESSION_COOKIE}=${value}`;
}

beforeEach(() => {
  guard.calls.length = 0;
});

describe("the redirect a visitor with no session cookie gets", () => {
  it("carries the page they asked for rather than the root of its segment", () => {
    // The bug, asked one request at a time. Each of these was answering `next=/shell`, so a visitor
    // who opened a page inside the shell was sent to sign in and came back to the shell's root.
    for (const path of [
      "/shell",
      "/shell/content",
      "/shell/revisions",
      "/shell/schedule",
      "/shell/products",
      "/shell/settings/site",
      "/shell/revisions/rev_1",
      "/dashboard",
      "/dashboard/arrange",
    ]) {
      expect(destination(path), path).toBe(path);
    }
  });

  it("carries the query as well, because a list page's filters are where they were too", () => {
    expect(destination("/shell/products?page=2&q=boots")).toBe("/shell/products?page=2&q=boots");
  });

  it("answers with a redirect to the sign-in page rather than a page of its own", () => {
    const response = answer("/shell/content");

    expect(response?.status).toBe(307);
    const location = new URL(response!.headers.get("location")!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe(LOGIN_PATH);
  });

  it("runs on the routes behind a layout guard, and on no other route", () => {
    const guarded = layoutGuardedSegments();
    const served = routes();
    const wrong: string[] = [];

    for (const route of served) {
      const behind = guarded.some((segment) => route === segment || route.startsWith(`${segment}/`));
      if (unstable_doesMiddlewareMatch({ config, url: route }) !== behind) wrong.push(route);
    }

    // The walk has to have found both, so a matcher that stopped matching cannot read as agreement.
    expect(guarded).toEqual(["/dashboard", "/shell"]);
    expect(served.length).toBeGreaterThan(guarded.length);
    expect(wrong).toEqual([]);
  });

  it("names each guarded segment and nothing else, so no route is covered by an entry that is not there", () => {
    // An entry for a segment with no layout guard, or a segment with a layout guard and no entry,
    // is the same defect from either side: a layout that cannot name its own destination.
    expect([...config.matcher].sort()).toEqual(["/dashboard/:path*", "/shell/:path*"]);
  });

  it("refuses to carry a destination that would leave the origin", () => {
    // What a crafted request can put in a path. Each is refused or reduced to something that still
    // resolves here, and the destination that comes out is one the package would accept itself,
    // which is what stops the sign-in page from becoming somewhere else to send a visitor.
    const carried: string[] = [];
    for (const path of [
      "/shell/%5C%5Cevil.example",
      "/shell/%0D%0A/evil.example",
      "/shell/%250D%250A/evil.example",
      "/shell/%2F%2Fevil.example",
      "/shell/https:%2F%2Fevil.example",
      "/shell/%252F%252Fevil.example",
    ]) {
      const next = destination(path);
      carried.push(`${path} -> ${next}`);
      expect(next, path).not.toBeNull();
      expect(adminReturnTo(new URLSearchParams({ next: next! })), path).toBe(next);
      expect(new URL(next!, ORIGIN).origin, path).toBe(ORIGIN);
    }

    // The first three decode to something the package refuses outright, so they fall back to its own
    // answer rather than travelling. Asserted by value: a fallback that stayed `/shell` would be a
    // path the visitor never asked for.
    expect(carried.slice(0, 3)).toEqual([
      "/shell/%5C%5Cevil.example -> /",
      "/shell/%0D%0A/evil.example -> /",
      "/shell/%250D%250A/evil.example -> /",
    ]);
    // And the refused ones did not pass through untouched, which is the property above resting on
    // something having been refused.
    expect(carried.some((line) => line.endsWith(" -> /"))).toBe(true);
  });

  it("says nothing to a request that carries the session cookie, so a signed-in visitor is left alone", () => {
    for (const path of ["/shell", "/shell/content", "/shell/settings/site", "/dashboard/arrange"]) {
      expect(answer(path, { headers: { cookie: sealedCookie("ses_whatever") } }), path).toBeUndefined();
    }
  });

  it("looks for the cookie the demo's own sign-in writes, and for no other", async () => {
    const { auth, cookies } = await harness();
    await auth.login({ email: owner.email, password: DEMO_PASSWORD });
    const sealed = cookies.peek()!;

    // A cookie the demo's session adapter signed, read back through the proxy.
    expect(answer("/shell/content", { headers: { cookie: sealedCookie(sealed) } })).toBeUndefined();
    // The same value under any other name is not a session, and a cookie that is not the session's
    // is not a reason to let a request through either.
    expect(answer("/shell/content", { headers: { cookie: `theme=dark` } })).not.toBeUndefined();
    expect(answer("/shell/content", { headers: { cookie: sealedCookie("") } })).not.toBeUndefined();
  });

  it("leaves a server action's own refusal to the action, which runs its guard", () => {
    // A POST is a server action on the route that owns it. Redirecting it here would forward the
    // body to a sign-in page with no POST handler, so the refusal the action makes is the one that
    // has to survive.
    expect(answer("/shell/products", { method: "POST" })).toBeUndefined();
    expect(answer("/shell/revisions", { method: "PATCH" })).toBeUndefined();
  });
});

describe("the guard the layout keeps", () => {
  it("refuses a cookie nobody signed, which the proxy passed through because it was there", async () => {
    const { store, cookies } = await harness();
    cookies.tamper("ses_chosen_by_the_caller.not-a-signature");

    // The proxy asks whether the cookie is present and nothing about what is in it, which is the
    // only question it is allowed to ask.
    expect(answer("/shell/content", { headers: { cookie: sealedCookie(cookies.peek()!) } })).toBeUndefined();

    await expect(
      requireDemoSession({ store, cookie: cookies.io, returnTo: "/shell/content" }),
    ).rejects.toThrow(guard.RedirectSignal);
    expect(guard.calls).toEqual(["/login?next=%2Fshell%2Fcontent"]);
  });

  it("refuses a real cookie whose signature was altered", async () => {
    const { auth, store, cookies } = await harness();
    await auth.login({ email: owner.email, password: DEMO_PASSWORD });
    const [id, signature] = cookies.peek()!.split(".");
    cookies.tamper(`${id}.${signature.slice(0, -1)}${signature.endsWith("a") ? "b" : "a"}`);

    expect(answer("/shell/content", { headers: { cookie: sealedCookie(cookies.peek()!) } })).toBeUndefined();
    await expect(
      requireDemoSession({ store, cookie: cookies.io, returnTo: "/shell/content" }),
    ).rejects.toThrow(guard.RedirectSignal);
  });

  it("refuses a cookie the server ended, so signing out still refuses the page", async () => {
    const { auth, store, memory, cookies } = await harness();
    await auth.login({ email: owner.email, password: DEMO_PASSWORD });
    const [row] = await memory.query<{ id: string }>("sessions");
    await memory.delete("sessions", row.id);

    expect(answer("/shell/content", { headers: { cookie: sealedCookie(cookies.peek()!) } })).toBeUndefined();
    await expect(
      requireDemoSession({ store, cookie: cookies.io, returnTo: "/shell/content" }),
    ).rejects.toThrow(guard.RedirectSignal);
  });

  it("lets a valid session through, so the cookie the proxy saw is a session and not a name", async () => {
    const { auth, store, cookies } = await harness();
    await auth.login({ email: editor.email, password: DEMO_PASSWORD });

    const session = await requireDemoSession({
      store,
      cookie: cookies.io,
      returnTo: "/shell/content",
    });

    expect(session).toEqual({ email: editor.email, role: "editor" });
    expect(guard.calls).toEqual([]);
  });

  it("refuses a destination that would leave the origin, whatever the caller named", async () => {
    const { store, cookies } = await harness();

    for (const returnTo of ["//evil.example", "https://evil.example/steal", "/\\evil.example"]) {
      await expect(
        requireDemoSession({ store, cookie: cookies.io, returnTo }),
      ).rejects.toThrow(guard.RedirectSignal);
    }

    // The fallback is the package's own rather than the value that was handed over, and what the
    // login page will read back from each of them stays on this origin.
    const carried = guard.calls.map((call) => new URLSearchParams(call.split("?")[1]).get("next")!);
    expect(carried).toEqual(["/", "/", "/"]);
    for (const next of carried) {
      expect(new URL(next, ORIGIN).origin).toBe(ORIGIN);
      expect(adminReturnTo(new URLSearchParams({ next }))).toBe(next);
    }
  });

  it("sends a visitor with no recorded destination to the default rather than nowhere", async () => {
    const { store, cookies } = await harness();

    await expect(requireDemoSession({ store, cookie: cookies.io })).rejects.toThrow(guard.RedirectSignal);

    expect(guard.calls).toEqual([`${LOGIN_PATH}?next=%2F${DEFAULT_AFTER_LOGIN.slice(1)}`]);
  });
});

/**
 * The demo's own session, over the demo's own seeded rows, so a refusal here is the one a request
 * gets rather than one a stand-in produced.
 */
async function harness() {
  const memory = createMemoryPersistenceAdapter();
  await seedDemo(memory as AdminPersistenceAdapter, DEMO_PASSWORD);
  const store = demoCredentialStore(memory as AdminPersistenceAdapter);
  const cookies = jar();
  return { memory, store, cookies, auth: demoAuth({ store, cookie: cookies.io }) };
}

/** A cookie jar for a caller that passes its own cookie instead of going through `next/headers`. */
function jar() {
  let value: string | undefined;
  const io = {
    read: () => value,
    write: (next: string) => {
      value = next;
    },
    clear: () => {
      value = undefined;
    },
  };
  return { io, peek: () => value, tamper: (next: string) => (value = next) };
}

const [owner, editor] = demoAccounts;
