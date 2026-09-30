// SPDX-License-Identifier: MIT
import { ADMIN_RESOURCE_MAX_LIMIT, parseAdminResourceQuery } from "../adapters/query.js";
import type { AdminResourceQuery } from "../adapters/query.js";
import type { AdminResourceActions } from "../resources/actions.js";
import type { AdminResourceColumnFormat, AdminResourceRecord } from "../resources/registry.js";
import { adminFormatCents, adminFormatCount } from "../charts/money.js";
import { adminCsvCell } from "./csv.js";

/**
 * The most rows one export writes.
 *
 * An export is the one read here with no window on it, so the cap on a window does not bound it: a
 * query matching four million rows would walk a hundred of them and produce a file nobody can open.
 * The number is a refusal rather than a truncation, because a file holding the first fifty thousand
 * rows of a hundred thousand is a file that claims to be the list and is not, which is the one
 * outcome nobody downstream can detect. Narrowing the query is the answer, and the message says so.
 */
export const ADMIN_RESOURCE_EXPORT_MAX_ROWS = 50_000;

/**
 * Refused before a single byte is written, because each of these is a question the export cannot
 * answer rather than a failure partway through one.
 */
export class AdminResourceExportError extends Error {
  readonly resource: string;

  constructor(resource: string, reason: string) {
    super(`Cannot export ${resource}: ${reason}`);
    this.name = "AdminResourceExportError";
    this.resource = resource;
  }
}

/**
 * One column of the file, and the row's value as the cell holds it.
 *
 * The columns are declared rather than read off a resource definition, for two reasons that point
 * the same way. A definition's header is a node, which a file cannot hold, so a host would have to
 * say the text anyway; and a column naming another row's field is a column whose value is that row's
 * label rather than its id, which is a read of the target resource per page and a decision about how
 * many reads a file is worth. Declaring the columns puts both of those choices in the place that can
 * make them, and leaves nothing to be read correctly by accident.
 */
export type AdminResourceExportColumn = {
  /** The field of the row this column holds, as a top-level name. */
  key: string;
  /** The text in the header row. The key, when none is given, which is a name rather than a label. */
  header?: string;
  /** One of the two names the package answers, or one of the host's own. */
  format?: AdminResourceColumnFormat;
  /** The cell's value, for a column that is not the field of that name. */
  value?: (row: AdminResourceRecord) => unknown;
};

/**
 * The two format names this package answers as text, which are the two the list answers as nodes.
 *
 * Same names, same divisions, and the same moment: a column formatting money divides by a hundred
 * here as it does in the cell beside it, so a file of a list and the list agree about what a price
 * is. A value that is not a number is written as itself rather than as a dash, because a cell
 * holding a dash is a column no spreadsheet will total.
 */
const SHIPPED_TEXT: Record<"money" | "count", (value: unknown) => string> = {
  money: (value) => (typeof value === "number" ? adminFormatCents(value) : String(value)),
  count: (value) => (typeof value === "number" ? adminFormatCount(value) : String(value)),
};

/** A cell's text, before it is spelled. `adminCsvCell` is what turns a value into one. */
type CellText = (value: unknown, row: AdminResourceRecord) => unknown;

export type AdminResourceExportOptions = {
  /**
   * The resource actions, and the paged query among them.
   *
   * The actions rather than a persistence adapter, because the read has to be the one a list is
   * refused or allowed: an export that reached a store directly would hand a session that may read
   * forty rows a file of the whole table, which is the same shape of leak as a row-scoped rule
   * bypassed once per page. `queryPage` is optional on the type because it is optional on the
   * actions, and its absence is refused below rather than worked around.
   */
  actions: Pick<AdminResourceActions, "queryPage">;
  /** The resource to read, as the list names it. */
  resource: string;
  columns: readonly AdminResourceExportColumn[];
  /**
   * The query the list is showing, as it arrived from the browser.
   *
   * Read here by the parser the seam uses, so a query the store cannot be asked is refused by the
   * same rule that refuses it for a read. A window in it is dropped: an export is the whole list the
   * query names rather than the page the reader happened to be on, and the window this writes is its
   * own.
   */
  query?: unknown;
  /** The format names of the host's own, asked before the two this package ships. */
  formatters?: Readonly<Record<string, (value: unknown, row: AdminResourceRecord) => string>>;
};

export type AdminResourceExportOptionsWithName = AdminResourceExportOptions & {
  /** The name the browser is offered the file under. The resource's own name, when none is given. */
  filename?: string;
};

