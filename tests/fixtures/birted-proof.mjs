// Whether the shipped PostgreSQL adapter's own statements read birtedcom's real products table.
//
// **Why this exists.** The adapter's 51 tests run against a table it creates itself, which proves it
// works against the shape it makes. birtedcom has a mapped schema: a real column per field, prices as
// integer Turkish lira, and a trigram index on `search_normalized`. An adapter that only handled its
// own JSON documents would pass every one of those tests and fail on the first host that already had a
// schema.
//
// **What it does.** The adapter builds one table of JSON documents and cannot read a mapped schema
// unaided, so a mapped-schema host writes a substitution once: the JSON path becomes the real column.
// This applies that substitution to the statements the adapter emits and runs the result against
// birtedcom's actual `products` table, so the queries under test are the adapter's own rather than a
// reimplementation of them. It answers one question: **does the adapter's SQL, aimed at a real column,
// return the rows birtedcom's admin returns for the same question?**
//
// Nothing in birtedcom is read or written. scripts/prove-birted-adapter applies its migrations to a
// throwaway database and owns the setup and teardown.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pg = require("pg");
const { createPostgresPersistenceAdapter, postgresSchema } = await import(
  new URL("../../dist/baseline.js", import.meta.url).href
);

const DATABASE_URL = process.env.PROOF_DATABASE_URL;
if (!DATABASE_URL) {
  console.log("  PROOF_DATABASE_URL is unset, so this did not run.");
  process.exit(0);
}
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

/** birtedcom's products, in the columns its schema declares. */
const SEED = [
  { title: "Sefiller ve Anlatı", slug: "sefiller", publisher: "Yordam", status: "published", price: 250, inventory: 12, normalized: "sefiller ve anlati yordam" },
  { title: "Yıldız Tozu", slug: "yildiz-tozu", publisher: "Yordam", status: "published", price: 180, inventory: 3, normalized: "yildiz tozu yordam" },
  { title: "Tasarlanmış Hayat", slug: "tasarlanmis", publisher: "Metis", status: "draft", price: 0, inventory: 0, normalized: "tasarlanmis hayat metis" },
  { title: "Bir Yıldız Tozu", slug: "bir-yildiz", publisher: "Metis", status: "published", price: 95, inventory: 40, normalized: "bir yildiz tozu metis" },
];

/** Each field birtedcom's admin filters on, as the column that holds it, and that column's rank. */
const FIELDS = {
  title: { column: "title", rank: 2 },
  publisher: { column: "publisher", rank: 2 },
  status: { column: "status", rank: 2 },
  price: { column: "price_in_t_r_y", rank: 1 },
  inventory: { column: "inventory", rank: 1 },
};

const results = [];
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) {
    console.log(`          expected ${JSON.stringify(expected)}`);
    console.log(`          actual   ${JSON.stringify(actual)}`);
  }
}

/**
 * A path literal the adapter bound: `{a,b}` for identifiers, `{"a b"}` when a key needed quoting.
 */
function fieldOfPath(literal) {
  const inner = literal.slice(1, -1);
  return (inner.includes('","') ? inner.split('","')[0] : inner).replace(/^"|"$/g, "");
}

/**
 * Rewrites one `data #> $n` read of a jsonb document into a read of a real column.
 *
 * **Only the read is rewritten, never a bound value.** That distinction is the whole thing: the
 * adapter binds a path literal where it reads a document and a filter value where it compares against
 * one, and both are `$n`. Replacing every placeholder produced
 * `price_in_t_r_y >= (price_in_t_r_y::numeric)`, which is true of every row and of none, and a proof
 * built on that would report a passing adapter for the wrong reason.
 *
 * Each rewrite takes the exact text the adapter emitted for this field, so a change in the adapter's
 * SQL stops matching here rather than being silently tolerated.
 */
