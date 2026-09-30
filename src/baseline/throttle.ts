// SPDX-License-Identifier: MIT
/**
 * A bound on failed sign-ins: the seam a host plugs into, and one in-memory implementation of it.
 *
 * **What this is.** A count of refused sign-ins per key, per window, with the window lapsing when
 * a key is next looked at. The count is a guess limit, nothing more.
 *
 * **What this is not.** It is not a distributed rate limiter, and it is not an address bound. The
 * shipped `createLoginThrottle` keeps its counts in a `Map` inside one process, so the bound a
 * three-replica deployment gets is a third of the configured one and a restart clears it. Calling
 * that a rate limiter is the kind of description that makes a reader trust it more than it
 * deserves, so: the deployment decides which of these the host needs, and only the host knows.
 *
 * - One process, or one replica behind one process: the default is what the deployment needs.
 * - More than one process: put the same three methods over Redis, a table, or anything the
 *   instances share. `AdminLoginThrottle` is three methods for exactly that reason, and the one
 *   requirement it puts on a host beyond counting is that `check` must reserve a slot in the same
 *   operation that refuses, which is a Lua script or an `UPDATE ... WHERE` rather than a `GET`
 *   and a `SET`.
 * - A client that can set its own forwarded header: no counter keyed on a header a client writes
 *   bounds anything. See `forwardedClientKey` for what the default does about that.
 *
 * **The refusal is reported before the credentials are checked and says what it is.** A wrong
 * password and a locked-out key would otherwise be the same answer, and an attacker who cannot
 * tell them apart does not know when to stop or when to change address. A visitor who is being
 * throttled also cannot fix it by typing a different password, which is the other half of why the
 * message names the throttle.
 *
 * **What a refusal does not leak.** The counter is keyed and moved without ever consulting the
 * user store, so an address with no account accumulates failures exactly as one with an account
 * does and is refused with exactly the same words. A throttle keyed on the account would otherwise
 * turn the sign-in form into an account oracle, which is the failure `authenticate` exists to
 * prevent, and this is built to sit beside it rather than to undo it.
 */

import type { AdminLoginCredentials } from "../adapters/index.js";

/** Failures a key may make before the next attempt is refused. */
export const DEFAULT_THROTTLE_LIMIT = 8;

/** How long a key stays refused once it reaches the limit. */
export const DEFAULT_THROTTLE_WINDOW_MS = 15 * 60 * 1000;

/**
 * What a refusal says, which is deliberately not the invalid-credentials message.
 *
 * A user who is being throttled cannot fix it by typing a different password, so the message names
 * the wait. A host replaces it when its sign-in screen has its own voice, and should keep the
 * "too many attempts" sense in it: the refusal is only useful if it is distinguishable from a
 * wrong password, both to the visitor and to whoever is reading the logs afterwards.
 */
export const DEFAULT_THROTTLED_MESSAGE = "Too many sign-in attempts. Wait a few minutes and try again.";

/** A header reader, which is what `next/headers` hands back, plus anything shaped like it. */
export type AdminLoginHeaders =
  | { get(name: string): string | null }
  | Readonly<Record<string, string | string[] | undefined>>;

/** One sign-in attempt, with the request it arrived on. */
export type AdminLoginAttempt = {
  credentials: AdminLoginCredentials;
  /** The request's headers, empty when the platform exposes none or the request is not readable. */
  headers: AdminLoginHeaders;
};

/**
 * The seam. Three methods, so a host can implement it over whatever the instances share.
 *
 * A host with a Redis or a table behind it implements the same three and hands that to
 * `createSessionAuthAdapter`; nothing else in the package changes.
 *
 * **`check` is a read-modify-write, and that is the whole point of it.** Returning null is not a
 * peek: it takes a slot for the key, and `failed` and `succeeded` are how that slot comes back.
 * Without the take, twenty attempts arriving together all read the same count before any of them
 * has recorded a failure, so all twenty reach the password and the bound does nothing to the one
 * shape an attacker actually uses. The cost of the fix falls on the implementation rather than the
 * caller, and it is written on `check` because that is where a host reads it: an implementation
 * that counts correctly but does not reserve is not wrong in any way a test of its arithmetic
 * would notice, and it is silently the pre-fix throttle.
 */
