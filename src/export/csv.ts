// SPDX-License-Identifier: MIT
// A CSV cell, written, and the same cell read back. Both halves of the round trip live here, because
// a writer and a reader that each decide the escaping on their own is a pair that disagrees on the
// one value they were written for.

/**
 * The characters a spreadsheet reads as the start of something it will evaluate.
 *
 * `=`, `+`, `-` and `@` are the four a cell beginning with one of them is executed as rather than
 * shown as, and the leading whitespace is here because a reader that trims a cell before looking at
 * its first character is looking at the second one.
 */
const FORMULA = /^\s*[=+\-@]/;

/**
 * A value that is nothing but a number, which is the one thing in that set a spreadsheet cannot
 * execute.
 *
 * `-3.5` is a number to every reader that opens the file, so marking it would turn a refund into a
 * piece of text for the sake of a threat it does not carry: a cell with no operator and no function
 * name in it has nothing to run. `=1+1` is not one of these, and is marked, because a cell beginning
 * with `=` is a formula to a reader whatever is behind the sign.
 */
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** The characters RFC 4180 says a cell has to be wrapped for, rather than only separated. */
const NEEDS_QUOTES = /["\r\n,]/;

/**
 * One value, as the text a cell holds, before it is quoted.
 *
 * A document and a list are written as their own JSON, which is the spelling the shipped stores rank
 * them by, so an exported value is the value rather than `[object Object]`. A date is its own ISO
 * form, because `JSON.stringify` would wrap it in quotes and a cell holding quotes around a date is
 * a date a person has to strip.
 */
function spelling(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (typeof (value as { toISOString?: unknown }).toISOString === "function") {
      return (value as { toISOString: () => string }).toISOString();
    }
    return JSON.stringify(value) ?? "";
  }
  return String(value);
}

/**
 * One value as a CSV cell, safe to open.
 *
 * Two rules, and the second is the one that matters. A cell is quoted when it holds a character that
 * would end it early, which is what keeps a comma, a quote and a newline inside the value where they
 * belong. And a cell a spreadsheet would evaluate is marked, because a customer's name of
 * `=HYPERLINK("http://evil","Statement")` written honestly is a file that runs on the finance team's
 * machine the moment somebody clicks the column, which is not a thing an export may hand over
 * silently. The mark is a leading apostrophe, which every reader treats as "this cell is text", and
 * `adminCsvText` takes it off again, so the value survives the file.
 *
 * A value beginning with an apostrophe is marked too, and that is not redundancy: it is what tells
 * the two apart on the way back in. A value of `'tis` is written `''tis` and read back `'tis`, where
 * a reader that only looked for the formula mark would have read `''tis` as `'tis` and been right
 * by accident until a value of `'=1+1` arrived and been wrong. One prefix, applied to both, and the
 * reader unwraps it in one step.
 *
 * An empty value is an empty cell, which is how a null and an absent field reach a spreadsheet as
 * nothing rather than as the words `null` or `undefined`.
 */
export function adminCsvCell(value: unknown): string {
  const text = spelling(value);
  if (text.length === 0) return "";
  // One prefix, for either of the two reasons there is one: a cell a spreadsheet would evaluate, and
  // a cell whose own first character is the mark itself. Marking both with the same character is what
  // lets the reader take it off again without knowing which reason it was.
  const marked =
    (FORMULA.test(text) && !PLAIN_NUMBER.test(text)) || text.startsWith("'") ? `'${text}` : text;
  if (!NEEDS_QUOTES.test(marked)) return marked;
  return `"${marked.replace(/"/g, '""')}"`;
}

/**
 * The value a cell carries, which is the text with the mark of `adminCsvCell` taken off.
 *
 * The mark is only removed where the writer would have put one: a doubled leading apostrophe first,
 * because a value of `'=1+1` is written with its own apostrophe doubled and a reader that checked the
 * formula mark first would strip the wrong one. A cell from another writer is left alone unless it
 * carries a mark this writer would have put there, so a foreign file keeps the apostrophes it meant.
 */
export function adminCsvText(cell: string): string {
  if (cell.startsWith("''")) return cell.slice(1);
  if (cell.startsWith("'") && FORMULA.test(cell.slice(1))) return cell.slice(1);
  return cell;
}
