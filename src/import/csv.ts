// SPDX-License-Identifier: MIT
import { adminCsvText } from "../export/csv.js";

/** One physical record of a CSV, and whether it could be read as one. */
export type AdminCsvRecord = {
  /**
   * The line the record starts on, counted from one, which is the line a person editing the file has
   * to look at. A record holding a newline in one of its cells spans several, so this is the first
   * of them and the next record's number is past all of them.
   */
  line: number;
  /** The cells, empty when the record could not be read. */
  cells: string[];
  /** Why the record could not be read, or null when it was. */
  error: string | null;
};

/** What a reader is fed: a whole file, a stream of pieces of one, or the bytes of either. */
export type AdminCsvSource =
  | string
  | ArrayBufferView
  | Iterable<string | ArrayBufferView>
  | AsyncIterable<string | ArrayBufferView>;

/**
 * Where a cell is, and which of its characters the next one has to decide.
 *
 * A CSV reader is a state machine for the reason everything else in this package is: the character
 * that ends a cell is the same character that may be sitting inside a quoted cell holding a quote, so
 * whether this character finishes the value is a property of how the reader got here rather than of
 * the character.
 */
type State = "start" | "plain" | "quoted" | "quoted-quote";

/**
 * The source as the one async iterable the reader below reads from.
 *
 * A string is a single chunk rather than an iterable of its own characters, which would parse and mean
 * something else entirely. A typed array is handed over whole, because iterating one directly yields
 * the numbers in it rather than the bytes, and it is asked about with `ArrayBuffer.isView` rather
 * than with `instanceof`: a caller in another realm hands over a perfectly good `Uint8Array` that is
 * not this realm's, and the check that says so is the difference between a file and a list of numbers.
 */
function chunksOf(source: AdminCsvSource): AsyncIterable<string | ArrayBufferView> {
  if (typeof source === "string" || ArrayBuffer.isView(source)) {
    return (async function* () {
      yield source as string | ArrayBufferView;
    })();
  }
  if (Symbol.asyncIterator in source) return source as AsyncIterable<string | ArrayBufferView>;
  return (async function* () {
    for (const chunk of source as Iterable<string | ArrayBufferView>) yield chunk;
  })();
}

/**
 * A file, read as records, one at a time, without holding it.
 *
 * The same code reads a file handed over in one string and a file arriving a character at a time,
 * because a route given a request body cannot make the file a string first without making the server
 * hold whatever was uploaded. The pieces a caller hands over can split anywhere, including between the
 * two halves of one character, so nothing is decided until the next piece has been read: `one,"tw`
 * followed by `o",three` is one record of three cells, the same record an unsplit file would give.
 *
 * A record that cannot be read is yielded rather than thrown, and the reader starts again at the line
 * break after it. Refusing the file would be the alternative, and one stray quote among ten thousand
 * good rows would take every one of them with it: a row is the unit a person can fix, and a row is
 * what this loses.
 *
 * A line holding nothing at all is not a record, because the break a writer puts after its last row
 * is one, and reading it as an empty row would write a record of nothing at the end of every import.
 */
export async function* adminCsvRecords(source: AdminCsvSource): AsyncGenerator<AdminCsvRecord, void, void> {
  const decoder = new TextDecoder();
  let state: State = "start";
  let cells: string[] = [];
  let cell = "";
  let line = 1;
  let recordLine = 1;
  let touched = false;
  /** This record is broken: its cells are dropped and the rest of its line is ignored. */
  let broken: string | null = null;
  // A byte-order mark says the file is not Latin-1, and it belongs to the first name in the file
  // rather than to the file, so it is dropped at the front and kept everywhere else.
  let front = true;
  // Set by a carriage return and cleared by the character after it: a CR and an LF are one break and
  // one line, and counting them as two would put every row number after the first one wrong. Set
  // inside a quoted cell too, where the LF is the value's own second half rather than a break.
  let afterCr = false;

  const record = (): AdminCsvRecord =>
    broken === null
      ? { line: recordLine, cells: [...cells, cell], error: null }
      : { line: recordLine, cells: [], error: broken };

  const flush = (): AdminCsvRecord[] => {
    const ended = touched ? [record()] : [];
    cells = [];
    cell = "";
    touched = false;
    broken = null;
    state = "start";
    return ended;
  };

  const read = (text: string): AdminCsvRecord[] => {
    const records: AdminCsvRecord[] = [];
    for (const char of text) {
      if (front) {
        front = false;
        if (char === "\ufeff") continue;
      }
      if (afterCr) {
        afterCr = false;
        // The other half of a CRLF. Inside a quoted cell it is the value's own character and stays
        // in it; outside one the record has already ended and this is nothing at all.
        if (char === "\n") {
          if (state === "quoted") cell += char;
          continue;
        }
      }
      if (char === "\r" || char === "\n") {
        if (state === "quoted") {
          cell += char;
          line += 1;
          if (char === "\r") afterCr = true;
          continue;
        }
        line += 1;
        // The cell is not pushed here: `record` appends it, and pushing it as well is how a row ends
        // up with one more field than the file has.
        records.push(...flush());
        afterCr = char === "\r";
        continue;
      }
      if (broken !== null) continue;
      if (!touched) {
        touched = true;
        recordLine = line;
      }
      if (state === "start" || state === "plain") {
        if (char === '"' && state === "start") {
          state = "quoted";
          continue;
        }
        if (char === ",") {
          cells.push(cell);
          cell = "";
          state = "start";
          continue;
        }
        cell += char;
        state = "plain";
        continue;
      }
      if (state === "quoted") {
        if (char === '"') {
          state = "quoted-quote";
          continue;
        }
        cell += char;
        continue;
      }
      // A quote inside a quoted cell is either a literal quote or the end of the cell, and the
      // character after it is what says which.
      if (char === '"') {
        cell += '"';
        state = "quoted";
        continue;
      }
      if (char === ",") {
        cells.push(cell);
        cell = "";
        state = "start";
        continue;
      }
      // A character after the closing quote that is neither a comma nor a break: the file says two
      // values in one cell and does not say how they are separated, and reading them as one value
      // would be guessing at the number of fields the row has.
      broken = `the cell closed by a quote on line ${recordLine} is followed by ${JSON.stringify(char)}, which is neither a comma nor a line break`;
    }
    return records;
  };

  /**
   * What the last piece of the file left behind, read as a record.
   *
   * A file that ends inside a quoted cell has no record at the end of it: everything after the quote
   * is inside the value, and the file cannot say where that ends. Saying so is the whole of the last
   * outcome, rather than a row written from half a value.
   */
  const finish = (): AdminCsvRecord[] => {
    if (state === "quoted") {
      return [
        {
          line: recordLine,
          cells: [],
          error: `the quoted cell on line ${recordLine} is never closed, so the rest of the file is inside it`,
        },
      ];
    }
    // A file whose last row has no line break after it is still a file with a last row, and `record`
    // appends the cell the break would have ended.
    if (!touched) return [];
    return [record()];
  };

  for await (const chunk of chunksOf(source)) {
    const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    for (const found of read(text)) yield found;
  }
  const tail = decoder.decode();
  if (tail.length > 0) {
    for (const found of read(tail)) yield found;
  }
  for (const found of finish()) yield found;
}

/** The value a cell carries, with the mark `adminCsvCell` puts on one taken off again. */
export function adminCsvCellValue(cell: string): string {
  return adminCsvText(cell);
}
