// SPDX-License-Identifier: MIT
/**
 * A persistence adapter over PostgreSQL, taking a connection the host already has.
 *
 * **This package depends on no PostgreSQL driver.** A host that has one already uses it, and the
 * ones that differ most are the ones worth using: `pg` against a normal server, `@neondatabase/
 * serverless` over HTTP, `postgres.js` with tagged templates. The adapter is handed anything with
 * `query(text, values)`, which is the shape `pg`'s pool and client both have, and a host on
 * `postgres.js` wraps it in a few lines. Making a driver a dependency instead would put it in the
 * install of every host on SQLite, to serve the hosts that are not.
 *
 * Storage is one table of JSON documents keyed by resource and id, the same shape the SQLite
 * adapter uses, so a resource works on the first call without anyone declaring its columns. The
 * difference is what the engine can then do with it: `jsonb` keeps a number a number and the text
 * `"5"` a string, so a filter compares types rather than casting them, and an expression index over
 * one field is a statement a host runs rather than a schema it designs.
 *
 * The cost is stated rather than hidden: a filter reads `data #> path`, which an index only helps
 * if a host adds one for that path. `postgresIndexStatement` writes it.
 */
import { createHash } from "node:crypto";
import {
  parseAdminResourceQuery,
  type AdminPersistenceAdapter,
  type AdminResourceFilter,
  type AdminResourceFilterValue,
  type AdminResourcePage,
  type AdminResourceQuery,
  type AdminResourceSort,
} from "../adapters/index.js";
// The core, not `tenancy.ts`: this adapter is reachable from a browser bundle through the
// baseline subpath, and the ambient scope pulls in `node:async_hooks`, which cannot be bundled
// for the browser. A host resolves its tenant from a header or a session row here, so the
// adapter needs no scope of its own to ask.
import {
  missingTenantReason,
  AdminTenantError,
  type AdminTenantResolver,
} from "./tenant-core.js";

/**
 * The one method this adapter needs from a connection.
 *
 * `pg`'s `Pool` and `PoolClient` both satisfy it, and so does any pool that takes a text and an
 * array of values. The adapter reads `result.rows` as objects keyed by column name, which is what
 * every `pg`-compatible driver returns.
 */
export type PostgresClient = {
  query: (text: string, values?: unknown[]) => Promise<PostgresResult>;
};

export type PostgresResult = {
  /** One object per row, keyed by column name. */
  rows: Record<string, unknown>[];
  /** Null when the driver does not report it, which is why the writes check for absence too. */
  rowCount?: number | null;
};

export type PostgresPersistenceOptions = {
  /**
   * The connection. Passed in rather than opened here, so the host's pool, its transaction, its
   * retry policy and its TLS settings are the ones in force, and importing this module opens nothing.
   */
  pool?: PostgresClient;
  /**
   * A lazy form of the same, for a host that builds its pool at runtime. Called once, on the first
   * statement, and every call after that shares the pool it returned.
   */
  connect?: () => PostgresClient | Promise<PostgresClient>;
  /** Override the table. Must be a bare identifier, because it cannot be a bound value. */
  table?: string;
  /**
   * Which tenant a statement belongs to, or `false` for a store that keeps one tenant's rows.
   *
   * **A resolver rather than a value, because a value read once at startup is one value for every
   * request that follows.** With a resolver the store asks per statement, and refusing when it
   * returns nothing is what keeps a query with no tenant from reading as "all of them".
   */
  tenant?: AdminTenantResolver | false;
};

/** One table name reaches string concatenation, so it is checked rather than escaped. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const DEFAULT_TABLE = "helmdeck_records";

/**
 * Text is compared under the C collation, which orders by code point.
 *
 * The in-memory adapter compares by code point, iterating a string's code points rather than its
 * UTF-16 units, because a character above the basic plane is a surrogate pair starting below every
 * character from U+E000 up and would otherwise sort before a character the database sorts after. A
 * server's default collation is a locale's idea of alphabetical order, which is not code point
 * order, so without this a host on `en_US.UTF-8` would page a list differently from one on `C` while
 * running the same package. **C is the one collation Postgres always has**, so naming it is
 * available everywhere rather than a configuration a host has to remember to set.
 */
const C = 'COLLATE "C"';

/** Binds values into `$1`, `$2`, ... in the order the statement binds them. */
class Params {
  private readonly values: unknown[] = [];

