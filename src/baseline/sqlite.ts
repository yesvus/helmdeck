// SPDX-License-Identifier: MIT
/**
 * A persistence adapter over SQLite, needing nothing but a URL to run.
 *
 * Storage is one table of JSON documents keyed by resource and id rather than one table per
 * resource. That is the whole reason it needs no configuration: a resource is a value in a
 * column, so any resource works on the first call without anyone declaring its columns first,
 * and a host starting out does not have to design a schema before it can store anything.
 *
 * The cost is real and is stated rather than hidden. A filter runs through `json_extract`, which
 * SQLite cannot index the way it can a column, so this is the adapter to start on and to replace
 * with a mapped schema once a resource is large enough that the scan shows. The seam is the same
 * `AdminPersistenceAdapter` either way.
 */
import type { AdminPersistenceAdapter } from "../adapters/index.js";

export type SqlitePersistenceOptions = {
  /**
   * `file:./helmdeck.db` for a local file, `libsql://` with an auth token for hosted.
   * A path with no scheme is treated as a file path, since that is what a host means by one.
   */
  url: string;
  /** Hosted connections only. Never a local file. */
  authToken?: string;
  /** Override the table. Must be a bare identifier, because it cannot be a bound value. */
  table?: string;
};

/** One table name reaches string concatenation, so it is checked rather than escaped. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const DEFAULT_TABLE = "helmdeck_records";

/**
 * JSON paths name a member with a quoted segment, so a key containing a quote or a space still
 * addresses the member it means. The path is bound as a value rather than interpolated, so a key
 * cannot reach SQL: the escaping below is about the path being well-formed, not about safety.
 */
