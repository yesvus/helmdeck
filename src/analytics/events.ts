// SPDX-License-Identifier: MIT

/**
 * Something a visitor did, and the row it is stored as.
 *
 * The visitor key is the host's own value and nothing here derives one. A key built out of headers
 * and cookies is a fingerprinting decision and a consent decision at once, and both of them belong
 * to whoever runs the site, so the only way to get one is to pass one.
 */

/** The resource the rows are written to and read from, which a host maps onto its own table. */
export const ADMIN_ANALYTICS_RESOURCE = "analytics_events";

/** The kind a page view is recorded under, so a host can count views without naming its own. */
export const ADMIN_ANALYTICS_PAGE_VIEW = "page_view";

/** What to do with an event the host supplied no key for. */
export type AdminAnalyticsUnkeyed = "count" | "drop";

/**
 * A refused event, an unreadable range or an unusable window, named so the host can tell a refusal
 * of its own input from a store that was unreachable.
 */
export class AdminAnalyticsError extends Error {
  constructor(reason: string) {
    super(`That analytics call cannot be served: ${reason}`);
    this.name = "AdminAnalyticsError";
  }
}

/** What a host records. Every field is the host's, including the one that says who it was. */
export type AdminAnalyticsEvent = {
  /** What happened. A page view, or a name the host chose for something else. */
  kind: string;
  /** Where it happened, as the host groups it. A path is the usual answer. */
  path: string;
  /**
   * The key the host already considers this visitor to be, or null when it has none.
   *
   * A blank string counts as none, because a cookie that expired between reading it and writing this
   * is a blank string rather than an absent one, and a row filed under `""` would make every
   * unkeyed visit one visitor.
   */
  visitorKey?: string | null;
  /** Where the visit came from, as the host labels it. None means the host did not say. */
  source?: string | null;
  /** When it happened, as an ISO 8601 instant. The recorder's clock when absent. */
  at?: string;
};

/** The row as it is stored, which is also what a read hands back. */
export type AdminAnalyticsEventRow = {
  /** Named by the store, not here, because identity is the store's to assign. */
  id: string;
  kind: string;
  path: string;
  /**
   * The host's key exactly as it was passed, or null. This layer neither derives a key nor hashes
   * one, so a host that wants the stored row to hold a hash hashes before it calls.
   */
  visitor_key: string | null;
  source: string | null;
  /** An ISO 8601 instant in UTC, so a range compares these as the strings they are. */
  occurred_at: string;
};

/** The fields a host supplies, which is the stored row without the identity the store assigns. */
export type AdminAnalyticsEventValue = Omit<AdminAnalyticsEventRow, "id">;

/**
 * The longest each field may be, refused rather than shortened.
 *
 * A path comes off a URL and a source off a referrer, so both are as long as somebody types. The
 * visitor key's cap is the one with a reason behind it: a key is supposed to be something the host
 * derived and does not recognise, and a whole email address arriving here means a host that has not
 * decided what its key is yet, which is a row in this table that is a person rather than a visit.
 */
export const ADMIN_ANALYTICS_MAX_KIND = 64;
export const ADMIN_ANALYTICS_MAX_PATH = 512;
export const ADMIN_ANALYTICS_MAX_VISITOR_KEY = 128;
export const ADMIN_ANALYTICS_MAX_SOURCE = 128;

/**
 * A moment this layer can order, and the instant it normalises to.
 *
 * Only shapes that carry their own offset are accepted. SQLite's own `datetime('now')` yields
 * `2026-09-30 12:34:56` with a space and no zone, which `Date.parse` reads as a local time: a host
 * whose server is an hour out files every view on the wrong day and never sees why. A row this layer
 * wrote therefore always compares as the UTC string it is, and a moment it cannot place is refused
 * at the write rather than arriving later as a row no range can include.
 */
const INSTANT =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

const DAY = /^(\d{4}-\d{2}-\d{2})$/;

/** An ISO 8601 instant as a UTC string, or null when the value is not one. */
export function adminAnalyticsInstant(value: string): string | null {
  const text = value.trim();

  const day = DAY.exec(text);
  if (day) {
    const midnight = new Date(`${day[1]}T00:00:00.000Z`);
    return Number.isNaN(midnight.getTime()) ? null : midnight.toISOString();
  }

  const instant = INSTANT.exec(text);
  if (!instant) return null;
  const millis = Date.parse(text);
  return Number.isNaN(millis) ? null : new Date(millis).toISOString();
}

/** A field as the store holds it: trimmed, and empty read as nothing rather than as a blank. */
function text(value: unknown, what: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new AdminAnalyticsError(`${what} is ${typeof value}, which is not text.`);
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > max) {
    throw new AdminAnalyticsError(
      `${what} is ${trimmed.length} characters, above the ${max} this table holds. Shorten it at the ` +
        "call rather than here, because a path cut short is a path that reports a page nobody has.",
    );
  }
  return trimmed;
}

/** A field that has to be there, which is the difference between a row and a mistake. */
function required(value: unknown, what: string, max: number): string {
  const read = text(value, what, max);
  if (read === null) {
    throw new AdminAnalyticsError(`${what} is missing. An event without it is a row nothing can group.`);
  }
  return read;
}

export type AdminAnalyticsEventOptions = {
  /** The moment an event without a time of its own is stamped with. Defaults to the wall clock. */
  now?: () => Date;
};

/**
 * An event as the fields to write, or a refusal naming which field is wrong.
 *
 * The clock is injected rather than read, so a test can place an event on a day without waiting for
 * one, and so a host can stamp a batch of events with the moment the request started rather than the
 * moment each one happened to be serialised.
 */
export function adminAnalyticsEventValue(
  event: AdminAnalyticsEvent,
  options: AdminAnalyticsEventOptions = {},
): AdminAnalyticsEventValue {
  if (typeof event !== "object" || event === null) {
    throw new AdminAnalyticsError(`an event is an object, and this is ${typeof event}.`);
  }

  const kind = required(event.kind, "kind", ADMIN_ANALYTICS_MAX_KIND);
  const path = required(event.path, "path", ADMIN_ANALYTICS_MAX_PATH);
  const visitorKey = text(event.visitorKey, "visitorKey", ADMIN_ANALYTICS_MAX_VISITOR_KEY);
  const source = text(event.source, "source", ADMIN_ANALYTICS_MAX_SOURCE);

  const supplied = event.at === undefined ? null : text(event.at, "at", 64);
  if (event.at !== undefined && supplied === null) {
    throw new AdminAnalyticsError("at is blank, which is a moment nobody can place on a chart.");
  }
  const raw = supplied ?? (options.now?.() ?? new Date()).toISOString();
  const occurredAt = adminAnalyticsInstant(raw);
  if (occurredAt === null) {
    throw new AdminAnalyticsError(
      `at is ${JSON.stringify(raw)}, which is not a moment. Give an ISO 8601 instant carrying its own ` +
        "offset, such as 2026-09-30T12:00:00.000Z. A local time with no offset is refused because a " +
        "server in the wrong zone files every view on the wrong day.",
    );
  }

  return { kind, path, visitor_key: visitorKey, source, occurred_at: occurredAt };
}