  bind(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  all(): unknown[] {
    return this.values;
  }
}

/**
 * The text of a Postgres `text[]` literal naming a document path, with every element quoted.
 *
 * `data #> '{a,b}'` walks into a nested member, and a path element is quoted rather than trusted
 * because the older query's keys are arbitrary strings rather than the identifiers the query
 * contract allows: a key holding a comma, a brace or a quote would otherwise change which member
 * the path addresses. The text is built here rather than bound as an array, because serialising a
 * JavaScript array to a `text[]` literal is a driver's own business and not one this package should
 * depend on.
 *
 * **This is the contents of a string literal, not a fragment of a statement.** A caller binding it
 * passes this to `Params.bind` and gets a `$n`; a caller writing it into a statement must use
 * `pathExpression`. Handing this straight to `data #>` produces a bare `{...}`, which Postgres reads
 * as the start of an array constructor and refuses with a syntax error at the brace.
 */
function pathLiteral(path: string[]): string {
  const element = (part: string) => `"${part.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `{${path.map(element).join(",")}}`;
}

/**
 * A path written into a statement rather than bound, which only a `CREATE INDEX` needs.
 *
 * An index definition cannot take a parameter at all, so this is where the path has to be literal.
 * That is also why an index built this way is usable by the adapter's own filter: the filter builds
 * the path into its statement too, so the two name the same expression and the planner matches them.
 */
function pathExpression(path: string[]): string {
  return `'${pathLiteral(path).replace(/'/g, "''")}'`;
}

/**
 * A value written into a statement rather than bound, for the same reason a path is.
 *
 * Only reached for the tenant inside an index definition, and the value is escaped rather than
 * trusted: doubling a quote is how a standard-conforming string literal carries one, so a tenant
 * key holding `'` addresses itself rather than ending the literal and appending a condition.
 */
function sqlTextLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * A tenant's contribution to an index name, which has to be an identifier and cannot be the key.
 *
 * **The index a tenant needs is a different index.** The uniqueness this creates is scoped by the
 * index's own `WHERE` clause, so an index narrowed to one tenant refuses nothing for any other, and
 * two tenants holding the same address would each be free to hold a duplicate of their own. Naming
 * it after the tenant is therefore what makes the second tenant's index exist at all: with one
 * shared name, `CREATE INDEX IF NOT EXISTS` for the second tenant is a no-op and its duplicates go
 * unrefused for the life of the table.
 *
 * A hash, because a tenant key is a hostname or a uuid or a slug and reaches an identifier where a
 * quote or a dash would end it. `crypto` rather than a hand-rolled hash, and truncated because a
 * name has a length limit and a collision here costs a rebuilt index rather than a wrong answer.
 */
function tenantIndexSuffix(tenant: string): string {
  return createHash("sha256").update(tenant).digest("hex").slice(0, 12);
}

/** A field's path. A dotted name addresses nested members, as the query contract says it does. */
function fieldPath(field: string): string[] {
  return field.split(".");
}

type Fragment = { sql: string };

/**
 * Where a stored value sits in an order: nothing first, then numbers and booleans, then everything
 * else. The in-memory adapter's `rankOf`, written out so a comparison and an `ORDER BY` can be made
 * to agree and a record cannot move between pages when a host changes store.
 */
function rankOf(field: string, params: Params): Fragment {
  // **Bound once, and the SQL below may be interpolated more than once.** A bound parameter may be
  // referenced any number of times while being bound once, which is what makes `comparisonFor` able
  // to write `klass.sql` twice without threading arguments through: Postgres resolves `$n` per use
  // and the value is supplied per bind. What it refuses is a placeholder the statement never
  // mentions, which is the opposite mistake.
  const path = params.bind(pathLiteral(fieldPath(field)));
  return {
    sql: `CASE COALESCE(jsonb_typeof(data #> ${path}), 'null')
            WHEN 'null' THEN 0 WHEN 'number' THEN 1 WHEN 'boolean' THEN 1 ELSE 2 END`,
  };
}

/**
 * The value as a number, and `0` for anything that is not one.
 *
 * It exists as its own expression because a `CASE` with a numeric branch and a text branch has one
 * type, and Postgres resolves that to text, which sorts `10` before `9`. The rank is the first term
 * of any ordering and of any comparison, so the rows this one orders are already known to be
 * numbers and booleans, and a text row's `0` is never compared against another text row's. A
 * boolean is spelled `true` or `false` in the document rather than stored as a digit, so it is
 * translated here the way the in-memory adapter translates it.
 */
