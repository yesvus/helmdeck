// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import {
  createAuditAdapter,
  createCacheAdapter,
  createMemoryPersistenceAdapter,
  createSessionAuthAdapter,
} from "../src/baseline";
import type { AdminSessionCookieIO } from "../src/baseline";

/** An in-memory cookie jar standing in for the request's cookie store. */
function jar(initial?: string) {
  let value = initial;
  const writes: string[] = [];
  const clears: string[] = [];
  const io: AdminSessionCookieIO = {
    read: () => value,
    write: (next) => {
      value = next;
      writes.push(next);
    },
    clear: () => {
      value = undefined;
      clears.push("cleared");
    },
  };
  return {
    io,
    writes,
    clears,
    peek: () => value,
    tamper: (next: string) => {
      value = next;
    },
  };
}

const user = { email: "ada@example.com", name: "Ada", role: "editor" };
const SECRET = "a-secret-long-enough-to-be-worth-having";

describe("createSessionAuthAdapter", () => {
  it("refuses to be built without a secret", () => {
    expect(() =>
      createSessionAuthAdapter({ verify: () => "s1", getUser: () => user, secret: "" }),
    ).toThrow(/secret/);
  });

  it("reports no session when there is no cookie", async () => {
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      secret: SECRET,
      cookie: jar().io,
    });

    expect(await auth.getSession()).toBeNull();
  });

  it("signs in, and the cookie it writes resolves back to the same session", async () => {
    const cookies = jar();
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      secret: SECRET,
      cookie: cookies.io,
    });

    const result = await auth.login({ email: "ada@example.com", password: "hunter2" });
    expect(result).toEqual({ ok: true, session: user });
    expect(await auth.getSession()).toEqual(user);
  });

  it("refuses credentials the host rejects, and writes no cookie", async () => {
    const cookies = jar();
    const auth = createSessionAuthAdapter({
      verify: () => null,
      getUser: () => user,
      secret: SECRET,
      cookie: cookies.io,
      invalidMessage: "No.",
    });

    expect(await auth.login({ email: "ada@example.com", password: "wrong" })).toEqual({
      ok: false,
      message: "No.",
    });
    expect(cookies.writes).toEqual([]);
  });

  it("refuses when the id resolves to no user", async () => {
    const cookies = jar();
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => null,
      secret: SECRET,
      cookie: cookies.io,
    });

    expect((await auth.login({ email: "a", password: "b" })).ok).toBe(false);
    expect(cookies.writes).toEqual([]);
  });

  it("tells the host which session was established, and that it ended", async () => {
    const onSession = vi.fn();
    const cookies = jar();
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      onSession,
      secret: SECRET,
      cookie: cookies.io,
    });

    await auth.login({ email: "a", password: "b" });
    await auth.logout();
    expect(onSession.mock.calls).toEqual([["s1"], [null]]);
  });

  it("clears the cookie on sign-out", async () => {
    const cookies = jar();
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      secret: SECRET,
      cookie: cookies.io,
    });
    await auth.login({ email: "a", password: "b" });
    expect(cookies.peek()).toBeDefined();

    await auth.logout();
    expect(cookies.peek()).toBeUndefined();
    expect(cookies.clears).toHaveLength(1);
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookies = jar();
    const attacker = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      secret: "a-completely-different-secret",
      cookie: cookies.io,
    });
    await attacker.login({ email: "a", password: "b" });

    const honest = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      secret: SECRET,
      cookie: cookies.io,
    });
    expect(await honest.getSession()).toBeNull();
  });

  it("rejects a cookie whose id was edited, even with a valid-looking shape", async () => {
    const cookies = jar();
    const getUser = vi.fn((id: string) => (id === "s1" ? user : null));
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser,
      secret: SECRET,
      cookie: cookies.io,
    });
    await auth.login({ email: "a", password: "b" });
    const [sessionId, signature] = (cookies.peek() ?? "").split(".");
    expect(sessionId).toBe("s1");

    // Swap in an administrator id, keeping the original signature.
    cookies.tamper(`root.${signature}`);
    expect(await auth.getSession()).toBeNull();
    // Asserted rather than implied: a forged id must never reach the host's lookup, which is
    // what stops the cookie being used to probe which sessions exist.
    expect(getUser).not.toHaveBeenCalledWith("root", expect.anything());
  });

  it("rejects a signature of the wrong length", async () => {
    // Compared by content, not by shape, so a truncated signature cannot pass the length
    // check and skip the comparison.
    const cookies = jar("s1.abc");
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      secret: SECRET,
      cookie: cookies.io,
    });

    expect(await auth.getSession()).toBeNull();
  });

  it("rejects a cookie with no signature at all", async () => {
    const cookies = jar("s1");
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      secret: SECRET,
      cookie: cookies.io,
    });

    expect(await auth.getSession()).toBeNull();
  });

  it("rejects a cookie that is only a signature", async () => {
    const cookies = jar(".onlyasignature");
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      secret: SECRET,
      cookie: cookies.io,
    });

    expect(await auth.getSession()).toBeNull();
  });

  it("reports a session store failure through onError, so an outage is not a silent sign-out", async () => {
    // Without this the swallow is indistinguishable from a visitor signing out, and a broken
    // session store reads as "logged out" for everyone, forever.
    const onError = vi.fn();
    const cookies = jar();
    // Signing in has to work, so the failure is on the read that follows it.
    let reads = 0;
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => {
        reads += 1;
        if (reads > 1) throw new Error("session store down");
        return user;
      },
      onError,
      secret: SECRET,
      cookie: cookies.io,
    });
    await auth.login({ email: "a", password: "b" });

    expect(await auth.getSession()).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("does not store a cookie when the host's own bookkeeping fails", async () => {
    // The reverse order wrote the cookie first, so a failing callback rejected login with the
    // browser already signed in and the provider still anonymous.
    const cookies = jar();
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      onSession: () => {
        throw new Error("session store write failed");
      },
      secret: SECRET,
      cookie: cookies.io,
    });

    await expect(auth.login({ email: "a", password: "b" })).rejects.toThrow(/write failed/);
    expect(cookies.writes).toEqual([]);
  });

  it("says so plainly when used in a browser without a cookie store", async () => {
    // The default store reads an HTTP-only cookie through next/headers, which does not run in
    // a browser, and AdminAuthProvider is a client component. Silently returning nothing would
    // look like a visitor who is simply signed out.
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      secret: SECRET,
    });

    await expect(auth.getSession()).rejects.toThrow(/server-side/);
  });

  it("reads as signed out when the session store throws, rather than propagating", async () => {
    // The provider treats a thrown read as a failure to decide; this adapter would otherwise
    // hand it an exception on every render.
    const cookies = jar();
    const auth = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => user,
      secret: SECRET,
      cookie: cookies.io,
    });
    await auth.login({ email: "a", password: "b" });

    const broken = createSessionAuthAdapter({
      verify: () => "s1",
      getUser: () => {
        throw new Error("session store down");
      },
      secret: SECRET,
      cookie: cookies.io,
    });
    expect(await broken.getSession()).toBeNull();
  });

  it("signs an id containing a dot without being able to be re-split", async () => {
    // The separator is the last dot, so an id may contain them and still round-trip.
    const dotted = { email: "odd@example.com" };
    const cookies = jar();
    const auth = createSessionAuthAdapter({
      verify: () => "a.b.c",
      getUser: (id) => (id === "a.b.c" ? dotted : null),
      secret: SECRET,
      cookie: cookies.io,
    });

    await auth.login({ email: "a", password: "b" });
    expect(await auth.getSession()).toEqual(dotted);
  });
});

