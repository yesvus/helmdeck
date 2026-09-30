// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createCredentialAuthAdapter,
  createLoginThrottle,
  createMemoryPersistenceAdapter,
  createPersistenceCredentialStore,
  createSessionAuthAdapter,
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLED_MESSAGE,
  forwardedClientKey,
  hashPassword,
  loginHeader,
} from "../src/baseline";
import type {
  AdminLoginAttempt,
  AdminLoginThrottle,
  AdminSessionCookieIO,
} from "../src/baseline";

/**
 * The bound on a login form nobody can guess at without limit, each test named after the property
 * it holds rather than after the function it calls.
 *
 * The clock is injected everywhere and nothing here waits: a test that sleeps for a window is a
 * test that is fifteen minutes long in CI and flaky on a loaded machine.
 */

const SECRET = "a-session-secret-long-enough-to-sign-with";
const PASSWORD = "correct horse battery staple";
const EMAIL = "owner@demo.helmdeck.dev";
const WINDOW = 15 * 60 * 1000;

/** A cookie jar standing in for the request's own cookie store. */
function jar(initial?: string) {
  let value = initial;
  const writes: string[] = [];
  const io: AdminSessionCookieIO = {
    read: () => value,
    write: (next) => {
      value = next;
      writes.push(next);
    },
    clear: () => {
      value = undefined;
    },
  };
  return { io, writes, peek: () => value };
}

/** A clock the test moves by hand, so nothing waits for a window to pass. */
function clock(start = 1_700_000_000_000) {
  let value = start;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

/** Headers as `next/headers` hands them, so the key function is exercised on the real shape. */
function headers(values: Record<string, string>) {
  return {
    get: (name: string) => values[name.toLowerCase()] ?? null,
  };
}

function attempt(email = EMAIL, forwarded?: string): AdminLoginAttempt {
  return {
    credentials: { email, password: "whatever" },
    headers: forwarded === undefined ? headers({}) : headers({ "x-forwarded-for": forwarded }),
  };
}

/** A throttle whose counts are per attempt email, so a test means one key when it says one. */
function throttle(options: { limit?: number; now?: () => number; windowMs?: number; reservationMs?: number } = {}) {
  return createLoginThrottle({
    clientKey: (a) => a.credentials.email,
    ...options,
  });
}

/** A session adapter over a spy, which is how a test proves the password was never read. */
function adapter(options: {
  verify?: (credentials: { email: string; password: string }) => Promise<string | null>;
  throttle?: AdminLoginThrottle;
  invalidMessage?: string;
} = {}) {
  const cookies = jar();
  const verify =
    options.verify ?? vi.fn(async (credentials: { email: string; password: string }) =>
      credentials.password === PASSWORD ? "s1" : null,
    );
  const auth = createSessionAuthAdapter({
    secret: SECRET,
    cookie: cookies.io,
    verify,
    getUser: () => ({ email: EMAIL, role: "admin" }),
    ...(options.throttle ? { throttle: options.throttle } : {}),
    ...(options.invalidMessage ? { invalidMessage: options.invalidMessage } : {}),
  });
  return { auth, cookies, verify };
}

/** Eight refusals, which is what brings the ninth attempt to the limit. */
async function exhaust(target: {
  auth: { login: (c: { email: string; password: string }) => Promise<unknown> };
}) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await target.auth.login({ email: EMAIL, password: `wrong-${attempt}` });
    expect(result).toEqual({ ok: false, message: "Those credentials were not accepted." });
  }
}

