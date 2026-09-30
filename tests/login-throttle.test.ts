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
  LoginReservation,
  LoginThrottleDecision,
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

/** A reservation handle, for the tests that report for an attempt rather than drive a login. */
const HELD = "held-by-the-test" as const;

/** Asserts an attempt was let through, and returns the reservation it now holds. */
function allowed(decision: LoginThrottleDecision): LoginReservation {
  if (!decision.ok) throw new Error(`expected the attempt to be allowed, got: ${decision.message}`);
  return decision.reservation;
}

/** Asserts an attempt was refused, and returns the message it was refused with. */
function refused(decision: LoginThrottleDecision): string {
  if (decision.ok) throw new Error(`expected a refusal, got reservation ${decision.reservation}`);
  return decision.message;
}

/** How many more attempts a throttle would let through, asked rather than read. */
async function remainingBudget(bound: AdminLoginThrottle): Promise<number> {
  let through = 0;
  for (let i = 0; i < 40; i += 1) {
    if ((await bound.check(attempt())).ok) through += 1;
  }
  return through;
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
        return { ok: false, message: "no" };
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

  it("does not extend the window, so a held-down button cannot lock a key out for good", async () => {
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
      await bound.failed(attempt(`visitor-${i}@demo.helmdeck.dev`), HELD);
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
      expect((await sized.check(attempt(`visitor-${i}@demo.helmdeck.dev`))).ok).toBe(true);
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
    await bound.failed(
      {
        credentials: { email: EMAIL, password: "x" },
        headers: headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }),
      },
      HELD,
    );
    const second = await bound.check({
      credentials: { email: EMAIL, password: "x" },
      headers: headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.9, 10.0.0.1" }),
    });

    expect(refused(second)).toBe(DEFAULT_THROTTLED_MESSAGE);
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

  it("gives a person who fumbled and then signed in a whole budget again", async () => {
    // The scenario the review named. Five slots in flight on a limit of eight, five of them refused
    // and one accepted, and the accepted one is the person getting in. What is left behind decides
    // whether their next typo is refused, so it has to be nothing.
    const bound = throttle({ limit: 8 });
    const target = adapter({ throttle: bound });

    await Promise.all([
      target.auth.login({ email: EMAIL, password: "wrong-0" }),
      target.auth.login({ email: EMAIL, password: "wrong-1" }),
      target.auth.login({ email: EMAIL, password: "wrong-2" }),
      target.auth.login({ email: EMAIL, password: "wrong-3" }),
      target.auth.login({ email: EMAIL, password: "wrong-4" }),
      target.auth.login({ email: EMAIL, password: PASSWORD }),
    ]);

    // A fresh budget rather than whatever the six attempts left. A key that still held five
    // failures or five reservations would refuse somewhere inside the next eight, and the person
    // who just signed in correctly would be one typo from being told to wait.
    for (let i = 0; i < 7; i += 1) {
      expect(await target.auth.login({ email: EMAIL, password: `typo-${i}` })).toEqual({
        ok: false,
        message: "Those credentials were not accepted.",
      });
    }
    expect((await target.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
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
    allowed(await bound.check(attempt()));
    allowed(await bound.check(attempt()));
    // The key is at its limit from reservations alone, so this is refused before any comparison.
    expect(refused(await bound.check(attempt()))).toBe(DEFAULT_THROTTLED_MESSAGE);
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

  it("returns one named slot, and no recorded failure, when one attempt of a burst goes missing", async () => {
    // Three attempts in flight on a limit of three, admitted at three different moments so their
    // leases lapse at three different times. The middle one reports a failure, the first never
    // reports, and the third is still running when the clock reaches the first one's deadline.
    // Ageing out then has to return the first and nothing else, which a shared list of leases
    // cannot promise: the failure filed against the middle attempt would have shifted the front off
    // the first, and the first's own silence would have shifted the middle's lease off the second.
    const time = clock();
    const bound = throttle({ limit: 3, now: time.now, reservationMs: 1000 });

    const first = allowed(await bound.check(attempt()));
    time.advance(400);
    const second = allowed(await bound.check(attempt()));
    time.advance(400);
    const third = allowed(await bound.check(attempt()));

    await bound.failed(attempt(), second);
    // One failure and two still running on a limit of three, so the next attempt is refused.
    expect(refused(await bound.check(attempt()))).toBe(DEFAULT_THROTTLED_MESSAGE);

    // Past the first attempt's lease, short of the third's.
    time.advance(600);

    // One recorded failure, one running attempt, and the first attempt's slot back, so a limit of
    // three has exactly one attempt left to give. A lease list that dropped the wrong entry would
    // leave two or none.
    expect(await remainingBudget(bound)).toBe(1);
    // And the reservations that came back are the silent first one only, which is what a report
    // for the third would still find in place.
    await bound.failed(attempt(), third);
    expect(await remainingBudget(bound)).toBe(0);
    expect(first).not.toBe(second);
  });

  it("counts a report for a reservation whose lease already lapsed", async () => {
    // The decision the contract makes about a report naming a reservation the store no longer
    // holds, and the attack it exists to stop. An attacker who can hold a connection open would
    // otherwise take a slot, let the lease lapse, get the slot back, and then report: the attempt
    // reached the password and cost the key nothing. Counted here, so the free attempt is not
    // free.
    const time = clock();
    const bound = throttle({ limit: 2, now: time.now, reservationMs: 1000 });

    const hung = allowed(await bound.check(attempt()));
    time.advance(1000);
    // The lease has lapsed, so the slot is back and the key can serve a second attempt.
    allowed(await bound.check(attempt()));
    // The hung request now finishes and reports. The failure stands even though the slot it was
    // holding is long gone, so this attempt and the hung one are both charged.
    await bound.failed(attempt(), hung);

    // One failure and one live reservation on a limit of two, so nothing gets through.
    expect(refused(await bound.check(attempt()))).toBe(DEFAULT_THROTTLED_MESSAGE);
  });

  it("does not charge a key twice for one hung attempt that reports after a restart", async () => {
    // The other way a report arrives for a reservation the store does not hold: a handle from a
    // process that has since restarted, so the key is not in the map at all. Counted, and once.
    const bound = throttle({ limit: 4 });

    await bound.failed(attempt(), "a-handle-from-a-process-that-is-gone");
    await bound.failed(attempt(), "a-handle-from-a-process-that-is-gone");

    // Two failures, not one and not four: a repeated report for a reservation the throttle has
    // never heard of does not compound, and the four-limit key still has two attempts left.
    expect(await remainingBudget(bound)).toBe(2);
  });

  it("forgives nothing when the success lands on a reservation that already lapsed", async () => {
    // A success whose own reservation aged out cannot say what it was preceded by, so it forgives
    // nothing rather than guessing a position. The recorded failure stands, which is the
    // conservative direction: under-counting is what a bound cannot afford.
    const time = clock();
    const bound = throttle({ limit: 4, now: time.now, reservationMs: 1000 });
    const lapsed = allowed(await bound.check(attempt()));
    await bound.failed(attempt(), HELD);
    time.advance(1000);

    await bound.succeeded(attempt(), lapsed);

    expect(await remainingBudget(bound)).toBe(3);
  });
});

describe("property 10: two attempts from one key, completing in either order, agree", () => {
  it("records the same thing whichever report lands first", async () => {
    // The defect the review found. One attempt succeeds and one is refused, from the same key, and
    // the two reports arrive in whichever order the network delivered them. A throttle whose
    // reports address the key gives two different answers for the same two attempts, and which
    // one a caller gets is decided by a race rather than by what happened.
    const budgets: number[] = [];
    for (const successIsFirst of [true, false]) {
      const bound = throttle({ limit: 4 });
      const held = [allowed(await bound.check(attempt())), allowed(await bound.check(attempt()))];
      const succeeded = () => bound.succeeded(attempt(), held[1]);
      const failed = () => bound.failed(attempt(), held[0]);
      await (successIsFirst ? succeeded() : failed());
      await (successIsFirst ? failed() : succeeded());
      budgets.push(await remainingBudget(bound));
    }

    expect(budgets[0]).toBe(budgets[1]);
  });

  it("forgives a failure from the attempt the successful one was preceded by", async () => {
    // The first attempt is refused and the second is accepted, so the success is preceded by the
    // failure and forgives it. The budget is whole, and it is whole in both report orders, which
    // is what "forgives" has to mean before it means anything.
    for (const successIsFirst of [true, false]) {
      const bound = throttle({ limit: 4 });
      const held = [allowed(await bound.check(attempt())), allowed(await bound.check(attempt()))];
      const succeeded = () => bound.succeeded(attempt(), held[1]);
      const failed = () => bound.failed(attempt(), held[0]);
      await (successIsFirst ? succeeded() : failed());
      await (successIsFirst ? failed() : succeeded());

      expect(await remainingBudget(bound)).toBe(4);
    }
  });

  it("leaves a failure from an attempt admitted after the successful one", async () => {
    // The narrow claim, and the one the old "a success clears the key's count" got wrong. The
    // first attempt is accepted and the second is refused, so the failure came after the sign-in
    // and is a later guess rather than one of the typos that sign-in forgives.
    for (const successIsFirst of [true, false]) {
      const bound = throttle({ limit: 4 });
      const held = [allowed(await bound.check(attempt())), allowed(await bound.check(attempt()))];
      const succeeded = () => bound.succeeded(attempt(), held[0]);
      const failed = () => bound.failed(attempt(), held[1]);
      await (successIsFirst ? succeeded() : failed());
      await (successIsFirst ? failed() : succeeded());

      // One failure on the record on a limit of four.
      expect(await remainingBudget(bound)).toBe(3);
    }
  });

  it("keeps a concurrent attempt's slot when a different one succeeds", async () => {
    // A success retires its own slot. Handing out the slots of attempts still running is a burst
    // through the back door, and it is what a success that cleared the whole entry did.
    const bound = throttle({ limit: 4 });
    const held = [
      allowed(await bound.check(attempt())),
      allowed(await bound.check(attempt())),
      allowed(await bound.check(attempt())),
    ];

    await bound.succeeded(attempt(), held[0]);

    // Two still running, nothing charged against them, so two attempts are left.
    expect(await remainingBudget(bound)).toBe(2);
  });

  it("forgives the typos a person made before signing in", async () => {
    // The property the whole clear exists for, and it is still true through a real login: two
    // failures and then the right password leaves the key whole rather than one typo from a
    // lockout.
    const forgiving = adapter({ throttle: throttle({ limit: 3 }) });
    await forgiving.auth.login({ email: EMAIL, password: "typo-0" });
    await forgiving.auth.login({ email: EMAIL, password: "typo-1" });
    expect((await forgiving.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
    for (let i = 0; i < 2; i += 1) {
      expect(await forgiving.auth.login({ email: EMAIL, password: `after-${i}` })).toEqual({
        ok: false,
        message: "Those credentials were not accepted.",
      });
    }
  });

  it("charges a failure that arrived after the person signed in, rather than forgiving it", async () => {
    // The same key, a sign-in and then a wrong password, in that order. A success forgives the
    // typos it was preceded by, and this is not one: it is the next guess, and counting it is what
    // keeps an attacker from spending a free attempt per legitimate sign-in.
    const bound = throttle({ limit: 4 });
    const signedIn = allowed(await bound.check(attempt()));
    await bound.succeeded(attempt(), signedIn);

    const after = allowed(await bound.check(attempt()));
    await bound.failed(attempt(), after);

    expect(await remainingBudget(bound)).toBe(3);
  });
});

describe("property 9: a host's own throttle can meet the contract", () => {
  /**
   * A second implementation of `AdminLoginThrottle` over a shared store, written the way a Redis
   * one has to be: the read and the take in one statement, because a `GET` followed by a `SET` is
   * the defect this closes and would reintroduce it a process away.
   *
   * The reservation is a row id from a store-wide counter, which is the whole answer to what a
   * host can mint: the package's type is a string, so a host uses whatever its store makes
   * cheaply and uniquely, and nothing here is a class the package owns.
   */
  function sharedStoreThrottle(limit: number, now: () => number) {
    const rows = new Map<
      string,
      { failures: number; inFlight: Map<string, number>; until: number }
    >();
    let serial = 0;
    return (): AdminLoginThrottle => ({
      check: (a) => {
        const key = a.credentials.email;
        const entry = rows.get(key);
        const live = entry && entry.until > now() ? entry : null;
        if (live && live.failures + live.inFlight.size >= limit) {
          return { ok: false, message: "refused by the shared store" };
        }
        serial += 1;
        const reservation = `row-${serial}`;
        const inFlight = new Map(live?.inFlight ?? []);
        inFlight.set(reservation, now());
        rows.set(key, {
          failures: live?.failures ?? 0,
          inFlight,
          until: now() + WINDOW,
        });
        return { ok: true, reservation };
      },
      failed: (a, reservation) => {
        const entry = rows.get(a.credentials.email);
        if (!entry) {
          rows.set(a.credentials.email, {
            failures: 1,
            inFlight: new Map(),
            until: now() + WINDOW,
          });
          return;
        }
        entry.failures += 1;
        entry.inFlight.delete(reservation);
      },
      succeeded: (a, reservation) => {
        const entry = rows.get(a.credentials.email);
        if (!entry) return;
        entry.inFlight.delete(reservation);
        entry.failures = 0;
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

  it("agrees with the shipped throttle on the same out-of-order pair", async () => {
    // The contract is what two implementations are held to, so the second one has to reach the
    // same answer as the first on the case that separated the old throttle from a correct one.
    const bound = sharedStoreThrottle(4, Date.now)();
    const held = [allowed(await bound.check(attempt())), allowed(await bound.check(attempt()))];

    await bound.succeeded(attempt(), held[0]);
    await bound.failed(attempt(), held[1]);

    let through = 0;
    for (let i = 0; i < 40; i += 1) {
      if ((await bound.check(attempt())).ok) through += 1;
    }
    expect(through).toBe(3);
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
    //
    // The shipped key function, not the email-keying one the rest of this file uses, because the
    // claim is about the header read and a key that never reads a header cannot fail on one. The
    // adapter's own `getUser` is bypassed here, so nothing else is standing between the read and
    // the result.
    const bound = createLoginThrottle();
    const target = adapter({ throttle: bound });

    expect((await target.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
    await target.auth.login({ email: EMAIL, password: "wrong" });
    // A key built from a request that had no headers is the account, which is a real bound and
    // does not throw, so the sign-in after a failure still works.
    expect((await target.auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
  });

  it("leaves a host's own throttle alone, including one that refuses everything", async () => {
    // The seam is the host's to write, so the package does not second-guess it: three methods,
    // whatever they do.
    const bound: AdminLoginThrottle = {
      check: () => ({ ok: false, message: "the host said no" }),
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