function numberValue(field: string, params: Params): Fragment {
  const path = params.bind(pathLiteral(fieldPath(field)));
  return {
    sql: `CASE jsonb_typeof(data #> ${path})
            WHEN 'number' THEN (data #> ${path})::text::numeric
            WHEN 'boolean' THEN CASE WHEN (data #> ${path}) = 'true'::jsonb THEN 1 ELSE 0 END
            ELSE 0 END`,
  };
}

/**
 * The value as text, and `''` for anything that is not one, under the C collation.
 *
 * The mirror of `numberValue`, and split for the same reason. `#>> '{}'` extracts a scalar as text
 * rather than as a quoted JSON document, which is what keeps the stored string `"5"` apart from the
 * stored number `5`.
 */
function textValue(field: string, params: Params): Fragment {
  const path = params.bind(pathLiteral(fieldPath(field)));
  return {
    sql: `(CASE WHEN jsonb_typeof(data #> ${path}) = 'string' THEN (data #> ${path}) #>> '{}' ELSE '' END) ${C}`,
  };
}

/** The rank of a value being compared against, which is a scalar and so one of three. */
function rankOfLiteral(value: AdminResourceFilterValue): number {
  if (value === null) return 0;
  if (typeof value === "number" || typeof value === "boolean") return 1;
  return 2;
}

/**
 * One exact match, by jsonb equality, which keeps the types apart on its own.
 *
 * `to_jsonb` on the bound value is what makes `1`, `true` and `"1"` three different answers to one
 * question. The SQLite adapter needed `json_type` beside its comparison for the same reason and
 * still got three cases wrong; here the stored side is a `jsonb` and the bound side is a `jsonb`,
 * and `5` does not equal `"5"` or `true` because there is nothing to cast either side to. A stored
 * null is the one case equality cannot answer, because `data #> path` on a stored null yields the
 * jsonb `null` and on an absent path yields SQL NULL, so the type is named.
 */
function exactMatch(field: string, value: unknown, params: Params): Fragment {
  const path = params.bind(pathLiteral(fieldPath(field)));
  if (value === null) {
    return { sql: `jsonb_typeof(data #> ${path}) = 'null'` };
  }
  if (typeof value === "boolean") {
    return { sql: `(data #> ${path}) = to_jsonb(${params.bind(value)}::boolean)` };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`A filter on "${field}" is ${String(value)}, which is not a number Postgres stores.`);
    }
    return { sql: `(data #> ${path}) = to_jsonb(${params.bind(value)}::numeric)` };
  }
  if (typeof value === "string") {
    return { sql: `(data #> ${path}) = to_jsonb(${params.bind(value)}::text)` };
  }
  const shape = Array.isArray(value) ? "array" : typeof value;
  throw new Error(
    `A filter on "${field}" must be a string, number, boolean or null, because a filter compares one ` +
      `stored value at a time. An ${shape} is stored as a JSON document, and only a scalar can be ` +
      "compared against one.",
  );
}

/**
 * One ordering comparison, as a condition.
 *
 * The class is compared before the value, because that is what `ORDER BY` does: a text value is
 * above a number however the two would compare as text. **A null is the lowest class, and a
 * filter's value can be one**, so the operator is applied to the class rather than dropped: `gt(null)`
 * is every record that is not null or absent, `gte(null)` is every record, `lt(null)` is none, and
 * `lte(null)` is the null and the absent.
 */
function comparisonFor(
  field: string,
  value: AdminResourceFilterValue,
  operator: "<" | "<=" | ">" | ">=",
  params: Params,
): Fragment {
  const rank = rankOfLiteral(value);
  const klass = rankOf(field, params);
  if (rank === 0) {
    return { sql: `(${klass.sql}) ${operator} 0` };
  }
  // A value of a different class is decided by the class alone, and which way it falls depends on
  // which way the operator reads: a `lt` against a number has to find the classes below it, which
  // are the nulls.
  const across = operator === "<" || operator === "<=" ? "<" : ">";
  const measured = rank === 1 ? numberValue(field, params) : textValue(field, params);
  // **A boolean bound as its own number, not cast.** `numberValue` already reads a stored boolean
    // as 1 or 0, so both sides of this comparison are numbers, and casting the bound value straight
    // to `numeric` is what broke it: `invalid input syntax for type numeric: "true"`. Every
    // inequality on a boolean threw while `eq` on the same field worked, because equality compares
    // jsonb and never reaches this line.
    const spelled = rank === 1 && typeof value === "boolean" ? (value ? 1 : 0) : value;
    const bound = rank === 1 ? `(${params.bind(spelled)}::numeric)` : `((${params.bind(value)}::text) ${C})`;
  return {
    sql: `(${klass.sql} ${across} ${rank} OR (${klass.sql} = ${rank} AND ${measured.sql} ${operator} ${bound}))`,
  };
}