describe("property 1: the refusal comes before the credential check", () => {
  it("never reaches the host's verify, so a locked-out attempt derives nothing", async () => {
    const bound = throttle();
    const target = adapter({ throttle: bound });
    await exhaust(target);

    const result = await target.auth.login({ email: EMAIL, password: PASSWORD });

    // Spied on rather than inferred from the message: a refusal delivered after `verify` would
    // return exactly this string, and the whole cost of the bound is that it does not.
    expect(target.verify).toHaveBeenCalledTimes(8);
    expect(result).toEqual({ ok: false, message: DEFAULT_THROTTLED_MESSAGE });
  });

  it("never reaches the password comparison itself, in the credential adapter", async () => {
    // The shipped password check is where the CPU goes, so this is the assertion that matters for
    // the adapter a host is most likely to adopt: the refusal is delivered before scrypt runs.
    const db = createMemoryPersistenceAdapter();
    const store = createPersistenceCredentialStore(db);
    await db.create<Record<string, unknown>>("users", {
      email: EMAIL,
      password_hash: await hashPassword(PASSWORD),
      role: "admin",
    });

    let comparisons = 0;
    const counted = { ...store, findUserByEmail: async (...args: Parameters<typeof store.findUserByEmail>) => {
      const found = await store.findUserByEmail(...args);
      // Counted at the row that carries the hash, so the answer is about the password check and
      // not about a lookup the host could do without ever touching a hash.
      if (found) comparisons += 1;
      return found;
    }};
    const cookies = jar();
    const auth = createCredentialAuthAdapter({
      secret: SECRET,
      store: counted,
      cookie: cookies.io,
      throttle: throttle(),
    });

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await auth.login({ email: EMAIL, password: `wrong-${attempt}` });
    }
    comparisons = 0;

    const result = await auth.login({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ ok: false, message: DEFAULT_THROTTLED_MESSAGE });
    expect(comparisons).toBe(0);
    expect(cookies.writes).toEqual([]);
  });

  it("asks before it verifies, rather than recording the outcome and refusing afterwards", async () => {
    const order: string[] = [];
    const bound: AdminLoginThrottle = {
      check: () => {
        order.push("check");
        return "no";
      },
      failed: () => {
        order.push("failed");
      },
      succeeded: () => {
        order.push("succeeded");
      },
    };
    const target = adapter({
      throttle: bound,
      verify: async () => {
        order.push("verify");
        return "s1";
      },
    });

    await target.auth.login({ email: EMAIL, password: PASSWORD });

    expect(order).toEqual(["check"]);
  });

  it("clears the count when the right password arrives, so a typo is not a lockout", async () => {
    const bound = throttle({ limit: 2 });
    const target = adapter({ throttle: bound });

    await target.auth.login({ email: EMAIL, password: "wrong" });
    await target.auth.login({ email: EMAIL, password: "wrong" });
    // Two failures is the limit, so the next attempt is refused and the right password does not
    // save it. That is the bound doing its job.
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: DEFAULT_THROTTLED_MESSAGE,
    });

    // A sign-in that gets inside the limit clears the key, so somebody who fumbles once or twice
    // and then types it correctly is not one typo away from being locked out of their own
    // account for a quarter of an hour.
    const fresh = adapter({ throttle: throttle({ limit: 2 }) });
    await fresh.auth.login({ email: EMAIL, password: "wrong" });
    expect((await fresh.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
    await fresh.auth.login({ email: EMAIL, password: "wrong" });
    await fresh.auth.login({ email: EMAIL, password: "wrong" });
    expect(await fresh.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: DEFAULT_THROTTLED_MESSAGE,
    });
  });
});