describe("createMemoryPersistenceAdapter", () => {
  it("creates with an id and reads it back", async () => {
    const db = createMemoryPersistenceAdapter();
    const created = await db.create<{ id: string; title: string }>("posts", { title: "Hello" });

    expect(created.id).toBeTruthy();
    expect(await db.read<{ title: string }>("posts", created.id)).toEqual({ id: created.id, title: "Hello" });
  });

  it("keeps an id the caller supplies, so a seeded row stays where the seed expects it", async () => {
    const db = createMemoryPersistenceAdapter();
    const created = await db.create<{ id: string; title: string }>("posts", { id: "post_1", title: "Hello" });

    expect(created.id).toBe("post_1");
    expect(await db.read("posts", "post_1")).toEqual({ id: "post_1", title: "Hello" });
  });

  it("refuses a second record under an id that is already in use", async () => {
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { id: "post_1", title: "Hello" });

    await expect(db.create("posts", { id: "post_1", title: "Again" })).rejects.toThrow(/post_1/);
    expect(await db.query("posts")).toHaveLength(1);
  });

  it("returns null for a record that is not there", async () => {
    const db = createMemoryPersistenceAdapter();
    expect(await db.read("posts", "nope")).toBeNull();
  });

  it("queries on exact field matches", async () => {
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "A", published: true });
    await db.create("posts", { title: "B", published: false });

    expect(await db.query("posts", { published: true })).toHaveLength(1);
    expect(await db.query("posts")).toHaveLength(2);
  });

  it("matches no records for a query nothing satisfies", async () => {
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "A" });
    expect(await db.query("posts", { title: "Z" })).toEqual([]);
  });

  it("updates in place and keeps the id", async () => {
    const db = createMemoryPersistenceAdapter();
    const created = await db.create<{ id: string }>("posts", { title: "A" });

    const updated = await db.update<{ id: string; title: string }>("posts", created.id, { id: "hijacked", title: "B" });
    expect(updated.id).toBe(created.id);
    expect(await db.read("posts", created.id)).toEqual({ id: created.id, title: "B" });
  });

  it("throws when updating a record that is not there", async () => {
    const db = createMemoryPersistenceAdapter();
    await expect(db.update("posts", "nope", {})).rejects.toThrow(/nope/);
  });

  it("deletes a record and is a no-op for one that is not there", async () => {
    const db = createMemoryPersistenceAdapter();
    const created = await db.create<{ id: string; title: string }>("posts", { title: "A" });

    await db.delete("posts", created.id);
    expect(await db.read("posts", created.id)).toBeNull();
    await expect(db.delete("posts", created.id)).resolves.toBeUndefined();
  });

  it("hands out copies, so a caller cannot edit stored state behind update's back", async () => {
    const db = createMemoryPersistenceAdapter();
    const created = await db.create<{ id: string; title: string }>("posts", { title: "A" });

    created.title = "edited outside the adapter";
    expect((await db.read<{ title: string }>("posts", created.id))?.title).toBe("A");

    const listed = await db.query<{ title: string }>("posts");
    listed[0].title = "also outside";
    expect((await db.read<{ title: string }>("posts", created.id))?.title).toBe("A");
  });

  it("copies nested values on the way in, not just the top level", async () => {
    const db = createMemoryPersistenceAdapter();
    const tags = { primary: ["a"] };
    const created = await db.create<{ id: string; tags: { primary: string[] } }>("posts", { tags });

    tags.primary.push("b");
    expect((await db.read<{ tags: { primary: string[] } }>("posts", created.id))?.tags.primary).toEqual(["a"]);

    const replacement = { primary: ["c"] };
    await db.update("posts", created.id, { tags: replacement });
    replacement.primary.push("d");
    expect((await db.read<{ tags: { primary: string[] } }>("posts", created.id))?.tags.primary).toEqual(["c"]);
  });

  it("does not generate an id that a seeded record already uses", async () => {
    // Otherwise two records share an id and every read, update and delete addresses the first.
    const db = createMemoryPersistenceAdapter({ posts: [{ id: "mem_1", title: "Seeded" }] });
    const created = await db.create<{ id: string }>("posts", { title: "Generated" });

    expect(created.id).not.toBe("mem_1");
    expect(await db.read("posts", "mem_1")).toEqual({ id: "mem_1", title: "Seeded" });
    expect(await db.read("posts", created.id)).toEqual({ id: created.id, title: "Generated" });
  });

  it("gives each created record a distinct id", async () => {
    const db = createMemoryPersistenceAdapter();
    const ids = new Set<string>();
    for (let i = 0; i < 5; i += 1) ids.add((await db.create<{ id: string }>("posts", { i })).id);
    expect(ids.size).toBe(5);
  });

  it("keeps resources apart from each other", async () => {
    const db = createMemoryPersistenceAdapter();
    await db.create("posts", { title: "A" });
    await db.create("pages", { title: "B" });

    expect(await db.query("posts")).toHaveLength(1);
    expect(await db.query("pages")).toHaveLength(1);
    expect(await db.query("comments")).toEqual([]);
  });

  it("seeds from a literal and resets on demand", async () => {
    const db = createMemoryPersistenceAdapter({ posts: [{ id: "p1", title: "Seeded" }] });
    expect(await db.query("posts")).toEqual([{ id: "p1", title: "Seeded" }]);

    db.reset("posts", [{ id: "p2", title: "Reset" }]);
    expect(await db.query("posts")).toEqual([{ id: "p2", title: "Reset" }]);
    db.clear();
    expect(await db.query("posts")).toEqual([]);
  });
});