/**
 * One stored scalar as the text a search or a `contains` reads, with a boolean spelled the way
 * JavaScript spells it.
 */
function scalarText(value: string): string {
  return `CASE jsonb_typeof(${value})
            WHEN 'boolean' THEN CASE WHEN ${value} = 'true'::jsonb THEN 'true' ELSE 'false' END
            ELSE ${value} #>> '{}' END`;
}

/** One comparison from the query contract, as a condition Postgres can answer. */
function predicateForFilter(filter: AdminResourceFilter, params: Params): Fragment {
  switch (filter.operator) {
    case "eq":
      return exactMatch(filter.field, filter.value, params);
    case "ne": {
      const same = exactMatch(filter.field, filter.value, params);
      // Through COALESCE, because SQL has three values and a record with no such field is not a
      // record whose field is null. The comparison comes back unknown, and negating an unknown
      // leaves it unknown, so every record the field is absent from would drop out of a `ne` it
      // matches by definition.
      return { sql: `COALESCE(${same.sql}, false) = false` };
    }
    case "gt":
      return comparisonFor(filter.field, filter.value as AdminResourceFilterValue, ">", params);
    case "gte":
      return comparisonFor(filter.field, filter.value as AdminResourceFilterValue, ">=", params);
    case "lt":
      return comparisonFor(filter.field, filter.value as AdminResourceFilterValue, "<", params);
    case "lte":
      return comparisonFor(filter.field, filter.value as AdminResourceFilterValue, "<=", params);
    case "in": {
      const entries = filter.value as AdminResourceFilterValue[];
      const each = entries.map((entry) => exactMatch(filter.field, entry, params));
      return { sql: `(${each.map((entry) => entry.sql).join(" OR ")})` };
    }
    case "contains": {
      const value = filter.value as AdminResourceFilterValue;
      const path = params.bind(pathLiteral(fieldPath(filter.field)));
      const spelled = value === null ? "null" : typeof value === "number" ? `${value}` : String(value);
      return {
        sql: `strpos(lower(${scalarText(`data #> ${path}`)} ${C}), lower(${params.bind(spelled)} ${C})) > 0`,
      };
    }
    case "isNull": {
      const path = params.bind(pathLiteral(fieldPath(filter.field)));
      return { sql: `jsonb_typeof(data #> ${path}) = 'null'` };
    }
    case "notNull": {
      const path = params.bind(pathLiteral(fieldPath(filter.field)));
      return {
        sql: `jsonb_typeof(data #> ${path}) IS NOT NULL AND jsonb_typeof(data #> ${path}) <> 'null'`,
      };
    }
  }
}

/**
 * The `ORDER BY` a query's ordering asks for, with the record's id behind it.
 *
 * The id is the tiebreak because it is the one column every row has and the one a window's boundary
 * can be stated in terms of: without it, which row of a group tied on the sort field lands on which
 * page is left to the plan, and two pages of one query can repeat a row and drop another.
 *
 * With no ordering at all, the id, which is a total order and the one the in-memory adapter's
 * insertion order agrees with for records created in the same order. A window over no ordering is
 * otherwise a window over whatever order the query happened to produce.
 */
function orderBy(sort: AdminResourceSort[] | undefined, params: Params): string {
  if (sort === undefined || sort.length === 0) {
    return " ORDER BY id ASC";
  }
  const terms: string[] = [];
  for (const ordering of sort) {
    const way = ordering.direction === "desc" ? "DESC" : "ASC";
    const klass = rankOf(ordering.field, params);
    const measured = numberValue(ordering.field, params);
    const written = textValue(ordering.field, params);
    // Rank, then the value in whichever of its two forms this rank holds, then the id. Rank is the
    // first term, so the `0` a text row holds in the numeric term and the `''` a number holds in
    // the text term are only ever compared against their own kind.
    terms.push(`(${klass.sql}) ${way}`, `(${measured.sql}) ${way}`, `(${written.sql}) ${way}`);
  }
  terms.push("id ASC");
  return ` ORDER BY ${terms.join(", ")}`;
}

