// SPDX-License-Identifier: MIT

/**
 * Password recovery over a transport the host supplies.
 *
 * The demo's accounts are seeded, there is no sign-up, and one password is printed on the login
 * page, so nobody forgets it and nobody needs this. That is exactly why the module takes its
 * transport from the host rather than owning one: a deployment with real accounts swaps in its own
 * sender, and this deployment ships one that is off.
 *
 * The seam is the point. `RecoveryTransport` is two functions, one that mints a token and one that
 * hands it over, and both belong to the host. Nothing here decides what a token looks like, where it
 * goes, how often someone may ask for one, or what a new password is set to, because each of those
 * is a decision a host makes with its own users and its own mailer in mind.
 *
 * What this module does own is the part that is easy to get wrong quietly: what is written down
 * while a token is outstanding. Only a scrypt digest of the token is kept, under a salt minted per
 * request, so a copy of the store is not a list of working reset links. A record is spent on use,
 * dropped on expiry, and replaced when the same account asks again, so the outstanding set is
 * smaller than the account list and a captured token stops working on its own.
 *
 * Two answers leave this module for the same request either way. An address nobody has gets the
 * cost of a real issuance and nothing else, because a response that arrives sooner, or reads
 * differently, is a way of asking which addresses have accounts.
 */

import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { demoAccounts } from "./demo-accounts";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SALT_BYTES = 16;
const DIGEST_BYTES = 32;

/** Fifteen minutes. Long enough to read a message, short enough that a captured link is nearly worthless. */
export const RECOVERY_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * The confirmation, the refusal and the answer to a spent token.
 *
 * Held here rather than written at each call site so the confirmation has one spelling. A host that
 * writes its own is how the enumeration oracle gets shipped.
 */
export const RECOVERY_CONFIRMATION =
  "If that address has an account, a reset link is on its way. It is good for fifteen minutes.";
export const RECOVERY_NOT_CONFIGURED =
  "Password recovery is not configured on this deployment, so no reset link was sent.";
export const RECOVERY_SPENT_TOKEN = "That reset link is no longer valid.";

export type RecoveryDelivery = {
  email: string;
  token: string;
  expiresAt: Date;
};

export type RecoveryTransport = {
  /** Mints the token. Its format, its entropy and its length are the host's to choose. */
  issueToken: (request: { email: string; expiresAt: Date }) => string | Promise<string>;
  /** Hands the token to the account. The channel is the host's, and so is every decision behind it. */
  send: (delivery: RecoveryDelivery) => void | Promise<void>;
};

export type DemoRecoveryOptions = {
  /** Absent means there is nowhere to send a link, which is what this deployment is. */
  transport?: RecoveryTransport;
  /** Milliseconds since the epoch, so a test can reach the end of a token's life without waiting. */
  now?: () => number;
  /** Names the record, so a test can name it too. */
  newId?: () => string;
  /**
   * Told when a host's sender failed. The answer to the visitor does not change either way, because
   * a request that reports its own delivery failures is one that answers differently for an address
   * it could not find.
   */
  onDeliveryError?: (error: unknown) => void;
};

/** What a request came back with. The two answers do not depend on whether the address has an account. */
export type RecoveryRequestOutcome =
  | { ok: true; status: "accepted"; message: string }
  | { ok: false; status: "not-configured"; message: string };

/** What a presented token was worth. The account comes back so the host can update its own password. */
export type RecoveryRedeemOutcome =
  | { ok: true; status: "redeemed"; accountId: string; email: string }
  | { ok: false; status: "spent"; message: string };

type RecoveryRecord = {
  accountId: string;
  salt: Buffer;
  digest: Buffer;
  /** Milliseconds since the epoch, compared on read rather than left to a sweep. */
  expiresAt: number;
};

/**
 * Outstanding tokens, and nothing else.
 *
 * A map rather than a table, because a token that only has to outlive a mail hop does not earn a
 * migration, and a demo that added one would be asking a database to hold credentials for a flow it
 * has no account of. It holds outstanding tokens and no history, so a record here has one meaning:
 * this token still works, and it works once.
 */
const records = new Map<string, RecoveryRecord>();

export type DemoRecovery = {
  /** Whether a host has given this module somewhere to send a link. */
  readonly configured: boolean;
  request: (email: string) => Promise<RecoveryRequestOutcome>;
  redeem: (token: string) => Promise<RecoveryRedeemOutcome>;
};