describe("property 2: a refusal names the throttle, and is not the credentials message", () => {
  it("says what happened rather than what the visitor typed", async () => {
    const target = adapter({ throttle: throttle() });
    await exhaust(target);

    const refused = await target.auth.login({ email: EMAIL, password: "wrong" });
    const wrongPassword = await adapter().auth.login({ email: EMAIL, password: "wrong" });

    expect(refused).toEqual({ ok: false, message: DEFAULT_THROTTLED_MESSAGE });
    expect(refused).not.toEqual(wrongPassword);
    expect(String((refused as { message: string }).message)).toMatch(/too many|wait|attempt/i);
  });

  it("takes the host's own wording, and keeps refusing", async () => {
    const bound = createLoginThrottle({
      limit: 1,
      clientKey: (a) => a.credentials.email,
      message: "Try again after the coffee.",
    });
    const target = adapter({ throttle: bound });

    await target.auth.login({ email: EMAIL, password: "wrong" });
    expect(await target.auth.login({ email: EMAIL, password: "wrong" })).toEqual({
      ok: false,
      message: "Try again after the coffee.",
    });
  });

  it("does not extend the window, so a held-down button cannot lock an account out for ever", async () => {
    const time = clock();
    const bound = throttle({ limit: 1, now: time.now });
    const target = adapter({ throttle: bound });
    await target.auth.login({ email: EMAIL, password: "wrong" });

    for (let i = 0; i < 50; i += 1) {
      expect(await target.auth.login({ email: EMAIL, password: "wrong" })).toEqual({
        ok: false,
        message: DEFAULT_THROTTLED_MESSAGE,
      });
      time.advance(1000);
    }

    // The window ran from the failure that filled it, so a refused attempt pushing it forward
    // would be the lockout itself rather than a bound on guessing.
    time.advance(WINDOW);
    expect((await target.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
  });

  it("starts the window at the first failure, so a later one cannot push it out", async () => {
    // The test above only reaches `failed` once, so it holds against a refused attempt reaching
    // the window and says nothing about a *recorded* failure doing it. This is the same property
    // from the other side: two failures a full window apart, and the key is served as soon as the
    // first one's window closes rather than a window after the second.
    const time = clock();
    const bound = throttle({ limit: 2, now: time.now });
    const target = adapter({ throttle: bound });

    await target.auth.login({ email: EMAIL, password: "wrong-0" });
    // Inside the first window, so this failure lands on a live entry rather than opening a new one.
    time.advance(WINDOW - 1);
    await target.auth.login({ email: EMAIL, password: "wrong-1" });
    // Two failures on a limit of two, so the key is at its bound and refuses.
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: DEFAULT_THROTTLED_MESSAGE,
    });

    // One millisecond after the first failure's window, not a window after the second.
    time.advance(1);
    expect((await target.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
  });
});

describe("property 3: an address with no account is refused exactly as one that has one", () => {
  it("gives an unknown address the same refusal, the same words and the same count", async () => {
    const bound = throttle();
    const target = adapter({ throttle: bound });

    // Eight attempts against an address nobody holds, then the ninth.
    for (let i = 0; i < 8; i += 1) {
      await target.auth.login({ email: "nobody@demo.helmdeck.dev", password: `wrong-${i}` });
    }
    const unknown = await target.auth.login({
      email: "nobody@demo.helmdeck.dev",
      password: PASSWORD,
    });

    // And the same sequence against an address that does hold one, counted separately.
    const other = adapter({ throttle: throttle() });
    for (let i = 0; i < 8; i += 1) {
      await other.auth.login({ email: EMAIL, password: `wrong-${i}` });
    }
    const known = await other.auth.login({ email: EMAIL, password: PASSWORD });

    // Equal answers, not merely two refusals. A throttle keyed on the account becomes the account
    // oracle `authenticate` exists to prevent the moment the two answers differ.
    expect(unknown).toEqual(known);
    expect(unknown).toEqual({ ok: false, message: DEFAULT_THROTTLED_MESSAGE });
  });

  it("keeps the decoy path intact: an unknown address still costs a password check", async () => {
    // The throttle must not short-circuit the enumeration defence. `authenticate` answers an
    // unknown address by hashing a decoy, and a throttle that refused early, or that skipped the
    // credential call, would turn that equal answer into a fast one.
    const db = createMemoryPersistenceAdapter();
    const store = createPersistenceCredentialStore(db);
    await db.create<Record<string, unknown>>("users", {
      email: EMAIL,
      password_hash: await hashPassword(PASSWORD),
      role: "admin",
    });
    let lookups = 0;
    const counted = {
      ...store,
      findUserByEmail: async (...args: Parameters<typeof store.findUserByEmail>) => {
        lookups += 1;
        return store.findUserByEmail(...args);
      },
    };
    const auth = createCredentialAuthAdapter({
      secret: SECRET,
      store: counted,
      cookie: jar().io,
      throttle: createLoginThrottle({
        clientKey: (a) => loginHeader(a.headers, "x-forwarded-for") ?? a.credentials.email,
      }),
    });

    // One attempt against a held address and one against a free one, both below the limit, both
    // answered by `authenticate`, so the unknown one paid for a decoy hash.
    const held = await auth.login({ email: EMAIL, password: "wrong" });
    const free = await auth.login({ email: "nobody@demo.helmdeck.dev", password: "wrong" });

    expect(held).toEqual(free);
    expect(lookups).toBe(2);
  });

  it("reports the throttle for an address nobody holds, because the count is not the store's", async () => {
    const target = adapter({ throttle: throttle() });
    const unknown = "nobody@demo.helmdeck.dev";
    for (let i = 0; i < 8; i += 1) {
      expect(await target.auth.login({ email: unknown, password: `wrong-${i}` })).toEqual({
        ok: false,
        message: "Those credentials were not accepted.",
      });
    }

    // `verify` here never consults a store, and the ninth attempt is refused before it is asked.
    // A bound that had to look an account up to count an attempt would be answering a question
    // about this address, and the refusal would be that answer.
    const result = await target.auth.login({ email: unknown, password: PASSWORD });
    expect(result).toEqual({ ok: false, message: DEFAULT_THROTTLED_MESSAGE });
    expect(target.verify).toHaveBeenCalledTimes(8);
  });
});

describe("property 4: the window lapses with no timer and no sweep", () => {
  it("serves a key again once its window has passed", async () => {
    const time = clock();
    const bound = throttle({ now: time.now });
    const target = adapter({ throttle: bound });
    await exhaust(target);
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: DEFAULT_THROTTLED_MESSAGE,
    });

    // One millisecond short of the window it is still refused.
    time.advance(WINDOW - 1);
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: DEFAULT_THROTTLED_MESSAGE,
    });

    time.advance(1);
    expect((await target.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
    // The count starts again from the sign-in that worked, rather than carrying the eight behind
    // it, so a window that lapses does not leave the next eight failures short of the bound.
    for (let i = 0; i < 8; i += 1) {
      expect(await target.auth.login({ email: EMAIL, password: `wrong-${i}` })).toEqual({
        ok: false,
        message: "Those credentials were not accepted.",
      });
    }
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: DEFAULT_THROTTLED_MESSAGE,
    });
  });

  it("starts no timer, so nothing keeps a process alive or has to be torn down", async () => {
    // Spied on before the throttle is built, which is the only order that means anything: a
    // sweep would be armed inside `createLoginThrottle`, so a spy installed afterwards would
    // watch the wrong part of the test and pass.
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const setTimeout = vi.spyOn(globalThis, "setTimeout");
    const time = clock();
    const bound = throttle({ now: time.now });
    const target = adapter({ throttle: bound });
    await exhaust(target);

    await target.auth.login({ email: EMAIL, password: PASSWORD });
    time.advance(WINDOW);
    await target.auth.login({ email: EMAIL, password: PASSWORD });

    expect(setInterval).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();
  });

  it("does not hold an entry for a key nobody looks at again", async () => {
    // A long-lived store has to be swept on a schedule; an in-process one has to be small. The
    // window lapsing on the next read is what keeps it small, and this is the only way to see
    // the count without a sweep to expose it.
    const time = clock();
    const bound = throttle({ now: time.now });
    for (let i = 0; i < 20; i += 1) {
      await bound.failed(attempt(`visitor-${i}@demo.helmdeck.dev`));
    }
    const seen: string[] = [];
    const sized = {
      ...bound,
      check: (a: AdminLoginAttempt) => {
        seen.push(a.credentials.email);
        return bound.check(a);
      },
    };

    // Every one of those twenty keys is asked again well after its window, which is the only
    // moment anything reads it, so none of them may still be in force.
    time.advance(WINDOW * 2);
    for (let i = 0; i < 20; i += 1) {
      expect(await sized.check(attempt(`visitor-${i}@demo.helmdeck.dev`))).toBeNull();
    }
    expect(seen).toHaveLength(20);
  });
});