/**
 * A term to look for, over the document's own top-level values.
 *
 * `jsonb_each` walks the top level, so a nested value is out of reach the way it is out of reach of
 * a `SELECT` on a column this table does not have. `strpos` rather than `LIKE`, because `LIKE` reads
 * `%` and `_` in the term as wildcards and a search box is full of both: a term of `%` would match
 * every record rather than the ones holding a percent sign.
 */
function searchFor(term: string, params: Params): Fragment {
  return {
    sql: `EXISTS (
            SELECT 1 FROM jsonb_each(data) AS member
            WHERE jsonb_typeof(member.value) IN ('string', 'number', 'boolean')
              AND strpos(lower(${scalarText("member.value")} ${C}), lower(${params.bind(term)} ${C})) > 0
          )`,
  };
}

export type PostgresSchemaOptions = {
  table?: string;
  /** Match the adapter's own option. A schema built without it cannot hold another tenant's rows. */
  tenancy?: boolean;
};

function tableName(table?: string): string {
  const name = table ?? DEFAULT_TABLE;
  if (!IDENTIFIER.test(name)) {
    throw new Error(
      `"${name}" cannot be a table name; use letters, digits and underscores, starting with a letter`,
    );
  }
  return name;
}

/**
 * The statements that create the table this adapter stores in, as one string a host can run.
 *
 * Separate from the adapter because a schema is something a host reviews, versions and applies in
 * its own migrations, and an adapter that created its own on first call would be a schema no host
 * can see. The adapter checks for the table when it connects and names the statement that is
 * missing rather than failing on the first write.
 *
 * The primary key carries `tenant` first when tenancy is on, so two tenants may hold the same id and
 * the key still says which row is which. Reads and writes are then scoped by tenant as well, and
 * `id ASC` as the default ordering is a total order precisely because the key is a triple.
 */
export function postgresSchema(options: PostgresSchemaOptions = {}): string {
  const table = tableName(options.table);
  if (!options.tenancy) {
    return `CREATE TABLE IF NOT EXISTS ${table} (
  resource text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (resource, id)
);
CREATE INDEX IF NOT EXISTS ${table}_data ON ${table} USING gin (data jsonb_path_ops);`;
  }
  return `CREATE TABLE IF NOT EXISTS ${table} (
  tenant text NOT NULL,
  resource text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (tenant, resource, id)
);
CREATE INDEX IF NOT EXISTS ${table}_tenant_resource ON ${table} (tenant, resource);
CREATE INDEX IF NOT EXISTS ${table}_data ON ${table} USING gin (data jsonb_path_ops);`;
}

/**
 * The statements that turn a single-tenant table into one holding a tenant per row.
 *
 * **This rewrites the primary key and takes a lock that blocks writes for the length of it.** It is
 * a statement a host runs in its own migration, with its own decision about when, for the same
 * reason the schema is: a table's keys are not a thing a library changes on first use.
 *
 * `tenant` is written to every existing row as the one value named here. There is no correct value
 * the function could pick instead: a row that belongs to no tenant is a row whichever tenant is
 * asked for first can read, and a host with one tenant today can name it.
 */
export function postgresTenancyMigration(options: { tenant: string; table?: string }): string[] {
  const table = tableName(options.table);
  if (typeof options.tenant !== "string" || options.tenant.length === 0) {
    throw new Error(
      "Naming the tenant for the rows already in the table is not optional. A row with no tenant " +
        "would be readable by whichever tenant is asked for first, which is every tenant.",
    );
  }
  return [
    `ALTER TABLE ${table} ADD COLUMN tenant text`,
    `UPDATE ${table} SET tenant = '${options.tenant.replace(/'/g, "''")}'`,
    `ALTER TABLE ${table} ALTER COLUMN tenant SET NOT NULL`,
    `ALTER TABLE ${table} DROP CONSTRAINT ${table}_pkey`,
    `ALTER TABLE ${table} ADD PRIMARY KEY (tenant, resource, id)`,
    `CREATE INDEX IF NOT EXISTS ${table}_tenant_resource ON ${table} (tenant, resource)`,
  ];
}

