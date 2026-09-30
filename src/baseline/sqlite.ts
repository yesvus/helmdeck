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
import {
  parseAdminResourceQuery,
  type AdminPersistenceAdapter,
  type AdminResourceFilter,
  type AdminResourceFilterValue,
  type AdminResourcePage,
  type AdminResourceQuery,
  type AdminResourceSort,
} from "../adapters/index.js";

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
  return `$.${quoted(key)}`;
}

function quoted(key: string): string {
  return `"${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * A contract field's path, where a dotted name addresses a nested member rather than a key that
 * happens to contain a dot.
 *
 * The two forms are kept apart on purpose. A key in the older query is a member's own name and
 * nothing else, which is what a record with a dotted key in it needs; a field in the query contract
 * is identifiers joined by dots, and reading one as a single name would answer a filter about a
 * member that is not there.
 */
function pathForField(field: string): string {
  return field
    .split(".")
    .map((segment, index) => `${index === 0 ? "$" : ""}.${quoted(segment)}`)
    .join("");
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
function predicateFor(key: string, value: unknown, path = pathFor(key)): Predicate {
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

/**
 * Where a stored value sits in an order, as a number: nothing first, then numbers and booleans,
 * then text. SQLite's own order of storage classes, written out so a comparison and an `ORDER BY`
 * can be made to agree, and so this adapter ranks a value the way the in-memory adapter does.
 */
function classOf(path: string): Predicate {
  return {
    sql: `CASE COALESCE(json_type(data, ?), 'null')
            WHEN 'null' THEN 0
            WHEN 'integer' THEN 1
            WHEN 'real' THEN 1
            WHEN 'true' THEN 1
            WHEN 'false' THEN 1
            ELSE 2 END`,
    args: [path],
  };
}

/** The rank a value being compared against has, which is a scalar and so one of three. */
function rankOf(value: AdminResourceFilterValue): number {
  if (value === null) return 0;
  if (typeof value === "number" || typeof value === "boolean") return 1;
  return 2;
}

/**
 * One ordering comparison, as a condition.
 *
 * The class is compared before the value, because that is what `ORDER BY` does: a text value is
 * above a number however the two would compare as text, and a comparison that ranked them
 * differently would put a row on a page the ordering would not have chosen.
 *
 * **A null is the lowest class, and a filter's value can be one.** That is where a three-valued
 * language and a two-valued one part company, so it is worth the whole rule in one place: there
 * is no value to compare and no operand to bind, because nothing compares against nothing, and the
 * class alone decides. The operator still says which way, so `gt(null)` is every record that is
 * not null or absent, `gte(null)` is every record, `lt(null)` is none, and `lte(null)` is the null
 * and the absent. Read as a ranking rather than as a special case, that is simply where a null
 * sits: below every number and every word, so everything is above it and nothing is below it.
 *
 * The next operator added here must read the same way. A range filter whose value is a null is a
 * real question with four different answers, so the operator is applied to the class rather than
 * dropped, and no branch may answer one operator's question with another's.
 */
function comparisonFor(
  field: string,
  value: AdminResourceFilterValue,
  operator: "<" | "<=" | ">" | ">=",
): Predicate {
  const path = pathForField(field);
  const rank = rankOf(value);
  const klass = classOf(path);
  // The class is an integer, so the operator reads on it directly. `gte` on rank 0 is `class >= 0`,
  // which every record answers, and that is the correct answer rather than a shortcut past it.
  if (rank === 0) {
    return { sql: `(${klass.sql}) ${operator} 0`, args: klass.args };
  }
  // A value of a different class is decided by the class alone, and which way it falls depends on
  // which way the operator reads. A `lt` against a number has to find the classes below it, which
  // are the nulls; testing `class > rank` there would answer a `gt` instead and return the text.
  const across = operator === "<" || operator === "<=" ? "<" : ">";
  // A boolean arrives from json_extract as 1 or 0, so both stores compare it as a number.
  const column = rank === 1 ? "json_extract(data, ?)" : "CAST(json_extract(data, ?) AS TEXT)";
  return {
    sql: `(${klass.sql} ${across} ${rank} OR (${klass.sql} = ${rank} AND ${column} ${operator} ?))`,
    args: [...klass.args, ...klass.args, path, value],
  };
}

/**
 * The value as text, with a boolean spelled the way JavaScript spells it.
 *
 * SQLite hands back a stored `true` as the integer 1, so casting it would answer a search for
 * "true" in neither store, and the two stores would still agree by accident rather than by design.
 */
function textAt(path: string): Predicate {
  return {
    sql: `CASE json_type(data, ?)
            WHEN 'true' THEN 'true'
            WHEN 'false' THEN 'false'
            ELSE CAST(json_extract(data, ?) AS TEXT)
          END`,
    args: [path, path],
  };
}

/** One comparison from the query contract, as a condition the database can answer. */
function predicateForFilter(filter: AdminResourceFilter): Predicate {
  const path = pathForField(filter.field);
  switch (filter.operator) {
    case "eq":
      return predicateFor(filter.field, filter.value, path);
    case "ne": {
      const same = predicateFor(filter.field, filter.value, path);
      // Through COALESCE, because SQL has three values and a record with no such field is not a
      // record whose field is null. The comparison comes back unknown, and negating an unknown
      // leaves it unknown, so every record the field is absent from would drop out of a `ne` it
      // matches by definition.
      return { sql: `COALESCE(${same.sql}, 0) = 0`, args: same.args };
    }
    case "gt":
      return comparisonFor(filter.field, filter.value as AdminResourceFilterValue, ">");
    case "gte":
      return comparisonFor(filter.field, filter.value as AdminResourceFilterValue, ">=");
    case "lt":
      return comparisonFor(filter.field, filter.value as AdminResourceFilterValue, "<");
    case "lte":
      return comparisonFor(filter.field, filter.value as AdminResourceFilterValue, "<=");
    case "in": {
      const entries = filter.value as AdminResourceFilterValue[];
      const each = entries.map((entry) => predicateFor(filter.field, entry, path));
      return { sql: `(${each.map((entry) => entry.sql).join(" OR ")})`, args: each.flatMap((entry) => entry.args) };
    }
    case "contains": {
      const text = textAt(path);
      const value = filter.value as AdminResourceFilterValue;
      // A number is spelled by the store rather than by JavaScript, because the two disagree:
      // `String(1e21)` is `1e+21` where this cast writes `1.0e+21`, and a term written in one
      // spelling finds nothing in a haystack written in the other. Reading the bound number back
      // out of a JSON document is what makes the needle the same text the haystack is, without
      // spelling a number twice in two places. A boolean and a null keep their own spelling,
      // which is a word rather than a cast, and which the haystack above spells the same way.
      const spelled = typeof value === "number" ? "CAST(json_extract(?, '$') AS TEXT)" : "?";
      return {
        sql: `instr(lower(${text.sql}), lower(${spelled})) > 0`,
        args: [...text.args, typeof value === "number" ? JSON.stringify(value) : String(value)],
      };
    }
    case "isNull":
      return { sql: "json_type(data, ?) = 'null'", args: [path] };
    case "notNull":
      // Both halves: `IS NOT NULL` alone would accept a stored null, whose type is the string
      // "null" rather than nothing, and reject an absent field, which is what the in-memory adapter
      // reads as neither present nor null.
      return { sql: "json_type(data, ?) IS NOT NULL AND json_type(data, ?) <> 'null'", args: [path, path] };
  }
}

/**
 * The `ORDER BY` a query's ordering asks for, with the record's id behind it.
 *
 * The id is the tiebreak because it is the one column every row has and the one a window's
 * boundary can be stated in terms of: without it, which row of a group tied on the sort field lands
 * on which page is left to the plan, and two pages of one query can repeat a row and drop another.
 * It is always ascending, so it settles ties without contradicting the order that was asked for.
 *
 * With no ordering at all, `rowid`, which is this table's insertion order and the order the
 * in-memory adapter returns. A window over no ordering is otherwise a window over whatever order
 * the query happened to produce, so paging it would skip and repeat rows between one call and the
 * next.
 *
 * The class is the first term of an ordering and the value the second, both reading the same way,
 * because that is the one rule `comparisonFor` ranks with: a value sits against another by what it
 * is before it sits by how large it is. Leaving the class to the engine's own order of storage
 * classes returns the same rows, so writing it out changes no answer. What it buys is that the two
 * cannot drift apart: a class added to `classOf`, or a case changed there, moves the comparison and
 * the ordering together, where before it moved the comparison and left the ordering on whatever
 * order the engine had.
 *
 * It costs nothing to say it out. `data` is one JSON document per row and the sort reads it through
 * `json_extract` bound to a path, which is nothing this table's `PRIMARY KEY (resource, id)` holds,
 * so the plan is a scan and a temp B-tree sort exactly as it is without the class. An index built
 * over the extracted value does not change that plan either, asked with a literal path and with the
 * id tiebreak left off, so there is no index this ordering is waiting for. The class is one more
 * `json_type` over a row the sort is already reading, and a measurement over fifty thousand rows
 * could not separate the two from each other.
 */
function orderBy(sort: AdminResourceSort[] | undefined): Predicate {
  if (sort === undefined || sort.length === 0) {
    return { sql: " ORDER BY rowid", args: [] };
  }
  const terms: string[] = [];
  const args: unknown[] = [];
  for (const ordering of sort) {
    const path = pathForField(ordering.field);
    const klass = classOf(path);
    const way = ordering.direction === "desc" ? "DESC" : "ASC";
    terms.push(`(${klass.sql}) ${way}`, `json_extract(data, ?) ${way}`);
    args.push(...klass.args, path);
  }
  terms.push("id ASC");
  return { sql: ` ORDER BY ${terms.join(", ")}`, args };
}

/**
 * A term to look for, over the document's own values and not over its text.
 *
 * `json_each` walks the top level of the document, so a nested value is out of reach of the search
 * the way it is out of reach of a `SELECT` on a column this adapter does not have, and a type is
 * named because a document casts to text as its own JSON, which a term could match without
 * matching anything a reader would recognise. `lower` folds ASCII, which is all SQLite has.
 */
function searchFor(term: string): Predicate {
  return {
    sql: `EXISTS (
            SELECT 1 FROM json_each(data) AS member
            WHERE member.type IN ('text', 'integer', 'real', 'true', 'false')
              AND instr(lower(
                CASE member.type
                  WHEN 'true' THEN 'true'
                  WHEN 'false' THEN 'false'
                  ELSE CAST(member.value AS TEXT)
                END
              ), lower(?)) > 0
          )`,
    args: [term],
  };
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
  // One index per resource and key `insertIfAbsent` has been asked for, and the promise is kept so
  // eight concurrent callers create it once rather than racing eight `IF NOT EXISTS` statements.
  const indexedKeys = new Map<string, Promise<unknown>>();

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

    // Read through the parser first, because it is the authority on what a query is and a hand-built
    // object typed as one compiles whether or not its operator is real.
    async queryPage<T>(resource: string, query?: AdminResourceQuery): Promise<AdminResourcePage<T>> {
      const asked = parseAdminResourceQuery(query);
      const db = await client();
      const conditions: Predicate[] = [{ sql: "resource = ?", args: [resource] }];
      for (const filter of asked.filter ?? []) conditions.push(predicateForFilter(filter));
      if (asked.search !== undefined) conditions.push(searchFor(asked.search));
      const where = conditions.map((condition) => condition.sql).join(" AND ");
      const args = conditions.flatMap((condition) => condition.args);

      // Its own statement, because a window that has run past the last matching record comes back
      // with no rows at all, and a list holding nothing has to ask the store whether that is an
      // empty resource or an offset beyond the end of one. The rows alone cannot say which.
      const counted = await db.execute({ sql: `SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`, args });
      // One column by definition, so its position is its name.
      const total = Number(counted.rows[0]?.[0] ?? 0);

      const orderings = orderBy(asked.sort);
      const window = asked.window;
      // The arguments follow the statement's own order: the conditions, then the ordering's terms
      // in the order they are written, then the window. Each ordering binds its path twice, once
      // where the class is read and once where the value is. A path left unbound is a bound NULL,
      // which extracts nothing and leaves every row tied, so a missing pair would quietly answer
      // the store's insertion order.
      return {
        rows: toRecords<T>(
          await db.execute({
            sql:
              `SELECT data FROM ${table} WHERE ${where}${orderings.sql}` +
              (window === undefined ? "" : " LIMIT ? OFFSET ?"),
            args: [
              ...args,
              ...orderings.args,
              ...(window === undefined ? [] : [window.limit, window.offset]),
            ],
          }),
        ),
        total,
      };
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

    /**
     * One statement, so the database decides rather than a read and a write that another process can
     * come between.
     *
     * **The unique index is created here, on first use, and it is scoped twice**: to the resource and
     * to a JSON path holding one key. A record of another resource has no value at that path, and
     * SQLite treats a NULL in a unique index as distinct from every other NULL, so the index is
     * invisible to every other resource in this shared table rather than a constraint this adapter
     * has quietly put on a host's other data. A host that has its own mapped schema gets this for
     * free from a real column, which is what `ON CONFLICT (email) DO NOTHING` is in that world.
     *
     * The key is checked as an identifier because it reaches both the index name and the JSON path,
     * and a column name is a host's configuration value like any other.
     *
     * **The index outlives the call that made it.** Once `insertIfAbsent` has been used for a resource
     * and key, the database refuses a duplicate there for every other write to that resource too,
     * including a plain `create`. That is a constraint appearing in a table a host did not write, so
     * it is said here rather than discovered: it is what makes the guarantee real, and it fails loudly
     * and permanently if the table already held duplicates when the index was built.
     */
    async insertIfAbsent<T>(resource: string, key: string, value: unknown): Promise<T | null> {
      if (!IDENTIFIER.test(resource)) {
        throw new Error(
          `"${resource}" cannot be a resource name; use letters, digits and underscores, starting with a letter`,
        );
      }
      if (!IDENTIFIER.test(key)) {
        throw new Error(
          `"${key}" cannot be a key name; use letters, digits and underscores, starting with a letter`,
        );
      }
      const db = await client();
      const cacheKey = `${resource}.${key}`;
      const indexed = indexedKeys.get(cacheKey) ?? Promise.resolve();
      const creating = indexed.then(() =>
        db
          .execute({
            sql:
              `CREATE UNIQUE INDEX IF NOT EXISTS ${table}_uniq_${resource}_${key}` +
              ` ON ${table} (json_extract(data, '$.${key}')) WHERE resource = '${resource}'`,
          })
          .catch((cause: unknown) => {
            // A unique index over data that already holds two of a kind cannot be built, and that is
            // the truth rather than a driver fault: the table has duplicates in it and does not know
            // it. The raw error says "UNIQUE constraint failed" and names no resource or key, so
            // this says which of them and what to do about it.
            throw new Error(
              `A unique index on ${resource}.${key} could not be created, so this store cannot offer an ` +
                `atomic insert. That index is what refuses a duplicate, and building it fails when the ` +
                `table already holds two ${resource} records with the same ${key}. Find them and remove or ` +
                `merge them first, or keep using a store that checks before it writes.`,
              { cause },
            );
          }),
      );
      indexedKeys.set(cacheKey, creating);
      await creating;

      const record = { ...(value as Record<string, unknown>) };
      const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();
      const stored = { ...record, id };
      // `rowsAffected` is the whole answer, and it is the database's: one row means this call won,
      // zero means a record of this resource already held that value at that key.
      const result = await db.execute({
        sql: `INSERT INTO ${table} (resource, id, data) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
        args: [resource, id, JSON.stringify(stored)],
      });
      return result.rowsAffected ? (stored as T) : null;
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
