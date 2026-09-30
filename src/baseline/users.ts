// SPDX-License-Identifier: MIT
/**
 * An account and role surface over the credential store: create an account, change its role, turn it
 * off and back on, list accounts, list live sessions, and end a session by the id the host holds.
 *
 * **The three decisions this is built on, and the argument for each.**
 *
 * **1. The role lives on the account row, and the vocabulary is the host's.** The package stores a
 * string and never interprets one, because a role is whatever the host's own rule switches on, and a
 * rule written here would be a rule every host has to fight. What a host supplies is a `roles`
 * vocabulary, consulted on the two writes that name a role, and a `may` policy consulted on every
 * operation.
 *
 * What happens to an account whose role the rule does not define: it may still sign in, and the rule
 * refuses it. A rule that does not define a role grants it nothing, so there is no authorization to
 * defend by refusing the sign-in. The cost of the other answer is paid by the person at the
 * keyboard: a login that succeeds and then shows an empty admin is diagnosable, because the rule can
 * be asked what the role is and answer that it defines nothing, while a login refused for a reason
 * the person cannot see is a support ticket. So the store does not know what a role means, and only
 * the host's rule decides, which is the division `authenticate` and `mayEndAllSessions` already keep.
 *
 * **2. Turning an account off is a flag, and it ends the sessions that exist.** Not a delete, which
 * orphans the rows it authored and the trail describing what it did, and which cannot be undone. A
 * flag is reversible, and the sessions go in the same operation because a disabled account whose
 * live session keeps working is a disabled account with a hole in it, and the person turning it off
 * is usually doing so because of the session. The alternative costs a second button a host will
 * forget to press, and leaves a stolen cookie valid for its full lifetime.
 *
 * The sessions are ended before the flag flips, and the count is measured rather than taken from the
 * store's own answer. `setDisabled` says why below, and the part of it worth knowing before reading
 * the code is that "a disabled account cannot be used" and "nothing anywhere holds a usable session
 * for it" are two claims. The first is what this package can make, because every read of a session
 * goes through the store. The second is not: a session value already resolved is a claim about a
 * moment, and a server action that resolved one at the top of its request, or a browser provider
 * that has not been refreshed, is still holding it. The window is the holder's, not the session's.
 *
 * **3. `AdminSession` gained an optional `id`, which is what makes a session addressable.** The id is
 * the row's own, read from the row the signed cookie names, so a request cannot write it. It is
 * optional because a host's own `AdminAuthAdapter` may have no session table to have an id in, and
 * the migration is one option: `includeSessionId` on `createCredentialAuthAdapter`, which puts the id
 * on the session the host's server action already resolved, and `store.listSessions` for the ids to
 * come from. A host that turns neither on is unaffected, because the field is absent rather than
 * present and empty: a session that was `{ email, role }` is still exactly that under a deep
 * comparison, and a host's own session objects need no change.
 *
 * **This module is server-side**, like the credential store it sits on: it reaches `node:crypto`
 * through `hashPassword`, and it is handed the caller's session rather than resolving one, because
 * the resolver is the host's and a server action has already read the session to get this far. The
 * intended wiring is a server action or route handler, with these results passed to the browser.
 */

import type { AdminSession } from "../adapters/index.js";
import type { AccountRecord, CredentialStore } from "./credentials.js";
import { AccountAlreadyExistsError } from "./credentials.js";
import { hashPassword, normalizeEmail } from "./passwords.js";

/**
 * Why an operation was refused, as a value rather than as a sentence.
 *
 * A message is for the person who asked and is not for the host: "already invited" and "could not
 * create" are two states an admin screen renders differently, and telling them apart by matching
 * on prose is a check that breaks when someone improves the wording.
 */
export type AccountRefusalReason =
  /** The request carried no session, so there is nobody to permit. */
  | "no-session"
  /** The host's own policy does not permit this caller to do this. */
  | "not-permitted"
  /** The account named does not exist. */
  | "no-account"
  /** The store has not implemented the method this operation needs. */
  | "store-unsupported"
  /** The role is not one this host declared. */
  | "unknown-role"
  /** The password is shorter than the host's floor. */
  | "weak-password"
  /** The address already has an account, whether this call found it or the store refused the write. */
  | "email-taken"
  /**
   * The account is off and at least one of its sessions is still a row.
   *
   * Not a failure to disable, which is why it is a distinct reason: the account is off and every
   * request through it will be refused, so the operator's next question is whether anyone is still
   * signed in, and this is the answer that says they might be.
   */
  | "sessions-survived";