describe("property 5: keys do not share a count", () => {
  it("counts two keys separately, and refuses only the one that reached the limit", async () => {
    const bound = throttle({ limit: 2 });
    const target = adapter({ throttle: bound });
    const other = adapter({ throttle: bound });
    const stranger = "editor@demo.helmdeck.dev";

    await target.auth.login({ email: EMAIL, password: "wrong" });
    await target.auth.login({ email: EMAIL, password: "wrong" });

    // The key that reached the limit is refused, the key that did not is served, and neither is
    // a consequence of the other: eight failures under one key are eight under that key.
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: DEFAULT_THROTTLED_MESSAGE,
    });
    expect((await other.auth.login({ email: stranger, password: PASSWORD })).ok).toBe(true);
    expect(target.verify).toHaveBeenCalledTimes(2);
  });

  it("reads the first address in a forwarded chain, so a chain cannot be split into keys", async () => {
    const bound = createLoginThrottle({
      limit: 1,
      clientKey: (a) => forwardedClientKey(a),
    });

    // The same client, adding hops, is still one client. Reading the last hop instead would let
    // anyone past the first proxy present a new key per attempt.
    await bound.failed({
      credentials: { email: EMAIL, password: "x" },
      headers: headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }),
    });
    const second = await bound.check({
      credentials: { email: EMAIL, password: "x" },
      headers: headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.9, 10.0.0.1" }),
    });

    expect(second).toBe(DEFAULT_THROTTLED_MESSAGE);
  });

  it("falls back to the account when nothing identifies the client, rather than to nothing", async () => {
    // A key that resolved to `undefined` would put every key in one bucket and throttle everyone
    // together, or worse, throw. Both are worse than a per-account bound, which is at least real.
    expect(forwardedClientKey(attempt())).toBe(EMAIL);
    expect(forwardedClientKey(attempt("  OWNER@DEMO.HELMDECK.DEV  "))).toBe(EMAIL);
    expect(forwardedClientKey(attempt(EMAIL, "203.0.113.9"))).toBe("203.0.113.9");
    // A header of nothing but separators: `[0]` is `""`, and a key of "" is one bucket for all.
    expect(forwardedClientKey(attempt(EMAIL, " , , "))).toBe(EMAIL);
    expect(forwardedClientKey(attempt(EMAIL, "  198.51.100.7  , 10.0.0.1"))).toBe("198.51.100.7");
  });

  it("reads a header a plain record holds, because not every host has next/headers", async () => {
    // Node's `req.headers` is a record with string arrays in it, and a `get` is not on it.
    const attemptOn = (headers: AdminLoginAttempt["headers"]) =>
      forwardedClientKey({ credentials: { email: EMAIL, password: "x" }, headers });

    expect(attemptOn({ "x-forwarded-for": "203.0.113.9" })).toBe("203.0.113.9");
    expect(attemptOn({ "x-forwarded-for": ["203.0.113.9", "10.0.0.1"] })).toBe("203.0.113.9");
    expect(attemptOn({ "x-real-ip": "203.0.113.10" })).toBe("203.0.113.10");
    expect(attemptOn({})).toBe(EMAIL);
  });
});