describe("createAuditAdapter", () => {
  it("passes the event to the sink", async () => {
    const sink = vi.fn();
    const audit = createAuditAdapter({ sink });
    const event = { action: "update", resource: "posts", resourceId: "p1" };

    await audit.record(event);
    expect(sink).toHaveBeenCalledWith(event);
  });

  it("does not fail the action when the sink does", async () => {
    // The visitor's change already happened; a logging problem must not surface as an error
    // on a successful save.
    const onError = vi.fn();
    const audit = createAuditAdapter({
      sink: () => {
        throw new Error("log sink down");
      },
      onError,
    });

    await expect(audit.record({ action: "update", resource: "posts" })).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("createCacheAdapter", () => {
  it("invalidates the whole resource when no record is named", async () => {
    const invalidate = vi.fn();
    const cache = createCacheAdapter({ invalidate });

    await cache.invalidate({ resource: "posts", operation: "create" });
    expect(invalidate).toHaveBeenCalledWith(["posts"]);
  });

  it("invalidates the record when one is named", async () => {
    const invalidate = vi.fn();
    const cache = createCacheAdapter({ invalidate });

    await cache.invalidate({ resource: "posts", resourceId: "p1", operation: "update" });
    expect(invalidate).toHaveBeenCalledWith(["posts:p1"]);
  });

  it("does not fail the action when invalidation does", async () => {
    const onError = vi.fn();
    const cache = createCacheAdapter({
      invalidate: () => {
        throw new Error("cache down");
      },
      onError,
    });

    await expect(
      cache.invalidate({ resource: "posts", operation: "delete" }),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), ["posts"]);
  });
});