/** Why an operation was refused, and the sentence to show the person who asked. */
export type AccountRefusal = { ok: false; reason: AccountRefusalReason; message: string };

/**
 * One operation's answer: what it produced, or why it did not.
 *
 * A refusal and a success are different answers rather than one answer with a null in it, because a
 * caller that cannot tell them apart reports a list of nothing for a request it was never allowed to
 * make, which reads as an empty account list rather than as a refusal.
 */
export type AccountResult<T> = ({ ok: true } & T) | AccountRefusal;

/**
 * A session row as an operator sees it, with the account it belongs to attached.
 *
 * `current` is the only reason `AdminSession` needed an id: a list of live sessions has to be able to
 * say which row is the caller's own, and the only value that can say so is the one the caller's
 * session already carries.
 */
export type AccountSession = {
  /** The row's own id, and the value `endSession` takes. */
  id: string;
  accountId: string;
  email: string;
  role?: string;
  /** Whether the account behind this row is turned off, which is a state the surface cannot produce. */
  disabled: boolean;
  /** Seconds since the epoch, as the row holds it. */
  expiresAt: number;
  /** Whether this is the session the caller arrived on. */
  current: boolean;
};

export type CreateAccountInput = {
  email: string;
  /** In the clear exactly once, here. It is hashed before it reaches the store and never answered with. */
  password: string;
  role?: string;
  name?: string;
};

/**
 * The host's answers, because the package has none of its own.
 *
 * The session every predicate is handed is the one the host's server action resolved, so its role is
 * a stored value rather than something a request can name. Absent means refused throughout, for the
 * reason `mayEndAllSessions` is absent-means-refused: a capability that is off unless a host turns
 * it on cannot be reached by a host that has not thought about it.
 */
export type AccountAdminPolicy = {
  may?: {
    list?: (session: AdminSession) => boolean | Promise<boolean>;
    create?: (session: AdminSession, input: CreateAccountInput) => boolean | Promise<boolean>;
    /**
     * Decided about the id the caller named, not about the row behind it, so the question is asked
     * before the store is reached and a caller with no permission never causes a read.
     *
     * This is the shape `AdminPermissionRule` already takes: a rule is asked about an id in a
     * context, and a host that wants to decide on the record looks it up in its own rule. Reading
     * the row here would mean a caller who may not manage anything could still ask the database
     * which account ids exist, one refused call at a time.
     */
    setRole?: (session: AdminSession, accountId: string) => boolean | Promise<boolean>;
    setDisabled?: (session: AdminSession, accountId: string) => boolean | Promise<boolean>;
    listSessions?: (session: AdminSession) => boolean | Promise<boolean>;
    /** Also decided about the id, so a rule can refuse one session and permit another. */
    endSession?: (session: AdminSession, sessionId: string) => boolean | Promise<boolean>;
  };
  /**
   * The roles this host has, as a list because the package has no idea what any of them mean.
   *
   * Consulted on a write that names a role, so a typo is refused before it becomes an account that
   * signs in and sees nothing. Not consulted on a sign-in, for the reason in the module docstring. An
   * absent list means this host has not said what a role is, so any string is written and the host's
   * own rule is what decides what it may do.
   */
  roles?: readonly string[];
  /**
   * The length a password has to reach, refused before the hash is derived, so a short one costs
   * nothing to reject. Twelve is the floor rather than a recommendation, and a host with a rule of its
   * own passes it here.
   */
  minPasswordLength?: number;
  noSessionMessage?: string;
  notPermittedMessage?: string;
  noAccountMessage?: string;
};