/** Twenty at once, which is the shape a script sends and a person typing cannot. */
const BURST = 20;

describe("property 7: attempts arriving together share one budget", () => {
  it("stops a burst at the limit, so the comparisons stay within it", async () => {
    // The count that matters is the one at the row carrying the hash. A throttle that refused all
    // twenty would also report twenty refusals, so refusals are counted separately below and the
    // assertion here is on the attempts that got as far as being checked.
    const db = createMemoryPersistenceAdapter();
    const store = createPersistenceCredentialStore(db);
    await db.create<Record<string, unknown>>("users", {
      email: EMAIL,
      password_hash: await hashPassword(PASSWORD),
      role: "admin",
    });

    let comparisons = 0;
    const counted = { ...store, findUserByEmail: async (...args: Parameters<typeof store.findUserByEmail>) => {
      const found = await store.findUserByEmail(...args);
      if (found) comparisons += 1;
      return found;
    }};
    const auth = createCredentialAuthAdapter({
      secret: SECRET,
      store: counted,
      cookie: jar().io,
      throttle: throttle(),
    });

    // Started together rather than awaited one by one. Sequentially the first failure is recorded
    // before the ninth check runs, which is the case the bound always held and the reason this
    // test exists: with `await` inside the loop the burst cannot happen and the bug cannot show.
    const results = await Promise.all(
      Array.from({ length: BURST }, (_, i) =>
        auth.login({ email: EMAIL, password: `wrong-${i}` }),
      ),
    );

    expect(comparisons).toBeLessThanOrEqual(DEFAULT_THROTTLE_LIMIT);
    // The other end of the bound, because a throttle refusing everything also satisfies the
    // assertion above while letting nobody in at all.
    expect(comparisons).toBeGreaterThan(0);
    expect(results.filter((r) => r.ok)).toHaveLength(0);

    const refused = results.filter((r) => !r.ok && r.message === DEFAULT_THROTTLED_MESSAGE);
    const wrong = results.filter((r) => !r.ok && r.message === "Those credentials were not accepted.");
    expect(refused).toHaveLength(BURST - comparisons);
    expect(refused.length + wrong.length).toBe(BURST);
  });

  it("measures the burst against the limit a host set, not against a fixed eight", async () => {
    // The bound is per key, so a raised limit raises the number that gets through rather than
    // leaving a fixed eight: three is a limit, twenty is not.
    const bound = throttle({ limit: 3 });
    const target = adapter({ throttle: bound });

    await Promise.all(
      Array.from({ length: BURST }, (_, i) =>
        target.auth.login({ email: EMAIL, password: `wrong-${i}` }),
      ),
    );

    expect(target.verify).toHaveBeenCalledTimes(3);
  });

  it("counts a burst of failures the way it counts the same failures one at a time", async () => {
    // Concurrency must not change the accounting, only the moment it happens. Ten wrong answers
    // sent together and ten sent one after another have to leave the key in the same place.
    const together = adapter({ throttle: throttle({ limit: 5 }) });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        together.auth.login({ email: EMAIL, password: `wrong-${i}` }),
      ),
    );

    const oneAtATime = adapter({ throttle: throttle({ limit: 5 }) });
    for (let i = 0; i < 10; i += 1) {
      await oneAtATime.auth.login({ email: EMAIL, password: `wrong-${i}` });
    }

    const burst = await together.auth.login({ email: EMAIL, password: PASSWORD });
    const serial = await oneAtATime.auth.login({ email: EMAIL, password: PASSWORD });
    expect(burst).toEqual(serial);
    expect(burst).toEqual({ ok: false, message: DEFAULT_THROTTLED_MESSAGE });
  });

  it("clears a reservation a successful sign-in was holding", async () => {
    // Three in flight on a limit of four, one of which signs in. The failure that follows is
    // counted from a clean key, so a person who got in is not left one typo from a refusal.
    const bound = throttle({ limit: 4 });
    const target = adapter({ throttle: bound });

    await Promise.all([
      target.auth.login({ email: EMAIL, password: "wrong-0" }),
      target.auth.login({ email: EMAIL, password: "wrong-1" }),
      target.auth.login({ email: EMAIL, password: "wrong-2" }),
    ]);
    // Three failures, and the fourth slot is what a concurrent attempt would have needed. A sign-in
    // resets the key rather than leaving those three behind it.
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toMatchObject({ ok: true });

    for (let i = 0; i < 4; i += 1) {
      expect(await target.auth.login({ email: EMAIL, password: `wrong-after-${i}` })).toEqual({
        ok: false,
        message: "Those credentials were not accepted.",
      });
    }
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: DEFAULT_THROTTLED_MESSAGE,
    });
  });
});

