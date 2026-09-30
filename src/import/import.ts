// SPDX-License-Identifier: MIT
import { adminCsvCellValue, adminCsvRecords, type AdminCsvSource } from "./csv.js";

/**
 * The most failures one run's report holds.
 *
 * The count is never capped, because a count of the rows that failed is the number a person deciding
 * whether to re-run the import needs. The list of them is capped, because a file where every row is
 * bad is ten thousand entries of the same sentence and a report nobody reads to the end is a report
 * that has told nobody anything. `failuresDropped` says what the cap left out.
 */
export const ADMIN_RESOURCE_IMPORT_MAX_FAILURES = 20;

/**
 * Refused before a row is written, because a file whose header cannot be read has no rows to write
 * and a host that guessed at its columns would be writing every row into the wrong fields.
 */
export class AdminResourceImportError extends Error {
  readonly resource: string;

  constructor(resource: string, reason: string) {
    super(`Cannot import ${resource}: ${reason}`);
    this.name = "AdminResourceImportError";
    this.resource = resource;
  }
}

/** One column of the file, and how its cell becomes what a write stores. */
export type AdminResourceImportColumn = {
  /**
   * The field of the record this column is written as.
   *
   * The file leads on what a row *says* and the record decides what a field is *called*, so the two
   * are named separately: a spreadsheet's `Price` is a store's `price_cents` often enough that a file
   * that could only be imported into a table whose columns are spelled the way a person typed them
   * would be a file half the exports could not come back from.
   */
  name: string;
  /**
   * The header name in the file this column is read under. The name, when none is given, which is the
   * case for a file this host's own export wrote.
   */
  header?: string;
  /**
   * Reads a cell into what a write stores.
   *
   * Handed `null` for a cell the file leaves empty, and the text otherwise. An empty cell is the
   * absence of a value, which is what an empty string and a null both look like in a file, so this is
   * where a host says which of the two it wants. A column with no `parse` gets the text, so an import
   * never turns a value into a number nobody asked it to be.
   */
  parse?: (text: string | null) => unknown;
};

/**
 * The half of the actions an import writes through: the one call a row is a create.
 *
 * The same shape `createAdminResourceActions` returns, written out rather than picked, because the
 * call is generic over what the store hands back and an importer has no use for that: it wants the
 * write to have happened or to have refused. `AdminResourceActions` satisfies it as it stands, and so
 * does a host's own function, which is what lets a fixture test the importer without a cast.
 */
export type AdminResourceImportWriter = {
  create: (resource: string, value: unknown) => Promise<unknown>;
};

export type AdminResourceImportOptions = {
  /**
   * The resource actions, and the create among them.
   *
   * A write through the actions rather than a persistence adapter, for the same reason an export
   * reads through them: the row is a create, so the rule, the exposed set, the references a write may
   * not name, the audit trail and the cache are all the ones a person typing the same row into a form
   * would get. An importer that wrote around them would create rows a session could not have created,
   * which is the one thing a form cannot do and the reason a form is not the only door.
   */
  actions: AdminResourceImportWriter;
  resource: string;
  columns: readonly AdminResourceImportColumn[];
  /**
   * The file, whole, in pieces, or as a request body.
   *
   * A `ReadableStream` is an async iterable of bytes in every runtime this package runs in, so
   * `request.body` is what a route hands over and the upload is never made to be a string first.
   */
  rows: AdminCsvSource;
  /**
   * Stop at the first row that cannot be written, rather than reading to the end of the file.
   *
   * Off by default, and the default is the only answer a streaming read can give: the rows already
   * written are written, the row that failed is reported, and the rows after it are still good.
   * Turning this on is for a caller that would rather have a short file and a re-run than a partial
   * one, and the result says which of the two it was.
   */
  stopOnError?: boolean;
};

/** What happened to one row. One of these per row, in the order the file holds them. */
export type AdminResourceImportOutcome =
  | { kind: "written"; line: number; values: Record<string, unknown> }
  | { kind: "rejected"; line: number; reason: string }
  | { kind: "malformed"; line: number; reason: string };

/** One row that did not make it, and which line of the file it was on. */
export type AdminResourceImportFailure = {
  line: number;
  kind: "rejected" | "malformed";
  reason: string;
};