export type AccountAdmin = {
  /** The roles this host declared, for a form to offer. Empty when it declared none. */
  readonly roles: readonly string[];
  /** Every account, with no hash on any of them. */
  list: (session: AdminSession | null) => Promise<AccountResult<{ accounts: AccountRecord[] }>>;
  create: (
    session: AdminSession | null,
    input: CreateAccountInput,
  ) => Promise<AccountResult<{ account: AccountRecord }>>;
  /**
   * Puts a role on an account, or takes it away with an empty string.
   *
   * An empty role is written as no role at all rather than as an empty one, which is the answer an
   * account with nothing on it gets: the rule decides what no role may do, and that is nothing.
   */
  setRole: (
    session: AdminSession | null,
    accountId: string,
    role: string,
  ) => Promise<AccountResult<{ account: AccountRecord }>>;
  /**
   * Turns an account off and ends every session it holds, or turns it back on.
   *
   * `ended` is the number of live sessions this measured going away, which is null rather than a
   * number when the store cannot list its sessions and the figure is therefore not knowable from
   * here. A store that leaves a session behind is answered `sessions-survived` rather than with a
   * count, because the count a store reports about itself is a claim and this checks it.
   *
   * **What a disable does not reach.** Ending the sessions and refusing the account are two moments,
   * and a resolved session object outlives both: a server action that read the session at the top of
   * its request keeps that object for the rest of the request, and `AdminAuthProvider` keeps one in
   * the browser until the host calls its `refresh`. Neither is a credential that keeps working. The
   * next read of the session goes through the store, which sees the flag and refuses, and the
   * permission rule is asked at the decision rather than being handed an object. But a value already
   * resolved is a claim about a moment, and a host holding one for a long time is holding a claim
   * about a moment that has passed.
   */
  setDisabled: (
    session: AdminSession | null,
    accountId: string,
    disabled: boolean,
  ) => Promise<AccountResult<{ account: AccountRecord; ended: number | null }>>;
  /** The live sessions, for a list that can offer to end one. */
  listSessions: (session: AdminSession | null) => Promise<AccountResult<{ sessions: AccountSession[] }>>;
  /**
   * Ends one session by the id the caller was given.
   *
   * A session that has already ended is a success with `ended: false` rather than a refusal, because
   * two browsers pressing the same button is the ordinary case and neither of them did anything
   * wrong. A refusal is reserved for a caller the host's policy does not permit.
   */
  endSession: (
    session: AdminSession | null,
    sessionId: string,
  ) => Promise<AccountResult<{ ended: boolean }>>;
};

/** Twelve, which is the floor rather than a recommendation, and matches the starter template's own. */
const DEFAULT_MIN_PASSWORD_LENGTH = 12;

/**
 * The work in flight for one address, so two creates of the same address cannot both pass the check.
 *
 * **This is the part that makes the check-then-write atomic, and it is per process.** Two admin
 * requests reaching the same instance are the case the finding describes, and serialising them here
 * closes it without a schema question. It is not a uniqueness guarantee across processes: two
 * instances of a deployed app racing on one database are not serialised by anything in this module,
 * and the store's own constraint is what covers that. A store that has no constraint therefore gets
 * the in-process guarantee and not the cross-process one, which is why `createUser` is documented as
 * having to refuse a duplicate address itself.
 *
 * Keyed by the normalised address, which is why normalisation happens before this rather than
 * inside it: two spellings of one address must reach the same queue or the queue is decoration.
 *
 * A `Map` rather than a promise chain per call because the entry has to be removed when the work
 * finishes, or a long-running host accumulates one entry per address it has ever seen.
 */
const inFlight = new Map<string, Promise<unknown>>();

function serialiseOnAddress<T>(email: string, work: () => Promise<T>): Promise<T> {
  const running = inFlight.get(email) ?? Promise.resolve();
  // A rejection here must not become the next call's failure, or one refused create would refuse
  // every later create of that address for as long as the process ran.
  const result = running.then(work, work);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  inFlight.set(email, settled);
  void settled.then(() => {
    if (inFlight.get(email) === settled) inFlight.delete(email);
  });
  return result;
}

/**
 * The account and role surface over a credential store.
 *
 * Every operation is handed the caller's session rather than resolving one, so the identity the
 * policy decides on and the identity a request named cannot be two different accounts. A caller that
 * passes a session it was handed by a request is asserting something rather than authorizing
 * anything, which is the hazard `endAllSessions` is built against.
 *
 * Every operation asks the policy before the store is touched at all, so a refused call is
 * observably a refusal: a caller with no permission cannot use any of them to ask which accounts or
 * sessions exist.
 */