export function createDemoRecovery(options: DemoRecoveryOptions = {}): DemoRecovery {
  const transport = options.transport;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? randomUUID;

  /**
   * A value that is not a number expires rather than reading as valid, the same way a session's
   * expiry does: `NaN <= now` is false, so the comparison alone would treat an unparseable expiry as
   * a token that never lapses.
   */
  function expired(record: RecoveryRecord): boolean {
    return !Number.isFinite(record.expiresAt) || record.expiresAt <= now();
  }

  /** Every outstanding token for one account, dropped as they are read. */
  function prune(): void {
    for (const [id, record] of records) {
      if (expired(record)) records.delete(id);
    }
  }

  async function digestOf(token: string, salt: Buffer): Promise<Buffer> {
    return scrypt(token, salt, DIGEST_BYTES);
  }

  /**
   * The record a token is worth, or null. Every outstanding record is tried, because a digest is
   * only comparable against the salt it was made with, and the set is small for a reason: asking
   * again replaces, so what is here is the accounts that have asked and have not been served yet.
   */
  async function find(token: string): Promise<{ id: string; record: RecoveryRecord } | null> {
    prune();
    for (const [id, record] of records) {
      const digest = await digestOf(token, record.salt);
      if (digest.length === record.digest.length && timingSafeEqual(digest, record.digest)) {
        return { id, record };
      }
    }
    return null;
  }

  function forget(accountId: string, except?: string): void {
    for (const [id, record] of records) {
      if (record.accountId === accountId && id !== except) records.delete(id);
    }
  }

  return {
    configured: transport !== undefined,

    async request(email) {
      if (!transport) return { ok: false, status: "not-configured", message: RECOVERY_NOT_CONFIGURED };

      const addressed = email.toLowerCase().trim();
      const account = demoAccounts.find((candidate) => candidate.email === addressed);
      const expiresAt = new Date(now() + RECOVERY_TOKEN_TTL_SECONDS * 1000);

      const token = await transport.issueToken({ email: addressed, expiresAt });
      if (account) {
        // Minting first, so a host whose issuer fails is answered the same way for both.
        const salt = randomBytes(SALT_BYTES);
        forget(account.id);
        records.set(newId(), { accountId: account.id, salt, digest: await digestOf(token, salt), expiresAt: expiresAt.getTime() });
      } else {
        // The expensive part of an issuance, paid for an address with no account, and the record it
        // would have written thrown away: nothing that cannot be delivered leaves this process.
        await digestOf(token, randomBytes(SALT_BYTES));
      }

      if (account) {
        try {
          await transport.send({ email: addressed, token, expiresAt });
        } catch (cause) {
          options.onDeliveryError?.(cause);
        }
      }
      return { ok: true, status: "accepted", message: RECOVERY_CONFIRMATION };
    },

    /**
     * What a presented token was worth, and what the host should do about it.
     *
     * The credential update itself is not here. It belongs to whoever owns the accounts, and in this
     * fixture the accounts are seeded and shared, so changing one would take the published password
     * away from every other visitor.
     */
    async redeem(token) {
      const presented = token.trim();
      const match = presented ? await find(presented) : null;
      if (!match) return { ok: false, status: "spent", message: RECOVERY_SPENT_TOKEN };

      records.delete(match.id);
      forget(match.record.accountId);
      const account = demoAccounts.find((candidate) => candidate.id === match.record.accountId);

      // A record whose account is no longer there resolves nothing rather than a stranger's account.
      if (!account) return { ok: false, status: "spent", message: RECOVERY_SPENT_TOKEN };
      return { ok: true, status: "redeemed", accountId: account.id, email: account.email };
    },
  };
}

/** Everything the store is holding, as text, so a host or a test can read what is at rest. */
export function recoveryRecords(): ReadonlyArray<{
  id: string;
  accountId: string;
  salt: string;
  digest: string;
  expiresAt: number;
}> {
  return [...records.entries()].map(([id, record]) => ({
    id,
    accountId: record.accountId,
    salt: record.salt.toString("base64"),
    digest: record.digest.toString("base64"),
    expiresAt: record.expiresAt,
  }));
}

/** Empties the store, for a test that wants the record count to start at nothing. */
export function resetDemoRecovery(): void {
  records.clear();
}

/**
 * The demo's sender, which is a POST to wherever the operator of this deployment says.
 *
 * A webhook rather than a mailer because the demo ships no credentials and no provider: an endpoint
 * the operator runs is the one sending path available to a host that has neither, and it keeps the
 * channel outside this process. It is off unless `HELMDECK_RECOVERY_WEBHOOK` names an endpoint.
 */
function webhook(url: string): RecoveryTransport {
  return {
    issueToken: () => randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
    async send({ email, token, expiresAt }) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, token, expiresAt: expiresAt.toISOString() }),
        // A redirect would replay this body to wherever it points, which is the token arriving at a
        // host that was never told about it.
        redirect: "error",
      });
      if (!response.ok) {
        throw new Error(`The recovery endpoint answered ${response.status}.`);
      }
    },
  };
}

/**
 * The host's sender, from the environment, or nothing.
 *
 * Nothing is the answer this deployment gives, and it says so on the login page rather than
 * accepting a request it cannot serve. A token that goes nowhere leaves nothing behind to be
 * replayed from, which is the whole reason the default is off rather than a console line.
 */
export function demoRecoveryTransport(env: NodeJS.ProcessEnv = process.env): RecoveryTransport | undefined {
  const url = env.HELMDECK_RECOVERY_WEBHOOK?.trim();
  return url ? webhook(url) : undefined;
}

let instance: DemoRecovery | null = null;

export function demoRecovery(): DemoRecovery {
  instance ??= createDemoRecovery({
    transport: demoRecoveryTransport(),
    onDeliveryError: (error) => console.warn("Password recovery delivery failed.", error),
  });
  return instance;
}