export type AdminResourceExport = {
  resource: string;
  /** The header row's text, in the order the columns were declared. */
  columns: string[];
  /** The query as this package read it, with the window the export walked left out. */
  query: AdminResourceQuery;
  /**
   * How many records the store said the query matched, counted before any window.
   *
   * The store's own number rather than a length of the rows that came back, so a file and a count
   * that disagree are visibly two claims rather than one.
   */
  total: number;
  /**
   * The file, one chunk per row, with the header row before them.
   *
   * The generator's own return value is what the walk finished with: how many rows the file holds,
   * and whether that is the count the store reported. Reading it means driving the iterator by hand,
   * which is what a host writing to a file does anyway.
   */
  rows: AsyncGenerator<string, AdminResourceExportFinished, void>;
};

export type AdminResourceExportFinished = {
  /** The rows the file holds. */
  exported: number;
  /** Whether that is the count the store reported for the query. */
  complete: boolean;
};

/** A window, spelled out, so the walk and the check read the same. */
function windowAt(offset: number): { offset: number; limit: number } {
  return { offset, limit: ADMIN_RESOURCE_MAX_LIMIT };
}

/**
 * A page, read as one, or a refusal.
 *
 * The store is the one part of this that was written by somebody else, and a page whose rows are
 * not rows or whose count is not a count is a store answering a question this package did not ask.
 * Walking it as if it were a page would put a count in the file that no record agrees with.
 */
function pageAt(answer: unknown, resource: string): { rows: AdminResourceRecord[]; total: number } {
  const page = answer as { rows?: unknown; total?: unknown } | null;
  if (page === null || typeof page !== "object" || !Array.isArray(page.rows)) {
    throw new AdminResourceExportError(resource, "the store's paged query answered with no rows to walk");
  }
  if (typeof page.total !== "number" || !Number.isSafeInteger(page.total) || page.total < 0) {
    throw new AdminResourceExportError(
      resource,
      `the store's paged query counted ${JSON.stringify(page.total)} records, which is not a count`,
    );
  }
  const rows: AdminResourceRecord[] = [];
  for (const row of page.rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new AdminResourceExportError(resource, "the store's paged query answered with something that is not a record");
    }
    rows.push(row as AdminResourceRecord);
  }
  return { rows, total: page.total };
}

/** The format a column names, resolved to the text it prints, or refused. */
function textFor(
  column: AdminResourceExportColumn,
  formatters: AdminResourceExportOptions["formatters"],
): CellText {
  if (column.format === undefined) return (value) => value;
  const name = typeof column.format === "string" ? column.format : column.format.name;
  // Own properties on both records, for the reason the list gives: a plain lookup answers
  // `toString` and `constructor`, which are truthy, and the cell would print the prototype's output.
  const own = (record: Readonly<Record<string, unknown>> | undefined): unknown =>
    record === undefined || !Object.hasOwn(record, name) ? undefined : record[name];
  const printer = (own(formatters) ?? own(SHIPPED_TEXT)) as CellText | undefined;
  if (!printer) {
    // A plain error rather than the export's own, because this is a mistake in the declaration and
    // it is found before anything is asked of the store, which is where the list finds its own.
    throw new Error(
      `Column ${column.key} formats as ${JSON.stringify(name)}, which nothing answers. ` +
        `This package ships ${Object.keys(SHIPPED_TEXT).join(" and ")}, and a host names the rest in ` +
        `\`formatters\`. Known names: ${[...Object.keys(formatters ?? {}), ...Object.keys(SHIPPED_TEXT)].join(", ")}.`,
    );
  }
  return printer;
}

/**
 * The list a person is looking at, as a file.
 *
 * An export is not a dump of the table, and the difference is the whole of it. The query the list is
 * showing arrives here, is read by the same parser a read is refused by, and goes to the same store
 * through the same actions, so what lands in the file is the filtered, searched and ordered set the
 * reader is looking at rather than every row the resource holds. The store counts the set before any
 * window, and that count is the file's own claim about itself, so a file and the list beside it
 * cannot quietly disagree about how many records there are.
 *
 * The first window is read before this resolves, which is what makes the refusal a refusal rather
 * than a body that fails once it is piped: a session the rule refuses, a store that cannot count and
 * a query matching more rows than one export writes all throw here, with nothing written and the
 * store never asked for a second window. The rest is yielded one row at a time, so a file is never
 * held whole in memory by this package, and the caller is what decides what the bytes reach.
 *
 * Give the query an ordering if the store does not settle ties itself: this walks the matched set in
 * windows, and a store that ranks rows differently on two queries for the same set is a store where
 * a row can be read twice and another not at all.
 */