/**
 * An expression index for one field, which is what turns a filter on it from a scan into a lookup.
 *
 * Written out because the index a filter wants depends on the fields a host filters on, which is the
 * host's own question. The statement can be used by a query asking for exactly this path, and not by
 * one whose path is a bound parameter, which is why the adapter builds the path into the statement
 * rather than binding it.
 */
export function postgresIndexStatement(
  field: string,
  options: { table?: string; unique?: boolean } = {},
): string {
  const table = tableName(options.table);
  if (!IDENTIFIER.test(field)) {
    throw new Error(
      `"${field}" cannot be an indexed field; use letters, digits and underscores, starting with a letter`,
    );
  }
  return `CREATE ${options.unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${table}_field_${field} ON ${table} ((data #> ${pathExpression(fieldPath(field))}));`;
}

/** Builds the adapter, resolving the connection on the first statement and sharing it after that. */
export function createPostgresPersistenceAdapter(
  options: PostgresPersistenceOptions,
): AdminPersistenceAdapter {
  const table = tableName(options.table);
  const tenancy = options.tenant !== false;
  const resolveTenant = options.tenant === false || options.tenant === undefined ? undefined : options.tenant;

  let checked: Promise<PostgresClient> | null = null;
  // One index per resource, key and tenant `insertIfAbsent` has been asked for, and the promise is
  // kept so eight concurrent callers create it once rather than racing eight statements.
  const indexedKeys = new Map<string, Promise<unknown>>();

  /** The connection, and the schema check behind it, once per adapter. */
  function connection(): Promise<PostgresClient> {
    checked ??= (async () => {
      if (!options.pool && !options.connect) {
        throw new Error(
          "createPostgresPersistenceAdapter needs a pool or a connect function. This package depends " +
            "on no PostgreSQL driver, so the connection is the host's: pass a pg Pool, or a connect " +
            "function returning one.",
        );
      }
      const db = options.pool ?? (await options.connect!());
      const found = await db.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [table]);
      if (found.rows[0]?.present !== true) {
        throw new Error(
          `The table ${table} is not in this database. Run what postgresSchema({ table: "${table}"` +
            (tenancy ? ", tenancy: true" : "") +
            ` }) returns, in your own migrations. This adapter does not create its own table, because ` +
            "a schema a host cannot see is a schema a host cannot review.",
        );
      }
      return db;
    })().catch((cause: unknown) => {
      checked = null;
      throw cause;
    });
    return checked;
  }

  /**
   * The tenant for one statement.
   *
   * A resolver that returns nothing is the same failure as no context at all, and says so in the
   * same words: `requireAdminTenant` refuses rather than defaulting, because every default is a
   * tenant's rows reaching someone else.
   */
  async function tenantValue(what: string): Promise<string> {
    if (!tenancy) return "";
    const found = resolveTenant ? await resolveTenant() : undefined;
    // No ambient scope is consulted here, and none is available in a bundle this file can reach. A
    // host whose tenant comes from the request wraps the request itself, so the resolver finds it;
    // a host that configures this option to read the ambient scope imports `tenancy.ts` on the
    // server and passes `currentAdminTenant` as the resolver. Either way the refusal is this one.
    if (found === undefined) throw new AdminTenantError(missingTenantReason(what));
    return found;
  }

  /**
   * The conditions a statement carries, bound in the order they are written.
   *
   * `rest` is a callback rather than a list because the order is the whole correctness of this: a
   * placeholder is a position, so the tenant, the resource, the filters, the ordering and the window
   * must be bound in the sequence the statement reads them. A caller that built its filters before
   * calling this would bind them first and every one of them would read the tenant's or the
   * resource's value, which no type checker sees and no test of one statement would catch. Passing
   * a list in makes that mistake easy and this is the one place that cannot be wrong.
   */
  async function conditions(
    what: string,
    resource: string,
    params: Params,
    rest: () => Fragment[],
  ): Promise<string> {
    const parts: string[] = [];
    if (tenancy) parts.push(`tenant = ${params.bind(await tenantValue(what))}`);
    parts.push(`resource = ${params.bind(resource)}`);
    for (const fragment of rest()) parts.push(fragment.sql);
    return parts.join(" AND ");
  }

  async function runQuery<T>(text: string, values: unknown[]): Promise<T[]> {
    const db = await connection();
    const result = await db.query(text, values);
    return result.rows.map((row) => {
      const data = row.data;
      // A driver that hands back jsonb as a string is still a driver that answered correctly; the
      // adapter reads whichever arrived rather than making a host configure its pool for it.
      return (typeof data === "string" ? (JSON.parse(data) as T) : data) as T;
    });
  }

  /** The row a write touched, or the fact that it touched none. */
  async function write(text: string, values: unknown[]): Promise<number> {
    const db = await connection();
    const result = await db.query(text, values);
    return result.rowCount ?? 0;
  }

  function withId(value: unknown): { record: Record<string, unknown>; id: string; stored: Record<string, unknown> } {
    const record = { ...(value as Record<string, unknown>) };
    // A database honours an id it is given. The in-memory adapter always generates one, which would
    // renumber records a seeded parent row already points at; a stored foreign key has no second
    // chance to be rewritten, so this must keep the id it was handed.
    const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();
    return { record, id, stored: { ...record, id } };
  }

  return {
    async read<T>(resource: string, id: string): Promise<T | null> {
      const params = new Params();
      const where = await conditions(`Reading ${resource} ${id}`, resource, params, () => [
        { sql: `id = ${params.bind(id)}` },
      ]);
      const rows = await runQuery<T>(`SELECT data FROM ${table} WHERE ${where}`, params.all());
      return rows[0] ?? null;
    },

    async query<T>(resource: string, criteria?: Record<string, unknown>): Promise<T[]> {
      const params = new Params();
      // An undefined filter is an unset field, not a field set to nothing, and comparing against SQL
      // NULL matches no row, so keeping one would return an empty result where the in-memory adapter
      // returns everything.
      const entries = Object.entries(criteria ?? {}).filter(([, value]) => value !== undefined);
      const where = await conditions(`Querying ${resource}`, resource, params, () =>
        entries.map(([key, value]) => exactMatch(key, value, params)),
      );
      return runQuery<T>(`SELECT data FROM ${table} WHERE ${where}`, params.all());
    },

    // Read through the parser first, because it is the authority on what a query is and a hand-built
    // object typed as one compiles whether or not its operator is real.
    async queryPage<T>(resource: string, criteria?: AdminResourceQuery): Promise<AdminResourcePage<T>> {
      const params = new Params();
      const asked = parseAdminResourceQuery(criteria);
      // The `WHERE` is built once and used by both statements below. That is not tidiness: a
      // placeholder is a position, so the count and the page must bind the same conditions in the
      // same order, and rebuilding the text is how a count starts disagreeing with the page it was
      // counting.
      const where = await conditions(`Querying ${resource}`, resource, params, () => {
        const filters = (asked.filter ?? []).map((filter) => predicateForFilter(filter, params));
        if (asked.search !== undefined) filters.push(searchFor(asked.search, params));
        return filters;
      });

      // Its own statement, because a window that has run past the last matching record comes back
      // with no rows at all, and a list holding nothing has to ask the store whether that is an
      // empty resource or an offset beyond the end of one.
      const db = await connection();
      const counted = await db.query(
        `SELECT count(*)::bigint AS total FROM ${table} WHERE ${where}`,
        params.all(),
      );
      const total = Number(counted.rows[0]?.total ?? 0);

      const ordering = orderBy(asked.sort, params);
      const window = asked.window;
      return {
        rows: await runQuery<T>(
          `SELECT data FROM ${table} WHERE ${where}${ordering}` +
            (window === undefined
              ? ""
              : ` LIMIT ${params.bind(window.limit)} OFFSET ${params.bind(window.offset)}`),
          params.all(),
        ),
        total,
      };
    },

    async create<T>(resource: string, value: unknown): Promise<T> {
      const params = new Params();
      const { id, stored } = withId(value);
      // Nothing to select, so the tenant and the row are bound directly rather than through
      // `conditions`: an `INSERT` has no `WHERE` and the placeholders still have to be in the order
      // the columns are written.
      //
      // **The tenant is bound only when there is one.** An unbound `$1` that the statement never
      // mentions is a hole in the numbering: Postgres numbers the placeholders it is given and
      // refuses to type one it cannot find a use for, so a store with no tenant column still needs
      // the placeholder to not exist rather than to exist unused.
      const leading = tenancy ? [params.bind(await tenantValue(`Creating a ${resource}`))] : [];
      const columns = tenancy ? "tenant, resource, id, data" : "resource, id, data";
      const values = [
        ...leading,
        params.bind(resource),
        params.bind(id),
        params.bind(JSON.stringify(stored)),
      ];
      await write(`INSERT INTO ${table} (${columns}) VALUES (${values.join(", ")})`, params.all());
      return stored as T;
    },

    /**
     * One statement, so the database decides rather than a read and a write another process can come
     * between.
     *
     * **The unique index is created here, on first use, and it is scoped twice**: to the resource
     * and to a path holding one key. A record of another resource has no value at that path, and
     * Postgres treats a NULL in a unique index as distinct from every other NULL, so the index is
     * invisible to every other resource in this shared table rather than a constraint this adapter
     * has quietly put on a host's other data.
     *
     * **The index outlives the call that made it.** Once `insertIfAbsent` has been used for a
     * resource and key, the database refuses a duplicate there for every other write to that resource
     * too, including a plain `create`. That is a constraint appearing in a table a host did not
     * write, so it is said here rather than discovered: it is what makes the guarantee real, and it
     * fails loudly and permanently if the table already held duplicates when the index was built.
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
      const tenant = await tenantValue(`Creating a ${resource}`);
      const cacheKey = `${tenancy ? tenant : ""}.${resource}.${key}`;
      // The name carries the tenant, because the uniqueness lives in the index's own `WHERE` and an
      // index is not shared between tenants by accident of naming.
      const name = tenancy
        ? `${table}_uniq_${tenantIndexSuffix(tenant)}_${resource}_${key}`
        : `${table}_uniq_${resource}_${key}`;
      const indexed = indexedKeys.get(cacheKey) ?? Promise.resolve();
      const creating = indexed.then(async () => {
        const db = await connection();
        // Narrowed to the tenant as well when the store is scoped, or two tenants holding the same
        // address would refuse each other's rows rather than only their own duplicates.
        const narrowing = [
          ...(tenancy ? [`tenant = ${sqlTextLiteral(tenant)}`] : []),
          `resource = ${sqlTextLiteral(resource)}`,
        ].join(" AND ");
        return db.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS ${name}` +
            ` ON ${table} ((data #> ${pathExpression([key])})) WHERE ${narrowing}`,
        );
      });
      indexedKeys.set(cacheKey, creating);
      try {
        await creating;
      } catch (cause: unknown) {
        throw new Error(
          `A unique index on ${resource}.${key} could not be created, so this store cannot offer an ` +
            `atomic insert. That index is what refuses a duplicate, and building it fails when the ` +
            `table already holds two ${resource} records with the same ${key}. Find them and remove or ` +
            "merge them first, or keep using a store that checks before it writes.",
          { cause },
        );
      }

      const params = new Params();
      const { id, stored } = withId(value);
      const columns = tenancy ? "tenant, resource, id, data" : "resource, id, data";
      // The tenant only when there is one, for the numbering reason `create` gives.
      const values = [
        ...(tenancy ? [params.bind(tenant)] : []),
        params.bind(resource),
        params.bind(id),
        params.bind(JSON.stringify(stored)),
      ];
      const touched = await write(
        `INSERT INTO ${table} (${columns}) VALUES (${values.join(", ")}) ON CONFLICT DO NOTHING`,
        params.all(),
      );
      // `rowCount` is the whole answer, and it is the database's: one row means this call won, zero
      // means a record of this resource already held that value at that key.
      return touched > 0 ? (stored as T) : null;
    },

    async update<T>(resource: string, id: string, value: unknown): Promise<T> {
      const params = new Params();
      // The id in the document is the id the route named, whatever the value carried, so an update
      // cannot move a row by naming a different one.
      const stored = { ...(value as Record<string, unknown>), id };
      // Bound first because `SET` is written before `WHERE`, and a placeholder is a position.
      const data = params.bind(JSON.stringify(stored));
      const where = await conditions(`Updating ${resource} ${id}`, resource, params, () => [
        { sql: `id = ${params.bind(id)}` },
      ]);
      const touched = await write(`UPDATE ${table} SET data = ${data} WHERE ${where}`, params.all());
      // A write that matched nothing is a record that is not there, and reporting success would let
      // a caller believe an edit landed on a row that never existed.
      if (touched === 0) {
        throw new Error(`No ${resource} record with id ${id}`);
      }
      return stored as T;
    },

    async delete(resource: string, id: string): Promise<void> {
      const params = new Params();
      const where = await conditions(`Deleting ${resource} ${id}`, resource, params, () => [
        { sql: `id = ${params.bind(id)}` },
      ]);
      await write(`DELETE FROM ${table} WHERE ${where}`, params.all());
    },
  };
}