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
 * The handle a report carries back, which names the one attempt it belongs to.
 *
 * **It is an opaque string, and that is chosen so a host can mint one.** A host's throttle holds
 * its counts in Redis, in a table, or in a Lua script, and a report arrives in whichever process
 * happens to be serving the request, so this value has to survive a round trip through a
 * serialising store and be matched by an equality test inside one statement. A string is the
 * narrowest thing that does that. A symbol does not survive being written to Redis; an object
 * with methods on it is not something a script can compare.
 *
 * **What has to survive, and what must not.** It has to be stable across that round trip and
 * unique within the store, because a collision is a report retiring somebody else's slot. It must
 * not be guessable by the client, and it does not have to be: nothing about a login form exposes
 * it, it never leaves the server, and the caller of `check` is the one who hands it back. It must
 * not be readable, which is the one property a store cannot be asked for, so the shipped one is
 * a counter and says so.
 *
 * **A host that cannot produce this is not thereby excluded.** The type is a string, not an opaque
 * class, so a host mints whatever its store makes cheaply and unique: a row id, a UUID, a
 * `SETNX` token, a Redis `INCR`. Whatever it mints, two rules hold: it is not interpreted by this
 * package, and a report naming a reservation the store does not hold is answered the way `failed`
 * and `succeeded` below say.
 */
export type LoginReservation = string;

/** What `check` answered, which is a refusal or the reservation the attempt now holds. */
export type LoginThrottleDecision =
  | { ok: true; reservation: LoginReservation }
  | { ok: false; message: string };

/**
 * The seam. Three methods, so a host can implement it over whatever the instances share.
 *
 * A host with a Redis or a table behind it implements the same three and hands that to
 * `createSessionAuthAdapter`; nothing else in the package changes.
 *
 * **A report names its reservation, and that is what makes the accounting order-independent.**
 * Without it, `failed` and `succeeded` address the key, and two attempts from one key whose
 * reports arrive in either order leave it in two different states: a success arriving last erases
 * a failure that really happened, and a success arriving first leaves that failure counted
 * against a key it had just cleared. With it, each report retires the one attempt it belongs to,
 * and the order the two reports arrive in stops being an input to the result.
 *
 * The cost of the fix falls on the implementation rather than the caller. It is written on the
 * type because that is where a host reads it: an implementation that counts correctly, does not
 * reserve, and retires a shared slot instead of a named one is not wrong in any way a test of its
 * arithmetic would notice, and it is silently the throttle that does not bound anything.
 */