export type AdminLoginThrottle = {
  /**
   * A message refuses the attempt and nothing is checked; null lets the attempt through.
   *
   * **Returning null takes a slot for this key, so this method writes and cannot be a read.** A
   * null answer is a promise that the caller will come back with exactly one of `failed` or
   * `succeeded`, which releases the slot: `failed` keeps it charged as a failure and `succeeded`
   * gives it back and clears the key. The caller already has that shape, because a sign-in
   * reports one outcome or the other, so nothing at the call site changes.
   *
   * The take must be atomic with the refusal. A `GET` followed by a `SET` lets two callers both
   * see the last free slot and both take it, which is the same bypass with a network hop in it,
   * so over a shared store this is one statement or one script rather than two.
   *
   * A slot that is never reported back has to lapse on its own, or a request that dies between
   * here and the comparison would hold the key below its limit for ever. The shipped throttle
   * ages one out with the window, and a host's own is its own decision to make: a lease shorter
   * than the window recovers sooner from a request that gave up, and is also a faster way for an
   * attacker holding connections open to have slots handed back. There is no handle and nothing to
   * release, so ageing out is the only way out of a caller that never reports.
   */
  check: (attempt: AdminLoginAttempt) => Promise<string | null> | string | null;
  /**
   * Called when the credentials were refused, which is what a bound counts.
   *
   * The slot `check` took stays charged, converted from a reservation into a recorded failure, so
   * this does not move the count on its own: an attempt that was allowed and then refused was
   * spending a slot the whole time, and counting it twice would make a burst of `limit` refusals
   * cost `2 * limit` of budget rather than `limit`.
   */
  failed: (attempt: AdminLoginAttempt) => Promise<void> | void;
  /** Called when the credentials were accepted, which clears that key's count. */
  succeeded: (attempt: AdminLoginAttempt) => Promise<void> | void;
};