export type AdminResourceImportResult = {
  resource: string;
  /** The rows read from the file, whether or not they were written. */
  read: number;
  /** The rows the store now holds because of this import. */
  written: number;
  /** The rows that were not written, which is `read` less `written`. */
  failed: number;
  /** Whether the run stopped at its first failure rather than reading to the end of the file. */
  stopped: boolean;
  /** The failures, up to the cap. */
  failures: AdminResourceImportFailure[];
  /** The failures the cap left out, so the list is never read as the whole of them. */
  failuresDropped: number;
};

/** Whether a run read the file to its end or stopped at the row that failed. */
export type AdminResourceImportStop = "stopped" | "complete";

/** What a refused write said, which is the part a person can act on. */
function reasonOf(cause: unknown): string {
  if (cause instanceof Error && typeof cause.message === "string" && cause.message.length > 0) {
    return cause.message;
  }
  return `the write was refused with ${String(cause)}`;
}

/**
 * The header row, read as the names the rest of the file is written in.
 *
 * Refused rather than repaired. A file with two columns of one name has rows whose cells cannot be
 * told apart, and one with a column of no name has a value with nowhere to go, so the alternative to
 * refusing here is a guess about which of the two the file meant, made once and applied to every row
 * below it.
 */
function headerOf(record: { line: number; cells: string[]; error: string | null }, resource: string): string[] {
  if (record.error !== null) throw new AdminResourceImportError(resource, record.error);
  if (record.cells.length === 0) throw new AdminResourceImportError(resource, "the file has no header row");
  const seen = new Set<string>();
  for (const name of record.cells) {
    if (name.trim().length === 0) {
      throw new AdminResourceImportError(resource, `the header on line ${record.line} has a column with no name`);
    }
    if (seen.has(name)) {
      throw new AdminResourceImportError(resource, `the header on line ${record.line} names ${JSON.stringify(name)} twice`);
    }
    seen.add(name);
  }
  return record.cells;
}

/**
 * The columns a host declared, keyed by the name the file gives them, and checked before the file is
 * read at all.
 *
 * Two columns reading the same header are a file whose two cells cannot be told apart, and two
 * writing the same field is a row whose second value overwrites the first, so both are refused rather
 * than resolved in the order they were declared.
 */
function checkedColumns(
  columns: readonly AdminResourceImportColumn[],
  resource: string,
): ReadonlyMap<string, AdminResourceImportColumn> {
  const declared = new Map<string, AdminResourceImportColumn>();
  const fields = new Set<string>();
  for (const column of columns) {
    if (typeof column?.name !== "string" || column.name.length === 0) {
      throw new AdminResourceImportError(resource, "one of the columns names no field to read the file's name into");
    }
    const header = column.header ?? column.name;
    if (declared.has(header)) {
      throw new AdminResourceImportError(
        resource,
        `two of the columns are read under the file's name ${JSON.stringify(header)}`,
      );
    }
    if (fields.has(column.name)) {
      throw new AdminResourceImportError(resource, `two of the columns are written as ${JSON.stringify(column.name)}`);
    }
    declared.set(header, column);
    fields.add(column.name);
  }
  return declared;
}

/**
 * A row's cells, as the write's own values.
 *
 * Every declared column is here, whether the file carries it or not, and a cell the file leaves out
 * is the same as one it leaves empty: both are `null`, because that is the one thing a file can say
 * about a value it does not hold. A column the file names and the host did not is passed through
 * under the name the file gave it rather than dropped, since which fields a write accepts is the write
 * boundary's decision and this has not read the resource's definition to know it.
 */
function valuesOf(
  record: { line: number; cells: string[] },
  header: readonly string[],
  declared: ReadonlyMap<string, AdminResourceImportColumn>,
): Record<string, unknown> {
  if (record.cells.length > header.length) {
    throw new Error(
      `the row on line ${record.line} holds ${record.cells.length} cells and the header names ${header.length}`,
    );
  }
  const byName = new Map<string, string | null>(
    header.map((name, index): [string, string | null] => [name, record.cells[index] ?? null]),
  );
  const values: Record<string, unknown> = {};
  // The file's own order first, so a value object reads in the order the file was written in, and then
  // whatever the host declared that the file did not name.
  for (const name of [...header, ...declared.keys()]) {
    const column = declared.get(name);
    const field = column?.name ?? name;
    if (Object.hasOwn(values, field)) continue;
    const cell = byName.get(name) ?? null;
    // The mark comes off before the column's parse sees the cell, so a number a writer marked is a
    // number the column can read rather than a string with an apostrophe on the front of it.
    const text = cell === null || cell.length === 0 ? null : adminCsvCellValue(cell);
    values[field] = column?.parse ? column.parse(text) : text;
  }
  return values;
}