export function createAccountAdmin(
  store: CredentialStore,
  policy: AccountAdminPolicy = {},
): AccountAdmin {
  if (!store) {
    throw new Error("createAccountAdmin needs a store to keep user and session rows in");
  }
  const minPasswordLength = policy.minPasswordLength ?? DEFAULT_MIN_PASSWORD_LENGTH;
  const roles = policy.roles ?? [];
  const noSession = policy.noSessionMessage ?? "There is no session to do this as.";
  const notPermitted = policy.notPermittedMessage ?? "This account may not do that.";
  const noAccount = policy.noAccountMessage ?? "There is no such account.";

  /**
   * A role outside the declared vocabulary, refused with the name and the list, because a refusal a
   * host cannot act on is a support ticket.
   *
   * An absent or empty role is not one of these. It is the same answer an account with nothing on
   * it gets, which is that the rule decides and grants nothing, and it is how a role is taken away
   * rather than replaced.
   */
  function unknownRole(role: string | undefined): AccountRefusal | null {
    if (policy.roles === undefined || !role || roles.includes(role)) return null;
    const known = roles.length === 0 ? "none" : roles.map((name) => `"${name}"`).join(", ");
    return {
      ok: false,
      reason: "unknown-role",
      message: `This host has no role called "${role}". It has ${known}.`,
    };
  }

  /**
   * The address is spoken for, whether this call found the account or the store refused the write.
   *
   * One refusal for both, because a caller cannot tell which happened and an admin screen that can
   * tell is showing the internals of a race to the operator rather than a state to act on.
   */
  function taken(email: string): AccountRefusal {
    return {
      ok: false,
      reason: "email-taken",
      message: `${email} already has an account. Change its role or turn it off rather than making a second one.`,
    };
  }

  /**
   * A store that has not implemented one of the four account methods.
   *
   * The method is named because the reader is a host who is about to write it, and an empty list
   * is the one answer that cannot be told apart from an admin with nobody in it.
   */
  function capabilityMessage(what: string, method: string): AccountRefusal {
    return {
      ok: false,
      reason: "store-unsupported",
      message: `This store cannot ${what}, because it does not implement ${method}.`,
    };
  }

  return {
    roles,

    async list(session) {
      if (!session) return { ok: false, reason: "no-session", message: noSession };
      if (!(await policy.may?.list?.(session))) return { ok: false, reason: "not-permitted", message: notPermitted };
      if (!store.listUsers) return capabilityMessage("list its accounts", "listUsers");
      return { ok: true, accounts: await store.listUsers() };
    },

    async create(session, input) {
      if (!session) return { ok: false, reason: "no-session", message: noSession };
      if (!(await policy.may?.create?.(session, input))) return { ok: false, reason: "not-permitted", message: notPermitted };
      if (!store.createUser) return capabilityMessage("create an account", "createUser");
      if (input.password.length < minPasswordLength) {
        return {
          ok: false,
          reason: "weak-password",
          message: `That password is shorter than ${minPasswordLength} characters. Choose a longer one.`,
        };
      }
      const roleRefusal = unknownRole(input.role);
      if (roleRefusal) return roleRefusal;

      // Normalised here rather than by the store, so a pasted or capitalised address cannot become
      // a second account for the same person, which is the answer a unique index cannot give once
      // the two spellings are already different.
      const email = normalizeEmail(input.email);
      // Read once, outside the queue, because a narrowing that does not survive into a closure is a
      // narrowing the compiler cannot see and the reader cannot either.
      const createUser = store.createUser.bind(store);

      return serialiseOnAddress(email, async () => {
        // **What this check is for: the message, not the uniqueness.** It is a read followed by a
        // write, so on its own it cannot prevent a duplicate, and it is not what does: the queue
        // below is, within a process, and the store's own constraint is across them. It is here
        // because it turns the ordinary case, a second invite to an address that already has an
        // account, into a sentence naming that address rather than an error raised and caught.
        if (await store.findUserByEmail(email)) return taken(email);
        // Derived inside the queue rather than before it, which refuses a duplicate before paying
        // for a key derivation, and leaves nothing between a call and the store but the queue and
        // the check above. That is what makes the serialisation a property a test can hold to
        // without waiting on a machine: scrypt between here and the store would put real elapsed
        // time between two calls, and a test that needs elapsed time to see a race cannot be a
        // reliable one.
        const passwordHash = await hashPassword(input.password);
        try {
          const account = await createUser({
            email,
            passwordHash,
            ...(input.role === undefined ? {} : { role: input.role }),
            ...(input.name === undefined ? {} : { name: input.name }),
          });
          return { ok: true, account };
        } catch (cause) {
          // The half of this that covers another process, and the reason the store has a documented
          // way to refuse. A store whose address is unique refuses the second write itself, and
          // that refusal arrives as whatever error the store raises; `AccountAlreadyExistsError` is
          // how a store says it in a shape this can recognise. Anything else is a failure to create
          // rather than a duplicate, and letting it through is the honest answer: a refusal here
          // that reported success would be worse than a throw.
          if (cause instanceof AccountAlreadyExistsError) return taken(email);
          throw cause;
        }
      });
    },

    async setRole(session, accountId, role) {
      if (!session) return { ok: false, reason: "no-session", message: noSession };
      if (!(await policy.may?.setRole?.(session, accountId))) {
        return { ok: false, reason: "not-permitted", message: notPermitted };
      }
      if (!store.updateUser) return capabilityMessage("change an account", "updateUser");
      const roleRefusal = unknownRole(role);
      if (roleRefusal) return roleRefusal;
      if (!(await store.findUserById(accountId))) return { ok: false, reason: "no-account", message: noAccount };
      // An empty role is written as a null, so a column a listing reads comes back as no role rather
      // than as a role nobody defined.
      return { ok: true, account: await store.updateUser(accountId, { role: role || null }) };
    },

    async setDisabled(session, accountId, disabled) {
      if (!session) return { ok: false, reason: "no-session", message: noSession };
      if (!(await policy.may?.setDisabled?.(session, accountId))) {
        return { ok: false, reason: "not-permitted", message: notPermitted };
      }
      if (!store.updateUser) return capabilityMessage("change an account", "updateUser");
      if (!(await store.findUserById(accountId))) return { ok: false, reason: "no-account", message: noAccount };

      // Turning back on ends nothing, so there is nothing to end and the count says so rather than
      // being a number a host has to read twice to learn it was nothing.
      if (!disabled) {
        return { ok: true, account: await store.updateUser(accountId, { disabled: false }), ended: 0 };
      }

      /**
       * **Revoked before the flag flips, and that order is the fix.** The two halves of a disable are
       * the sessions and the account, and which one goes first decides what a failure leaves behind.
       * Ending the account first and the sessions second means a store that cannot delete leaves an
       * account that is off with a session still live, and a caller that was handed an exception
       * rather than an answer, so nobody learns that the person is still signed in. Revoking first
       * means a failure leaves the account on, which is the state the caller asked to change away
       * from and a retry can repeat.
       *
       * The count is measured rather than believed. A store's own number is a claim about the store,
       * and a store that returns one it did not check would have this report a success it cannot
       * vouch for, which is the shape of defect a "done" in an admin screen must never have. So the
       * sessions are counted before and after, and any that survived is a refusal rather than a
       * count: the read path refuses them either way, so this is not the only thing standing between
       * a disabled account and a working session, and the refusal says so instead of implying the
       * rows are gone.
       */
      const countable = typeof store.listSessions === "function";
      const before = countable ? (await store.listSessions!(accountId)).length : null;
      await store.deleteSessionsForUser(accountId);
      const after = countable ? (await store.listSessions!(accountId)).length : null;
      const account = await store.updateUser(accountId, { disabled: true });

      if (after !== null && after > 0) {
        return {
          ok: false,
          reason: "sessions-survived",
          message: `The account is off, but ${after} of its sessions could not be ended. They are refused on the next request, and the rows are still there.`,
        };
      }
      return { ok: true, account, ended: before === null || after === null ? null : before - after };
    },

    async listSessions(session) {
      if (!session) return { ok: false, reason: "no-session", message: noSession };
      if (!(await policy.may?.listSessions?.(session))) return { ok: false, reason: "not-permitted", message: notPermitted };
      if (!store.listSessions) return capabilityMessage("list its sessions", "listSessions");
      const rows = await store.listSessions();
      const sessions = await Promise.all(
        rows.map(async (row): Promise<AccountSession | null> => {
          const account = await store.findUserById(row.userId);
          // A row whose account is gone is not a session anybody may look at, and a listing is not
          // the place to discover that the store is inconsistent.
          if (!account) return null;
          return {
            id: row.id,
            accountId: row.userId,
            email: account.email,
            ...(account.role === undefined ? {} : { role: account.role }),
            disabled: account.disabled === true,
            expiresAt: row.expiresAt,
            current: session.id === row.id,
          };
        }),
      );
      return { ok: true, sessions: sessions.filter((row): row is AccountSession => row !== null) };
    },

    async endSession(session, sessionId) {
      if (!session) return { ok: false, reason: "no-session", message: noSession };
      // Asked before the store is read, so a caller without the capability cannot use this to ask
      // which session ids exist, which is what a read-then-refuse would hand them.
      if (!(await policy.may?.endSession?.(session, sessionId))) {
        return { ok: false, reason: "not-permitted", message: notPermitted };
      }
      const row = await store.readSession(sessionId);
      if (!row) return { ok: true, ended: false };
      await store.deleteSession(sessionId);
      return { ok: true, ended: true };
    },
  };
}