/** Reads a header from either shape, and returns the first entry of a repeated one. */
export function loginHeader(headers: AdminLoginHeaders, name: string): string | null {
  if ("get" in headers && typeof headers.get === "function") {
    return headers.get(name) ?? null;
  }
  const value = (headers as Readonly<Record<string, string | string[] | undefined>>)[name];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * The shipped key function: the address in front of the app, or the account being attempted.
 *
 * `x-forwarded-for` first, then `x-real-ip`, because that is the order the proxies write them in.
 * Only separators means no address arrived, and a header of nothing but `", ,"` yields an empty
 * first entry, which is why the split is trimmed and length-checked rather than indexed.
 *
 * **What this key is not.** `x-forwarded-for` is written by whatever is in front, so a client that
 * can set it can name a different key on every attempt and the bound bounds nothing. That is not a
 * flaw in the parsing, it is what a client-writable header is: the counter can only be as good as
 * the thing that identifies the client. A host whose proxy lets a client append to that header
 * should strip it at the edge and pass a key built from the address the edge actually saw, or use
 * a header the client cannot write.
 *
 * With no address to be had, the attempt is keyed on the account being signed in to. That is a
 * real bound and a weaker one: it stops one account being guessed at, it does not stop one client
 * guessing at every account, and it does not stop a visitor behind a shared address being counted
 * with everyone else. It is named in the docstring rather than silently chosen, because a host
 * reading "eight failures" and getting "eight failures for this account" should know which one it
 * has.
 */
export function forwardedClientKey(attempt: AdminLoginAttempt): string {
  for (const name of ["x-forwarded-for", "x-real-ip"]) {
    const raw = loginHeader(attempt.headers, name);
    const first = raw?.split(",")[0]?.trim();
    if (first) return first;
  }
  return attempt.credentials.email.trim().toLowerCase();
}

export type LoginThrottleOptions = {
  /** Failures allowed per key per window. */
  limit?: number;
  /** How long a key stays refused after it reaches the limit. */
  windowMs?: number;
  /**
   * How long a slot stays reserved when nothing reports it back.
   *
   * Defaults to `windowMs`, which is the longest a key can be refused anyway, so a request that
   * dies mid-comparison costs the key the same one window a wrong password would have. A shorter
   * value recovers sooner from a browser that gave up, and is also a faster way for an attacker
   * holding connections open to have their slots handed back, so it is the host's trade to make
   * rather than this package's.
   */
  reservationMs?: number;
  /** Names the attempt. The default is `forwardedClientKey`. */
  clientKey?: (attempt: AdminLoginAttempt) => string | Promise<string>;
  /** Milliseconds since the epoch. Injected so a test advances a clock instead of waiting. */
  now?: () => number;
  /** Replaces what a refusal says. */
  message?: string;
};

/** One key's count and the moment its window closes. */
type LoginThrottleEntry = {
  failures: number;
  until: number;
  /**
   * When each allowed attempt took its slot, oldest first, bounded by the limit.
   *
   * A timestamp per reservation rather than one per key, so ageing out hands back the attempt
   * that went missing and leaves the ones that reported alone. They are dropped from the front
   * because the report that comes back cannot be matched to the reservation that took it: the
   * methods share an attempt and nothing to identify which of several it was.
   */
  reserved: number[];
};

/**
 * The in-memory throttle: a `Map`, a window, and no timer.
 *
 * **There is no sweep and there is no timer.** A window lapses when its key is next looked at,
 * which is the only moment anything reads it, so an entry nobody touches again is an entry nobody
 * pays for. A sweep would be a timer this module starts in somebody's process, holding the event
 * loop open or being cleaned up by whichever teardown the host forgot to call. The cost of that
 * arrangement is not the timer, it is that the map is the only place the counts exist: a
 * long-lived store behind `AdminLoginThrottle` keeps the same lazy read and additionally holds one
 * row per key it has ever refused until something deletes it, which is a table to sweep on a
 * schedule and an index on the key column.
 *
 * **Every write here is synchronous, after the key has been resolved.** `clientKey` is awaited
 * once and nothing is awaited after it, so the read and the take are one turn of the event loop
 * and no other attempt for the key can read the count between them. The map gives that for free
 * because this is one process; a host's shared store has to get it from one statement.
 */
export function createLoginThrottle(options: LoginThrottleOptions = {}): AdminLoginThrottle {
  const limit = options.limit ?? DEFAULT_THROTTLE_LIMIT;
  const windowMs = options.windowMs ?? DEFAULT_THROTTLE_WINDOW_MS;
  const reservationMs = options.reservationMs ?? windowMs;
  const now = options.now ?? Date.now;
  const clientKey = options.clientKey ?? forwardedClientKey;
  const message = options.message ?? DEFAULT_THROTTLED_MESSAGE;
  const entries = new Map<string, LoginThrottleEntry>();

  /**
   * The count still in force, or null. Reading is what expires: an entry whose window has passed
   * is dropped here rather than on a schedule, so the two branches cannot disagree about which
   * keys are live.
   */
  function read(key: string): LoginThrottleEntry | null {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.until <= now()) {
      entries.delete(key);
      return null;
    }
    // The same lazy read for a slot nobody reported back, and on the same schedule as the window
    // so that nothing here is a timer and no key is held by a request that is not coming back.
    let dropped = false;
    while (entry.reserved.length > 0 && now() - entry.reserved[0] >= reservationMs) {
      entry.reserved.shift();
      dropped = true;
    }
    if (dropped && entry.failures === 0 && entry.reserved.length === 0) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  return {
    check: async (attempt) => {
      const key = await clientKey(attempt);
      const entry = read(key);
      if (!entry) {
        entries.set(key, { failures: 0, until: now() + windowMs, reserved: [now()] });
        return null;
      }
      // Failures and reservations are one budget, which is what makes the bound a bound: a slot
      // held by an attempt still running is a slot an attacker cannot spend twice.
      if (entry.failures + entry.reserved.length >= limit) return message;
      entry.reserved.push(now());
      return null;
    },

    failed: async (attempt) => {
      const key = await clientKey(attempt);
      const entry = read(key);
      if (!entry) {
        entries.set(key, { failures: 1, until: now() + windowMs, reserved: [] });
        return;
      }
      // A refused attempt does not extend the window. It costs the caller nothing to send a
      // thousand of them, and a window that each one pushed forward would be a way to keep a
      // legitimate account locked out for as long as an attacker cared to hold the button.
      entry.failures += 1;
      // The slot becomes a recorded failure, so the budget is the same size afterwards. A report
      // with no reservation behind it is a host calling `failed` directly, which still counts.
      if (entry.reserved.length > 0) entry.reserved.shift();
    },

    succeeded: async (attempt) => {
      // The whole entry, so the reservations go with the count. Clearing failures but holding the
      // reservations would leave the key at its limit for a person who just signed in on it.
      entries.delete(await clientKey(attempt));
    },
  };
}
