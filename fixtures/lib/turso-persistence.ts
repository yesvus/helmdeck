// SPDX-License-Identifier: MIT

/**
 * The demo's persistence, backed by a real database.
 *
 * Every statement is prepared. A resource name reaches string concatenation here, because the
 * adapter is generic over resources and cannot know the table names at build time, so the one thing
 * that must never happen is a value reaching SQL the same way. A resource name is checked against a
 * fixed set instead, which removes the possibility rather than escaping it.
 *
 * Resources are tables. That is a demo's simplification and it is stated rather than hidden: a real
 * host maps resources to whatever its schema is, and the contract it implements is the same one.
 *
 * The connection comes from the environment. Absent configuration does not silently fall back to a
 * local file, because a demo that quietly wrote somewhere else would look identical from outside.
 */

export type TursoConfig = {
  url: string;
  authToken: string;
};

export type SqlResult = {
  /** Values, positionally, with the names in `columns`. */
  rows: unknown[][];
  columns?: string[];
};

export type SqlClient = {
  execute: (statement: { sql: string; args?: unknown[] }) => Promise<SqlResult>;
  batch?: (statements: { sql: string; args?: unknown[] }[]) => Promise<unknown>;
};

/** The tables this adapter will talk to, so a resource name can never reach SQL unchecked. */
const tables = new Set([
  "users",
  "posts",
  "products",
  "orders",
  "dashboard_placements",
  "landing_sections",
  "sessions",
]);

function tableFor(resource: string): string {
  if (!tables.has(resource)) {
    throw new Error(`"${resource}" is not a table this demo stores`);
  }
  return resource;
}

/**
 * Names a row's values by the response's `columns`, not by their position.
 *
 * A result set is positional, and treating it as an object by index produces `{"0": ...}` rows that
 * look like data and are not. A caller asking for `title` must get `title`, so the names come from
 * the response, and a response without them is a driver this adapter cannot read.
 */
function toRows<T>(result: SqlResult): T[] {
  const columns = result.columns;
  if (!columns) {
    throw new Error("A libsql result needs column names; received rows without them");
  }
  return result.rows.map((values) => {
    const record: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      const value = values[index];
      record[column] = typeof value === "string" ? safeJson(value) : value;
    });
    return record as T;
  });
}

function safeJson(value: string): unknown {
  // A text column holding a bare word is data, not broken JSON, so this falls back rather than throws.
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function createTursoPersistenceAdapter(client: SqlClient) {
  return {
    async read<T>(resource: string, id: string): Promise<T | null> {
      const table = tableFor(resource);
      const result = await client.execute({
        sql: `SELECT * FROM ${table} WHERE id = ?`,
        args: [id],
      });
      return toRows<T>(result)[0] ?? null;
    },

    async query<T>(resource: string, query?: Record<string, unknown>): Promise<T[]> {
      const table = tableFor(resource);
      const entries = Object.entries(query ?? {}).filter(([, value]) => value !== undefined);
      if (entries.length === 0) {
        const all = await client.execute({ sql: `SELECT * FROM ${table}` });
        return toRows<T>(all);
      }
      // Parameterised, so a filter value is a value. The column names come from the caller, which is
      // why they are checked against the schema rather than trusted.
      await checkedColumns(client, table, entries.map(([column]) => column));
      const where = entries.map(([column]) => `${column} = ?`).join(" AND ");
      const result = await client.execute({
        sql: `SELECT * FROM ${table} WHERE ${where}`,
        args: entries.map(([, value]) => value),
      });
      return toRows<T>(result);
    },

    async create<T>(resource: string, value: unknown): Promise<T> {
      const table = tableFor(resource);
      const record = (value ?? {}) as Record<string, unknown>;
        const id = (record.id as string) ?? crypto.randomUUID();
        const body: Record<string, unknown> = { ...record, id };
      const columns = await checkedColumns(client, table, Object.keys(body));
      const sql =
        `INSERT INTO ${table} (${columns.join(", ")}) ` +
        `VALUES (${columns.map(() => "?").join(", ")})`;

      if (typeof client.batch === "function") {
        // The insert and the read in one round trip, so a created record cannot come back missing.
        const [, read] = (await client.batch([
          { sql, args: columns.map((column) => body[column] ?? null) },
          { sql: `SELECT * FROM ${table} WHERE id = ?`, args: [id] },
        ])) as [SqlResult, SqlResult];
        return (toRows<T>(read)[0] ?? body) as T;
      }

      await client.execute({ sql, args: columns.map((column) => body[column] ?? null) });
      return (await this.read<T>(resource, id)) ?? (body as T);
    },

    async update<T>(resource: string, id: string, value: unknown): Promise<T> {
      const table = tableFor(resource);
      const record = (value ?? {}) as Record<string, unknown>;
        const body: Record<string, unknown> = { ...record, id };
      const columns = (await checkedColumns(client, table, Object.keys(body))).filter(
        (column) => column !== "id",
      );
      if (columns.length === 0) {
        return (await this.read<T>(resource, id)) as T;
      }
      await client.execute({
        sql: `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`,
        args: [...columns.map((column) => body[column] ?? null), id],
      });
      return (await this.read<T>(resource, id)) as T;
    },

    async delete(resource: string, id: string): Promise<void> {
      const table = tableFor(resource);
      await client.execute({ sql: `DELETE FROM ${table} WHERE id = ?`, args: [id] });
    },
  };
}

let columnCache: Map<string, Set<string>> | null = null;

async function columnsOf(client: SqlClient, table: string): Promise<string[]> {
  columnCache ??= new Map();
  const cached = columnCache.get(table);
  if (cached) return [...cached];

  const result = await client.execute({ sql: `SELECT name FROM pragma_table_info(?)`, args: [table] });
  const columns = new Set(toRows<{ name: string }>(result).map((row) => row.name));
  columnCache.set(table, columns);
  return [...columns];
}

/**
 * Every caller-supplied column name, checked against the schema, before any of it reaches SQL text.
 *
 * A record's values are bound as parameters, so a value is never a way into the statement. Its keys
 * are a different kind of input: they are pasted into the `SET` and `INSERT` lists, so a key like
 * `name = (SELECT group_concat(email, password_hash) FROM users), id` is read as an assignment and
 * writes somebody else's columns into a cell the caller can then read back. Checking the whole set
 * once, here, means a write path cannot forget it: the table name, the column names and the values
 * are then all something the caller supplies as data rather than as syntax.
 */
async function checkedColumns(
  client: SqlClient,
  table: string,
  keys: readonly string[],
): Promise<string[]> {
  const known = new Set(await columnsOf(client, table));
  for (const key of keys) {
    if (!known.has(key)) {
      throw new Error(`"${key}" is not a column of ${table}`);
    }
  }
  return [...keys];
}

/** Exposed so the demo can reset cached schema between migrations, which change it. */
export function resetTursoAdapterCache() {
  columnCache = null;
}