function pathFor(key: string): string {
  return `$."${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function storageUrl(url: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith("file:") ? url : `file:${url}`;
}

type Predicate = { sql: string; args: unknown[] };

/**
 * Builds one exact-match condition, checking the stored JSON's type as well as its value.
 *
 * Comparing `json_extract` alone gets three cases wrong, each in a way that silently returns the
 * wrong rows rather than failing. SQLite reports a stored `null` and an absent path as the same SQL
 * NULL, and `anything = NULL` matches nothing, so a record storing `null` could not be found at all.
 * SQLite turns a stored `true` into `1`, so a filter for `1` would match it. And a stored `"5"` would
 * otherwise be answerable by a filter for the number `5`.
 *
 * `json_type` names what is stored, so each predicate states the type it expects. That is the same
 * thing the in-memory adapter gets for free from `===`, which compares a boolean and a number as
 * different rather than as the same integer.
 */
function predicateFor(key: string, value: unknown): Predicate {
  const path = pathFor(key);

  if (value === null) {
    return { sql: "json_type(data, ?) = 'null'", args: [path] };
  }
  if (typeof value === "boolean") {
    return { sql: "json_type(data, ?) = ?", args: [path, value ? "true" : "false"] };
  }
  if (typeof value === "number" || typeof value === "string") {
    const expected = typeof value === "number" ? "('integer', 'real')" : "('text')";
    return {
      sql: `json_type(data, ?) IN ${expected} AND json_extract(data, ?) = ?`,
      args: [path, path, value],
    };
  }

  const shape = Array.isArray(value) ? "array" : typeof value;
  throw new Error(
    `A filter on "${key}" must be a string, number, boolean or null, because a filter compares one ` +
      `stored value at a time. An ${shape} is stored as a JSON document, and SQLite can only compare ` +
      `documents as text, which matches on key order rather than on the document.`,
  );
}

type SqlResult = {
  rows: unknown[][];
  columns?: string[];
  rowsAffected?: number;
};

type SqlClient = {
  execute: (statement: { sql: string; args?: unknown[] }) => Promise<SqlResult>;
};

/**
 * Builds the adapter, connecting lazily so importing this module costs no I/O and so a client
 * bundle never has to resolve a database driver it will never call.
 */
export function createSqlitePersistenceAdapter(options: SqlitePersistenceOptions): AdminPersistenceAdapter {
  const table = options.table ?? DEFAULT_TABLE;
  if (!IDENTIFIER.test(table)) {
    throw new Error(
      `"${table}" cannot be a table name; use letters, digits and underscores, starting with a letter`,
    );
  }

  let clientPromise: Promise<SqlClient> | null = null;

  async function client(): Promise<SqlClient> {
    clientPromise ??= (async () => {
      let createClient: (config: { url: string; authToken?: string }) => SqlClient;
      try {
        ({ createClient } = (await import("@libsql/client")) as unknown as {
          createClient: (config: { url: string; authToken?: string }) => SqlClient;
        });
      } catch (cause) {
        throw new Error(
          "@libsql/client could not be loaded, so persistence has nowhere to store records",
          { cause },
        );
      }
      const instance = createClient({
        url: storageUrl(options.url),
        ...(options.authToken ? { authToken: options.authToken } : {}),
      });
      // If a table already holds data, this is a no-op; if it does not, the adapter is usable
      // on the first call, which is what zero-config means. Concurrent callers share the promise.
      await instance.execute({
        sql: `CREATE TABLE IF NOT EXISTS ${table} (
                resource TEXT NOT NULL,
                id TEXT NOT NULL,
                data TEXT NOT NULL,
                PRIMARY KEY (resource, id)
              )`,
      });
      return instance;
    })();
    return clientPromise;
  }

  function toRecords<T>(result: SqlResult): T[] {
    const columns = result.columns;
    if (!columns) {
      throw new Error("A SQLite result needs column names; received rows without them");
    }
    const dataIndex = columns.indexOf("data");
    if (dataIndex === -1) {
      throw new Error(`Expected a data column in ${table}; received ${columns.join(", ")}`);
    }
    return result.rows.map((values) => JSON.parse(String(values[dataIndex])) as T);
  }

  return {
    async read<T>(resource: string, id: string): Promise<T | null> {
      const db = await client();
      const result = await db.execute({
        sql: `SELECT data FROM ${table} WHERE resource = ? AND id = ?`,
        args: [resource, id],
      });
      return toRecords<T>(result)[0] ?? null;
    },

    async query<T>(resource: string, query?: Record<string, unknown>): Promise<T[]> {
      const db = await client();
      const filters = Object.entries(query ?? {}).filter(([, value]) => value !== undefined);
      // An undefined filter is an unset field, not a field set to nothing. Comparing against NULL
      // matches no row in SQL, so keeping it would silently return an empty result where the in-
      // memory adapter returns everything.
      if (filters.length === 0) {
        return toRecords<T>(
          await db.execute({ sql: `SELECT data FROM ${table} WHERE resource = ?`, args: [resource] }),
        );
      }
      const predicates = filters.map(([key, value]) => predicateFor(key, value));
      const where = predicates.map((predicate) => predicate.sql).join(" AND ");
      const args: unknown[] = [resource];
      for (const predicate of predicates) args.push(...predicate.args);
      return toRecords<T>(
        await db.execute({ sql: `SELECT data FROM ${table} WHERE resource = ? AND ${where}`, args }),
      );
    },

    async create<T>(resource: string, value: unknown): Promise<T> {
      const db = await client();
      const record = { ...(value as Record<string, unknown>) };
      // A database honours an id it is given. The in-memory adapter always generates one, which
      // would renumber records a seeded parent row already points at; a stored foreign key has no
      // second chance to be rewritten, so this must keep the id it was handed.
      const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();
      const stored = { ...record, id };
      await db.execute({
        sql: `INSERT INTO ${table} (resource, id, data) VALUES (?, ?, ?)`,
        args: [resource, id, JSON.stringify(stored)],
      });
      return stored as T;
    },

    async update<T>(resource: string, id: string, value: unknown): Promise<T> {
      const db = await client();
      const stored = { ...(value as Record<string, unknown>), id };
      const result = await db.execute({
        sql: `UPDATE ${table} SET data = ? WHERE resource = ? AND id = ?`,
        args: [JSON.stringify(stored), resource, id],
      });
      // A write that matched nothing is a record that is not there, and reporting success would
      // let a caller believe an edit landed on a row that never existed.
      if (!result.rowsAffected) {
        throw new Error(`No ${resource} record with id ${id}`);
      }
      return stored as T;
    },

    async delete(resource: string, id: string): Promise<void> {
      const db = await client();
      await db.execute({ sql: `DELETE FROM ${table} WHERE resource = ? AND id = ?`, args: [resource, id] });
    },
  };
}