describe("property 8: a request that reports back late does not hold the key for ever", () => {
  it("serves a key again once a reservation's window has passed, with nothing reporting back", async () => {
    // The request died between `check` and `failed`, which is the whole point: nothing calls
    // `failed`, nothing calls `succeeded`, and the slot it took is still taken. A reservation with
    // no expiry is a lockout nobody chose and nobody can undo.
    const time = clock();
    const bound = throttle({ limit: 2, now: time.now });
    const target = adapter({ throttle: bound });

    // `check` and nothing else, twice, which is what an abandoned request leaves behind.
    expect(await bound.check(attempt())).toBeNull();
    expect(await bound.check(attempt())).toBeNull();
    // The key is at its limit from reservations alone, so this is refused before any comparison.
    expect(await bound.check(attempt())).toBe(DEFAULT_THROTTLED_MESSAGE);
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: DEFAULT_THROTTLED_MESSAGE,
    });

    time.advance(WINDOW);

    // A later attempt with the right password gets in, so the cost of a dead request is one
    // window and not a key that is refused until somebody restarts the process.
    expect((await target.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
  });

  it("serves a key again once the reservation window a host chose has passed", async () => {
    // The shipped default is a window, which is what the failures get and what the pre-existing
    // bound cost. A host that would rather a browser that gave up recover in seconds than in
    // minutes sets `reservationMs`, and that choice is its own because a shorter lease is also a
    // faster way for an attacker holding connections open to have the slots handed back.
    const time = clock();
    const bound = throttle({ limit: 2, now: time.now, windowMs: WINDOW, reservationMs: 1000 });
    const target = adapter({ throttle: bound });

    await bound.check(attempt());
    await bound.check(attempt());
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: DEFAULT_THROTTLED_MESSAGE,
    });

    time.advance(999);
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: DEFAULT_THROTTLED_MESSAGE,
    });

    time.advance(1);
    expect((await target.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
  });

  it("returns one slot, not the whole budget, when one attempt of a burst goes missing", async () => {
    // Two attempts in flight on a limit of two. One reports a failure and one never does, so
    // ageing out has to give back the one that is gone rather than the one that reported.
    const time = clock();
    const bound = throttle({ limit: 2, now: time.now, reservationMs: 1000 });

    expect(await bound.check(attempt())).toBeNull();
    expect(await bound.check(attempt())).toBeNull();
    await bound.failed(attempt());
    // One failure, one reservation still out, so the budget is spent and the next is refused.
    expect(await bound.check(attempt())).toBe(DEFAULT_THROTTLED_MESSAGE);

    time.advance(1000);
    // Ageing out the abandoned reservation leaves the recorded failure in force, so the key is
    // still at its limit of one remaining attempt rather than starting from nothing.
    expect(await bound.check(attempt())).toBeNull();
    expect(await bound.check(attempt())).toBe(DEFAULT_THROTTLED_MESSAGE);
  });
});