export async function adminResourceExport(options: AdminResourceExportOptions): Promise<AdminResourceExport> {
  const { actions, resource, columns, formatters } = options;
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new AdminResourceExportError(resource, "the export declares no columns, so the file would have a header and nothing under it");
  }
  for (const column of columns) {
    if (typeof column.key !== "string" || column.key.length === 0) {
      throw new AdminResourceExportError(resource, "one of the columns names no field of the row");
    }
    // A dotted path is a store's own addressing and this does not walk one, so it is refused rather
    // than read as a field nothing holds, which would be a column of empty cells in the file.
    if (column.key.includes(".")) {
      throw new AdminResourceExportError(
        resource,
        `the column ${JSON.stringify(column.key)} names a nested path. This reads a top-level field, ` +
          "and a column that reaches into a nested value says so with its own `value`.",
      );
    }
  }
  const paged = actions.queryPage;
  if (typeof paged !== "function") {
    throw new AdminResourceExportError(
      resource,
      "the host's store cannot answer a paged query. An export needs the count that comes with one, " +
        "and a store that cannot count cannot be asked for the whole of a query without one.",
    );
  }
  // Through the object rather than as a bare call, because `queryPage` is a member of a host's
  // actions and one written as a method is entitled to its own `this`.
  const ask = paged.bind(actions);

  const asked = parseAdminResourceQuery(options.query);
  const query: AdminResourceQuery = { ...asked };
  delete query.window;

  const printers = columns.map((column) => textFor(column, formatters));
  const headers = columns.map((column) => column.header ?? column.key);
  const end = "\r\n";
  const line = (cells: readonly unknown[]): string => `${cells.map((cell) => adminCsvCell(cell)).join(",")}${end}`;
  const row = (record: AdminResourceRecord): string =>
    line(
      columns.map((column, index) => {
        const value = column.value ? column.value(record) : record[column.key];
        // A value the row does not hold is an empty cell whatever the format says, because a dash in
        // a numeric column is a column no one can sum and an empty one is the absence it is.
        if (value === undefined || value === null) return null;
        return printers[index](value, record);
      }),
    );

  const first = pageAt(await ask(resource, { ...query, window: windowAt(0) }), resource);
  if (first.total > ADMIN_RESOURCE_EXPORT_MAX_ROWS) {
    throw new AdminResourceExportError(
      resource,
      `the query matched ${first.total} records, above the ${ADMIN_RESOURCE_EXPORT_MAX_ROWS} one export ` +
        "writes. Narrow the query, or read the resource through your own store where the size is your decision.",
    );
  }

  // Held beside the walk rather than inside it, so a consumer that walks away from the file knows how
  // far it got: a response cancelled half way through is a partial file, and this is what says so.
  const written = { rows: 0 };

  async function* walk(): AsyncGenerator<string, AdminResourceExportFinished, void> {
    yield line(headers);
    let page = first;
    let offset = 0;
    for (;;) {
      for (const record of page.rows) {
        yield row(record);
        written.rows += 1;
      }
      offset += page.rows.length;
      // The count is the store's answer to the query rather than to this window, so it is what ends
      // the walk. A page that came back short with the set unfinished ends it too, and the finished
      // count is how a caller learns the file is not the whole list rather than finding out from a
      // row that is not there.
      if (written.rows >= first.total || page.rows.length === 0) break;
      page = pageAt(await ask(resource, { ...query, window: windowAt(offset) }), resource);
    }
    return { exported: written.rows, complete: written.rows === first.total };
  }

  return { resource, columns: headers, query, total: first.total, rows: walk() };
}

/**
 * The file a browser downloads: the same export, as a response.
 *
 * A route handler is what most hosts need and a string is not it, so this is the second of the two
 * rather than the only one. It streams the walk into the response, so the route does not hold the
 * file either, and it sets the two headers that make a response a download: the type, and the name.
 * The name is reduced to characters a header can carry, because a filename is a string a caller chose
 * and a quote or a newline in one is a second header written by whoever downloads the file.
 */
export async function adminResourceExportResponse(
  options: AdminResourceExportOptionsWithName,
): Promise<Response> {
  const file = await adminResourceExport(options);
  const wanted = options.filename ?? `${options.resource}.csv`;
  const name = wanted.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "") || "export.csv";
  return new Response(streamOf(file.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}

/**
 * A walk as a stream, one row at a time, so the response is written as it is read.
 *
 * A store that fails on the second window ends the stream with an error rather than a short file that
 * looks complete: the bytes already sent cannot be taken back, so the only honest ending is the
 * failure itself. A reader who stops reading leaves the walk suspended, which holds nothing and is
 * collected with the response.
 */
function streamOf(rows: AsyncGenerator<string, AdminResourceExportFinished, void>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const step = await rows.next();
        if (step.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(step.value));
      } catch (cause) {
        controller.error(cause);
      }
    },
  });
}