function mapReads(text, field) {
  const { column, rank } = FIELDS[field];

  // The rank CASE. A jsonb document works out its own type per row; a mapped column's type is in the
  // schema, so the CASE is a constant.
  //
  // Written `(rank + 0)` rather than `rank` because a bare integer in `ORDER BY` is an **ordinal column
  // reference**, not a constant. Substituting a literal `1` for the rank made Postgres read it as
  // "sort by column 1", which is `id`, so the query sorted by insertion order and ignored the price
  // term entirely:
  //
  //     ORDER BY (1) ASC, (price_in_t_r_y) ASC      -> 250, 180, 0, 95   (unchanged)
  //     EXPLAIN: Sort Key: id, price_in_t_r_y
  //     ORDER BY (1+0) ASC, (price_in_t_r_y) ASC   -> 0, 95, 180, 250    (correct)
  //
  // The shipped adapter never emits a bare integer here: it writes a `CASE` over `jsonb_typeof`, so
  // this hazard belongs to the substitution and not to the adapter. It is worth recording rather than
  // quietly fixing, because the next reader of this file will find the same surprise.
  text = text.replace(
    /CASE COALESCE\(jsonb_typeof\(data #> \$\d+\), 'null'\)\s*WHEN 'null' THEN 0\s*WHEN 'number' THEN 1\s*WHEN 'boolean' THEN 1\s*ELSE 2 END/g,
    `(${rank} + 0)`,
  );
  // The numeric reading of a value, boolean translated to 1 or 0.
  text = text.replace(
    /CASE jsonb_typeof\(data #> \$\d+\)\s*WHEN 'number' THEN \(data #> \$\d+\)::text::numeric\s*WHEN 'boolean' THEN CASE WHEN \(data #> \$\d+\) = 'true'::jsonb THEN 1 ELSE 0 END\s*ELSE 0 END/g,
    column,
  );
  // The text reading of a value, under the C collation it is compared with.
  text = text.replace(
    /\(CASE WHEN jsonb_typeof\(data #> \$\d+\) = 'string' THEN \(data #> \$\d+\) #>> '\{\}' ELSE '' END\) COLLATE "C"/g,
    column,
  );
  // A bare numeric read, as an equality compares one.
  text = text.replace(/\(data #> \$\d+\)::text::numeric/g, column);
  // A bare `#>` left over from any of the above.
  text = text.replace(/data #> \$\d+/g, column);
  // A scalar read cast to text, which the text comparisons use.
  text = text.replace(/\(\(data #> \$\d+\) #>> '\{\}'\)/g, column);
  text = text.replace(/\(data #> \$\d+\) #>> '\{\}'/g, column);

  // `to_jsonb($n)` wraps a *value* so it can be compared with a document. A real column is already
  // its own type, so the wrapper goes and the cast stays: dropping it alone leaves `integer = $1` with
  // an untyped parameter, which Postgres answers with `operator does not exist: integer = text`.
  text = text.replace(/to_jsonb\((\(\s*)?(\$\d+)(\s*::\s*\w+)?(\s*\))?\)/g, "$2$3");

  // The adapter parenthesises a document read, as `(data #> $n)`. A bare column needs no brackets.
  //
  // **Only where a column substitution just produced one**, so this cannot touch a parenthesised
  // bound value. An earlier version unwrapped any `(word)` before a comparison, and it ate
  // `($1::numeric)` down to `$1` and then glued the following text onto it. Postgres does accept
  // `(publisher)`, so this is tidiness; doing it safely is the point.
  text = text.replace(/\((${Object.values(FIELDS).map((f) => f.column).join("|")})\)/g, "$1");

  return text;
}

/**
 * An adapter wired to birtedcom's table instead of its own.
 *
 * This is the substitution a mapped-schema host writes: the jsonb path becomes a real column, the
 * resource scoping goes because one table is one resource, and the projection gathers the columns the
 * adapter expects into the document it reads. The adapter's own statements are otherwise untouched,
 * which is what makes this a check on the adapter rather than a second implementation of it.
 */
function adapterOverBirtedProducts() {
  const client = {
    async query(text, values) {
      // The adapter's own existence check asks about a table name, not a column, and `products` is a
      // real table here, so it passes straight through.
      if (text.includes("to_regclass")) return pool.query(text, values);

      let statement = text
        .replace(/FROM helmdeck_records/g, "FROM products")
        .replace(/INSERT INTO helmdeck_records/g, "INSERT INTO products")
        .replace(/UPDATE helmdeck_records/g, "UPDATE products")
        .replace(/DELETE FROM helmdeck_records/g, "DELETE FROM products");

      // One table is one resource, so the resource column goes. **Its value stays in the list**,
      // because the resource is the *first* parameter the adapter binds and every path index below is
      // counted from that list: dropping the value early shifted every index down by one, and the
      // substitution that was meant to replace the path parameter replaced the filter's value instead.
      // The leftover value is removed after the substitution, with the paths.
      let resourceDropped = false;
      if (/WHERE resource = \$1/.test(statement)) {
        statement = statement
          .replace(/WHERE resource = \$1 AND /g, "WHERE ")
          .replace(/WHERE resource = \$1/g, "WHERE true");
        resourceDropped = true;
      }

      // The projection: the columns the adapter expects, gathered under the name it reads.
      statement = statement.replace(
        /SELECT data FROM/,
        "SELECT jsonb_build_object('id', id::text, 'title', title, 'publisher', publisher, " +
          "'status', status, 'price', price_in_t_r_y, 'inventory', inventory) AS data FROM",
      );

      // Every parameter that carries a path literal becomes the column it addresses.
      //
      // **Substitute first, on the original indices, then remove, then renumber once.** The order is
      // the whole thing. The adapter binds one path per expression it builds, so an ordering binds the
      // same path three times, and the values come after them. Removing and renumbering first moves
      // the filter's value down onto `$1`, and substituting `$1` afterwards replaces the *value* with
      // the column: `price_in_t_r_y >= (price_in_t_r_y::numeric)`, true of every row and of none.
      //
      // `mapReads` also runs once per distinct field, not once per parameter, because the same path is
      // bound repeatedly and a pass per parameter would rewrite a value position once the numbering
      // had shifted.
      let bound = [...values];
      const paths = [];
      for (let index = 1; index <= bound.length; index += 1) {
        const literal = bound[index - 1];
        if (typeof literal !== "string" || !literal.startsWith("{")) continue;
        const field = fieldOfPath(literal);
        if (!FIELDS[field]) throw new Error(`this proof maps no birtedcom column for "${field}"`);
        paths.push({ index, field });
      }

      const mapped = new Set();
      for (const { index, field } of paths) {
        if (!mapped.has(field)) {
          statement = mapReads(statement, field);
          mapped.add(field);
        }
        statement = statement.replace(
          new RegExp(`\\$${index}\\b`, "g"),
          FIELDS[field].column,
        );
      }

      if (paths.length > 0 || resourceDropped) {
        // The resource value is index 1 when its condition was removed above, and is removed with the
        // paths so the renumbering below sees one contiguous list.
        const gone = new Set(paths.map((path) => path.index));
        if (resourceDropped) gone.add(1);
        bound = bound.filter((_, position) => !gone.has(position + 1));
        let position = 0;
        statement = statement.replace(/\$(\d+)/g, () => `$${(position += 1)}`);
      }

      // Returned as the driver gave it. The adapter's own reader unwraps each row's `data` column into
      // the record it hands back, so the assertions below read `row.price` and not `row.data.price`:
      // what reaches a caller is the record, which is the contract.
      return pool.query(statement, bound);
    },
  };

  return createPostgresPersistenceAdapter({ pool: client, table: "products", tenant: false });
}

for (const row of SEED) {
  await pool.query(
    `INSERT INTO products (title, slug, publisher, status, price_in_t_r_y, inventory, sale_status,
                           language, page_count, search_normalized, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'stokta','Türkçe',100,$7, now(), now())`,
    [row.title, row.slug, row.publisher, row.status, row.price, row.inventory, row.normalized],
  );
}
console.log(`  birtedcom's products table, ${SEED.length} rows seeded\n`);
await pool.query(postgresSchema({ table: "helmdeck_records" }));

console.log("  the adapter's queries, its JSON reads pointed at birtedcom's real columns:");
const db = adapterOverBirtedProducts();

const all = await db.queryPage("products", {});
check("reads birtedcom's table", all.total, 4);

const byPublisher = await db.queryPage("products", {
  filter: [{ field: "publisher", operator: "eq", value: "Metis" }],
});
check("filters on a mapped text column", byPublisher.rows.length, 2);

const published = await db.queryPage("products", {
  filter: [{ field: "status", operator: "eq", value: "published" }],
});
check("filters on a second mapped column", published.rows.length, 3);

const priced = await db.queryPage("products", {
  filter: [{ field: "price", operator: "gte", value: 100 }],
  sort: [{ field: "price", direction: "asc" }],
});
check(
  "orders a mapped integer column numerically, which is what getAdminProducts pages over",
  priced.rows.map((row) => row.price),
  [180, 250],
);

const every = await db.queryPage("products", { sort: [{ field: "price", direction: "asc" }] });
check(
  "puts 0 and 95 in their true places rather than ordering them as text",
  every.rows.map((row) => row.price),
  [0, 95, 180, 250],
);

const paged = await db.queryPage("products", { window: { offset: 2, limit: 2 } });
check("windows over a mapped table without losing a row", [paged.rows.length, paged.total], [2, 4]);

const stock = await db.queryPage("products", {
  filter: [{ field: "inventory", operator: "lte", value: 3 }],
});
check("compares a mapped integer with an inequality", stock.rows.length, 2);

console.log("\n  and the same database through the adapter's own jsonb table:");
const own = createPostgresPersistenceAdapter({ pool, table: "helmdeck_records", tenant: false });
const written = await own.create("products", { title: "Adapter testi", publisher: "Yordam", price: 42 });
check("stores and reads back", (await own.read("products", written.id)).title, "Adapter testi");
const filtered = await own.queryPage("products", {
  filter: [{ field: "publisher", operator: "eq", value: "Yordam" }],
});
check("filters a jsonb document", filtered.total, 1);
const sorted = await own.queryPage("products", { sort: [{ field: "price", direction: "asc" }] });
check("orders jsonb numbers as numbers", sorted.rows.map((row) => row.price), [42]);
await own.delete("products", written.id);
check("deletes only its own row", await own.read("products", written.id), null);

const failed = results.filter((r) => !r.pass);
console.log(`\n  ${results.length - failed.length} of ${results.length} passed`);
if (failed.length > 0) console.log(`  FAILED: ${failed.map((r) => r.name).join("; ")}`);
await pool.query("DROP TABLE IF EXISTS helmdeck_records CASCADE");
await pool.query("DELETE FROM products WHERE slug = ANY($1)", [SEED.map((r) => r.slug)]);
await pool.end();
process.exit(failed.length > 0 ? 1 : 0);