describe("property 9: a host's own throttle can meet the contract", () => {
  /**
   * A second implementation of `AdminLoginThrottle` over a shared store, written the way a Redis
   * one has to be: the read and the take in one statement, because a `GET` followed by a `SET` is
   * the defect this closes and would reintroduce it a process away.
   */
  function sharedStoreThrottle(limit: number, now: () => number) {
    const rows = new Map<string, { failures: number; inFlight: number; until: number }>();
    return (): AdminLoginThrottle => ({
      check: (a) => {
        const key = a.credentials.email;
        const entry = rows.get(key);
        if (entry && entry.until > now() && entry.failures + entry.inFlight >= limit) {
          return "refused by the shared store";
        }
        rows.set(key, {
          failures: entry && entry.until > now() ? entry.failures : 0,
          inFlight: (entry && entry.until > now() ? entry.inFlight : 0) + 1,
          until: now() + WINDOW,
        });
        return null;
      },
      failed: (a) => {
        const entry = rows.get(a.credentials.email);
        if (!entry) {
          rows.set(a.credentials.email, { failures: 1, inFlight: 0, until: now() + WINDOW });
          return;
        }
        entry.failures += 1;
        entry.inFlight = Math.max(0, entry.inFlight - 1);
      },
      succeeded: (a) => {
        rows.delete(a.credentials.email);
      },
    });
  }

  it("holds the same burst bound with nothing but the three methods", async () => {
    const target = adapter({ throttle: sharedStoreThrottle(4, Date.now)() });

    const results = await Promise.all(
      Array.from({ length: BURST }, (_, i) =>
        target.auth.login({ email: EMAIL, password: `wrong-${i}` }),
      ),
    );

    expect(target.verify).toHaveBeenCalledTimes(4);
    expect(results.filter((r) => r.ok)).toHaveLength(0);
  });

  it("refuses a host's own wording and lets the key through again once the count is spent", async () => {
    // The three methods are the whole contract, and a refusal is whatever the host's says. What
    // the package asks of a host is the bound, not the sentence.
    const bound = sharedStoreThrottle(1, Date.now)();
    const target = adapter({ throttle: bound });

    await target.auth.login({ email: EMAIL, password: "wrong" });
    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: "refused by the shared store",
    });
  });
});