/**
 * A file, read into the store a row at a time.
 *
 * This is the importer for the first row and for the ten thousandth, and the reason is that it never
 * holds more than one. A file arrives as records; each record becomes a write, and the write's own
 * outcome is what the caller hears about, before the next record has been read. Nothing is validated
 * up front because there is no up front: a batch that reads a file to check it and then writes it is
 * a batch that has to hold the file, and a file a person uploaded is a file of whatever size they
 * chose.
 *
 * **A row that cannot be written does not undo the rows that were.** They are in the store, and the
 * caller is told which line failed and what it said. That is not a shortcut around a transaction, it
 * is the only answer a streaming read can give: all or nothing means reading the whole file before
 * writing the first row, which is the batch this refuses to be, and a ten thousand row import rolled
 * back over one bad line is a person doing the work twice. A host that needs one row or the whole
 * file has to own the transaction, in its own store, where one belongs.
 *
 * A malformed record is reported the same way a refused write is and is never written, because there
 * are no values in it to write. Both are carried on the same stream as the rows that were written, so
 * a caller that only wants the failures reads the same one it reads the successes from.
 */
export async function* adminResourceImport(
  options: AdminResourceImportOptions,
): AsyncGenerator<AdminResourceImportOutcome, AdminResourceImportStop, void> {
  const { actions, resource } = options;
  const declared = checkedColumns(options.columns, resource);
  const stopOnError = options.stopOnError === true;
  let header: string[] | null = null;
  for await (const record of adminCsvRecords(options.rows)) {
    if (header === null) {
      header = headerOf(record, resource);
      continue;
    }
    if (record.error !== null) {
      yield { kind: "malformed", line: record.line, reason: record.error };
      if (stopOnError) return "stopped";
      continue;
    }
    let values: Record<string, unknown>;
    try {
      values = valuesOf(record, header, declared);
    } catch (cause) {
      yield { kind: "malformed", line: record.line, reason: reasonOf(cause) };
      if (stopOnError) return "stopped";
      continue;
    }
    try {
      await actions.create(resource, values);
      yield { kind: "written", line: record.line, values };
    } catch (cause) {
      yield { kind: "rejected", line: record.line, reason: reasonOf(cause) };
      if (stopOnError) return "stopped";
    }
  }
  // A file with no header row wrote nothing, and a run that reported success for a file it could not
  // read is a run that says it imported an upload which was never importable.
  if (header === null) {
    throw new AdminResourceImportError(resource, "the file is empty, so it has no header row to read");
  }
  return "complete";
}

/**
 * The same import, read to the end, and what it came to.
 *
 * The counting a host wants to put in a response, over the stream it already has: the rows written,
 * the rows refused, and the lines to look at. The failures are capped, and the count of the ones the
 * cap left out travels with them, so a report of twenty entries is never read as the whole of what
 * went wrong.
 */
export async function adminResourceImportResult(
  options: AdminResourceImportOptions,
): Promise<AdminResourceImportResult> {
  const result: AdminResourceImportResult = {
    resource: options.resource,
    read: 0,
    written: 0,
    failed: 0,
    stopped: false,
    failures: [],
    failuresDropped: 0,
  };
  // Driven by hand rather than with a `for await`, because whether the run reached the end of the
  // file is the generator's own return value and a `for await` throws that away.
  const rows = adminResourceImport(options)[Symbol.asyncIterator]();
  for (;;) {
    const step = await rows.next();
    if (step.done) {
      result.stopped = step.value === "stopped";
      break;
    }
    const outcome = step.value;
    result.read += 1;
    if (outcome.kind === "written") {
      result.written += 1;
      continue;
    }
    result.failed += 1;
    if (result.failures.length < ADMIN_RESOURCE_IMPORT_MAX_FAILURES) {
      result.failures.push({ line: outcome.line, kind: outcome.kind, reason: outcome.reason });
    } else {
      result.failuresDropped += 1;
    }
  }
  return result;
}