export type AdminLoginThrottle = {
  /**
   * A refusal and a message to show, or the reservation this attempt now holds.
   *
   * **The allowed branch takes a slot, so this method writes and cannot be a read.** An `ok: true`
   * is a promise that the caller will come back with exactly one of `failed` or `succeeded`,
   * naming this reservation: `failed` converts the slot into a recorded failure and `succeeded`
   * retires it and clears the key's recorded failures. The caller already has that shape, because
   * a sign-in reports one outcome or the other, so nothing at the call site changes.
   *
   * The take must be atomic with the refusal. A `GET` followed by a `SET` lets two callers both
   * see the last free slot and both take it, which is the same bypass with a network hop in it,
   * so over a shared store this is one statement or one script rather than two.
   *
   * A reservation nothing ever reports back has to lapse on its own, or a request that dies
   * between here and the comparison would hold the key below its limit for ever. The shipped
   * throttle ages one out with the window, and a host's own is its own decision to make: a lease
   * shorter than the window recovers sooner from a request that gave up, and is also a faster way
   * for an attacker holding connections open to have slots handed back. Ageing out retires the
   * named reservation and nothing else, so it cannot take a recorded failure with it.
   */
  check: (attempt: AdminLoginAttempt) => Promise<LoginThrottleDecision> | LoginThrottleDecision;
  /**
   * Called when the credentials were refused, which is what a bound counts.
   *
   * The slot stays charged, converted from a reservation into a recorded failure, so this does not
   * move the count on its own: an attempt that was allowed and then refused was spending a slot
   * the whole time, and counting it twice would make a burst of `limit` refusals cost `2 * limit`
   * of budget rather than `limit`.
   *
   * **A report for a reservation the store no longer holds still counts.** The reservation is
   * named, so this is no longer about which slot to take off a shared pile, and the two ways to get
   * here are both a refused attempt that deserves a refusal's worth of budget: a request that
   * completed after its own lease lapsed, and a caller holding a handle from a process that has
   * since restarted. Ignoring the report would hand out a free attempt to anyone who can keep a
   * connection open, which is a cheaper bypass than the one this bound exists to stop. Counting it
   * costs a slow attempt one extra charge, and the shipped lease is the window, which no honest
   * sign-in comes near.
   */
  failed: (attempt: AdminLoginAttempt, reservation: LoginReservation) => Promise<void> | void;
  /**
   * Called when the credentials were accepted, which clears that key's recorded failures.
   *
   * **It clears the key's failures, not the key.** A success is evidence about the person signing
   * in, so the failures they made are forgiven, and a good password is what an attacker who does
   * not have one cannot produce. The reservation it retires is its own, so a concurrent attempt
   * still running keeps its slot rather than having it handed out twice.
   *
   * What a success does not do is discard a failure that is not its own to forgive. The recorded
   * failure stands, and only the failure count is reset, so a person who fumbled three times and
   * then got it right is not one typo from a lockout while an attacker's failures in the same
   * window survive it.
   */
  succeeded: (attempt: AdminLoginAttempt, reservation: LoginReservation) => Promise<void> | void;
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
  /**
   * Failures allowed per key per window. Zero is legal and means no attempt is allowed at all.
   *
   * **A number that is not a whole number of attempts is refused here, not reinterpreted later.**
   * `NaN` is the one that matters: every comparison against it is false, so a throttle built with
   * one refuses nothing, and the host finds that out from an incident rather than from a stack
   * trace.
   */
  limit?: number;
  /**
   * How long a key stays refused after it reaches the limit.
   *
   * Must be a positive whole number of milliseconds. Zero would lapse every key on the next read,
   * so nothing would ever be charged and the bound would not exist.
   */
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
  /**
   * When each recorded failure was reserved, as the throttle's own order.
   *
   * A list of positions rather than a number, because a success has to forgive the failures that
   * were already there when it started and leave the ones that came after it, and the only ordering
   * both reports agree on is the order the attempts were admitted in. A bare counter cannot say
   * which failures a success was meant to forgive, so which ones it forgives would depend on
   * whether its report happened to arrive before or after somebody else's.
   */
  failures: number[];
  /**
   * The position of the most recent success, which is the failure position it forgives up to.
   *
   * A success forgives what its attempt was preceded by and nothing after it, so a failure from an
   * attempt that was admitted later survives the sign-in. That is the narrow claim the old
   * "clears the key's count" overreached on.
   */
  cleared: number;
  until: number;
  /** The outstanding reservations, with when each took its slot and the position it was given. */
  reserved: Map<LoginReservation, { taken: number; position: number }>;
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
  /**
   * A whole number, and zero is allowed for the limit because zero attempts is a bound a host can
   * want. Everything else is refused here rather than reinterpreted at the first comparison,
   * because the values that cannot be read are also the ones whose comparisons quietly succeed, and
   * a host that found out from the absence of a bound would have nothing to trace.
   */
  function whole(name: string, value: number, smallest: number): number {
    if (!Number.isInteger(value) || value < smallest) {
      const unit = smallest === 0 ? "attempts, which may be zero" : "milliseconds, above zero";
      throw new Error(
        `createLoginThrottle needs ${name} to be a whole number of ${unit}, and got ${String(value)}`,
      );
    }
    return value;
  }

  // Resolved first and validated second, so an option the caller left out is never the thing that
  // gets checked. `??` and not `||`: a `limit` of zero is a configuration, and `0 || 8` would turn
  // it into the default and report a form the host shut as one that is merely lenient.
  const limit = whole("limit", options.limit ?? DEFAULT_THROTTLE_LIMIT, 0);
  const windowMs = whole("windowMs", options.windowMs ?? DEFAULT_THROTTLE_WINDOW_MS, 1);
  const reservationMs = whole("reservationMs", options.reservationMs ?? windowMs, 1);
  const now = options.now ?? Date.now;
  const clientKey = options.clientKey ?? forwardedClientKey;
  const message = options.message ?? DEFAULT_THROTTLED_MESSAGE;
  const entries = new Map<string, LoginThrottleEntry>();

  /**
   * Per-throttle rather than per-key, so a reservation says which attempt it was without saying
   * anything about the key it belongs to. A reservation in a log is then a serial, not a record of
   * somebody's address, and one counter cannot be exhausted by any key.
   *
   * It is also the ordering every report agrees on. Milliseconds do not do: two attempts in the
   * same millisecond are not ordered by the clock, and which one a success forgives is then decided
   * by which report the network delivered first.
   */
  let minted = 0;

  function mint(): { reservation: LoginReservation; position: number } {
    minted += 1;
    return { reservation: `r${minted}`, position: minted };
  }

  /** The failures still in force, which is the whole of what a success is allowed to forgive. */
  function charged(entry: LoginThrottleEntry): number {
    let count = 0;
    for (const position of entry.failures) {
      if (position > entry.cleared) count += 1;
    }
    return count;
  }

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
    // so that nothing here is a timer and no key is held by a request that is not coming back. It
    // walks the map rather than a queue because the leases are not in a known order and a stale
    // one in the middle must not hold back a fresh one behind it, and it removes a named
    // reservation so a recorded failure can never go with it.
    let dropped = false;
    for (const [reservation, held] of entry.reserved) {
      if (now() - held.taken < reservationMs) continue;
      entry.reserved.delete(reservation);
      dropped = true;
    }
    if (dropped && charged(entry) === 0 && entry.reserved.size === 0) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  /**
   * A whole number, and zero is allowed for the limit because zero attempts is a bound a host can
   * want. Everything else is refused here rather than reinterpreted at the first comparison,
   * because the values that cannot be read are also the ones whose comparisons quietly succeed, and
   * a host that found out from the absence of a bound would have nothing to trace.
   */
  return {
    check: async (attempt) => {
      const key = await clientKey(attempt);
      const { reservation, position } = mint();
      const entry = read(key);
      // Before the branch that creates an entry, and not after it. A key nobody has looked at yet
      // has spent nothing, so the same comparison decides the first attempt as every one after it,
      // and `limit: 0` means zero attempts rather than one.
      const inUse = entry ? charged(entry) + entry.reserved.size : 0;
      if (inUse >= limit) return { ok: false, message };

      if (!entry) {
        entries.set(key, {
          failures: [],
          cleared: 0,
          until: now() + windowMs,
          reserved: new Map([[reservation, { taken: now(), position }]]),
        });
        return { ok: true, reservation };
      }
      // Failures and reservations are one budget, which is what makes the bound a bound: a slot
      // held by an attempt still running is a slot an attacker cannot spend twice.
      entry.reserved.set(reservation, { taken: now(), position });
      return { ok: true, reservation };
    },

    failed: async (attempt, reservation) => {
      const key = await clientKey(attempt);
      const entry = read(key);
      if (!entry) {
        // A report for a reservation this throttle no longer holds, which is a request that
        // reported after its own lease lapsed or a handle from a process that has restarted.
        // Counted rather than dropped: ignoring it is a free attempt for anyone who can hold a
        // connection open, and the slot it was holding has already been handed back, so counting
        // is what puts that budget back where the attempt left it. Placed after every success on
        // purpose, so no sign-in forgives it.
        entries.set(key, {
          failures: [minted + 1],
          cleared: 0,
          until: now() + windowMs,
          reserved: new Map(),
        });
        return;
      }
      // A refused attempt does not extend the window. It costs the caller nothing to send a
      // thousand of them, and a window that each one pushed forward would be a way to keep a
      // legitimate account locked out for as long as an attacker cared to hold the button.
      //
      // The named slot becomes the failure, so the budget is the same size afterwards, and the
      // failure is filed under the position that attempt was admitted at.
      const held = entry.reserved.get(reservation);
      entry.reserved.delete(reservation);
      entry.failures.push(held?.position ?? minted + 1);
    },

    succeeded: async (attempt, reservation) => {
      const key = await clientKey(attempt);
      const entry = read(key);
      if (!entry) return;
      const held = entry.reserved.get(reservation);
      // Only this attempt's slot. A concurrent attempt still running keeps its own, and a key
      // whose slots were all handed back here would let a burst through the moment one attempt in
      // it guessed right.
      entry.reserved.delete(reservation);
      // The failures this attempt was preceded by, which is what a good password forgives: the
      // typos the person made before they got it right. A failure from an attempt admitted after
      // this one is a later guess and stands, which is the claim narrowed to what survives a
      // concurrent sign-in, and taking the maximum is what makes the result the same whichever of
      // two reports arrived first. A success whose own reservation has lapsed cannot say what it
      // was preceded by, so it forgives nothing rather than guessing a position.
      if (held) entry.cleared = Math.max(entry.cleared, held.position);
      if (charged(entry) === 0 && entry.reserved.size === 0) entries.delete(key);
    },
  };
}