describe("property 6: a host that supplies no throttle gets what it has today", () => {
  it("answers every wrong password the same way, with no bound in sight", async () => {
    const target = adapter();

    for (let i = 0; i < 40; i += 1) {
      expect(await target.auth.login({ email: EMAIL, password: `wrong-${i}` })).toEqual({
        ok: false,
        message: "Those credentials were not accepted.",
      });
    }
    // Still able to sign in on the fortieth, which is the behaviour before the option existed.
    expect((await target.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
  });

  it("shares no count with a throttled adapter in the same process, so no global counter exists", async () => {
    // The shape this catches is a module-level throttle used when the option is absent. That
    // would look like a harmless default and would bind every host in one process together: an
    // adapter asked to do nothing new would refuse because another one was guessed at.
    const bounded = adapter({ throttle: throttle() });
    await exhaust(bounded);

    const unbounded = adapter();
    for (let i = 0; i < 12; i += 1) {
      expect(await unbounded.auth.login({ email: EMAIL, password: `wrong-${i}` })).toEqual({
        ok: false,
        message: "Those credentials were not accepted.",
      });
    }
    expect((await unbounded.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
  });

  it("reads no request headers at all, because there is no throttle to key", async () => {
    // The one property here a black-box test cannot hold on its own: in jsdom the header read
    // succeeds and returns nothing, so reading it or not reading it looks the same. What it would
    // cost is a sign-in that fails on a platform with no request scope, so the assertion is on
    // the source, in the same spirit as the constant-time comparison in the credential suite.
    const source = readFileSync(join(import.meta.dirname, "..", "src", "baseline", "session.ts"), "utf8")
      .replace(/^\s*\*.*$/gm, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const login = source.slice(source.indexOf("async login(credentials"));

    // Built inside the conditional rather than beside it, so an unthrottled host never touches it.
    expect(login).toMatch(/const attempt = throttle\s*\?\s*\{[^}]*requestHeaders\(\)/);
  });

  it("survives a request with no headers at all, which is a host on no framework", async () => {
    // jsdom has no request scope, so the header read returns nothing rather than throwing. A
    // throttle that made a login attempt depend on the platform having headers would take the
    // login page down on exactly the host that needs it most.
    const bound = throttle();
    const target = adapter({ throttle: bound });

    expect((await target.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
    await target.auth.login({ email: EMAIL, password: "wrong" });
    expect((await target.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
  });

  it("leaves a host's own throttle alone, including one that refuses everything", async () => {
    // The seam is the host's to write, so the package does not second-guess it: three methods,
    // whatever they do.
    const bound: AdminLoginThrottle = {
      check: () => "the host said no",
      failed: () => {},
      succeeded: () => {},
    };
    const target = adapter({ throttle: bound, verify: vi.fn(async () => "s1") });

    expect(await target.auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      message: "the host said no",
    });
    expect(target.verify).not.toHaveBeenCalled();
  });
});
