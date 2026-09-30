// SPDX-License-Identifier: MIT

/**
 * Bucketing rows a host has already read into the points a chart draws, with the totals those points add up to.
 *
 * This runs in memory over the rows handed to it, and that is the entire cost. Thirty points on a
 * chart can come from a million orders, but they come from reading all million of them, because an
 * `AdminPersistenceAdapter` answers with rows and nothing here can ask the store to aggregate. A host
 * whose table outgrows one dashboard range needs a query contract and a store that can sum in SQL;
 * until then this is the whole of it, and it is said here rather than left for a host to discover.
 *
 * The figures it hands back are exact or refused. That is checked per value and per addition, because
 * the two failures are separate and a guard for either one alone misses the other.
 */

/** What each measure is called, and the column or expression a bucket of it is built from. */
export type AdminAggregateMeasures<TRow, TMeasures> = {
  [K in keyof TMeasures]: (row: TRow) => number;
};

export type AdminAggregateBucket<TMeasures> = {
  /**
   * The string the host's `key` returned. A period rather than a row's identity, so several rows
   * normally share one, and the key is what a chart's category is matched on.
   */
  key: string;
  label: string;
  values: TMeasures;
  /** Rows in this bucket, so a count needs no measure of its own. */
  records: number;
};

export type AdminAggregateResult<TMeasures> = {
  /** One per period, ordered by the `range` where one was given and by first appearance otherwise. */
  buckets: Array<AdminAggregateBucket<TMeasures>>;
  /** Every measure summed from the buckets, which is what makes a total and its buckets agree. */
  totals: TMeasures;
  /** The sum of the buckets' `records`. */
  totalRecords: number;
  /** Rows whose key read as nothing. In neither the buckets nor the totals, and counted here instead. */
  unkeyed: number;
  /** Rows whose key is not one of the `range` keys. In neither the buckets nor the totals. */
  outOfRange: number;
};

export type AdminAggregateOptions<TRow, TMeasures extends Record<string, number>> = {
  rows: readonly TRow[];
  /**
   * The period a row falls on, as a string. `adminChartDayKey` is the one for days, and a key space
   * of the host's own making is as welcome as a date.
   *
   * Answer nothing for a row this cannot place, rather than answering a guess. A row filed under a
   * period it does not belong to is a total the axis does not show, and a row filed under the epoch
   * is a date range that suddenly has a spike at the start of the epoch.
   */
  key: (row: TRow) => string | null | undefined;
  measures: AdminAggregateMeasures<TRow, TMeasures>;
  /**
   * The periods the answer covers, in the order they are drawn.
   *
   * Every one of them comes back, holding a zero where nothing landed on it. Without the range a
   * period with no rows is not emitted at all, and a chart built from the rows alone draws a straight
   * line across it and reports the line as a trend.
   */
  range?: readonly string[];
  /**
   * How a period is named on the axis, and the row behind it for a host whose name is not a function
   * of the period. `row` is the first row the bucket took, so a host keying each row to its own
   * bucket gets exactly that row and a host grouping many rows together should ignore it.
   */
  label?: (key: string, row: TRow | undefined) => string;
};

/**
 * A column a measure is built from, refused rather than coerced.
 *
 * The stores hold integers, and a total computed from anything else reads correctly on screen while
 * being wrong, which is the one failure a number on a tile cannot be checked against. Refusing puts it
 * in the tile's error state where the reason is visible. A bigint is accepted because a driver
 * configured for 64-bit integers is still an integer.
 *
 * Refused as well is anything past `Number.MAX_SAFE_INTEGER`, and that is a second guard rather than a
 * restatement of the first. `Number.isInteger(2 ** 53)` is true, so an integer check admits a value
 * whose precision was already lost before this function saw it. `Number(bigint)` is worse: it does
 * not merely admit an inexact value, it manufactures one from an exact input, turning 9007199254740993
 * into 9007199254740992 with no error anywhere. A money total wrong by one and looking right is the
 * failure this whole layer exists to make impossible.
 */
export function adminWholeNumber(value: unknown, column: string): number {
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new Error(`${column} is past the largest exact integer: ${value.toString()}`);
    }
    return Number(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "number" && Number.isInteger(value)) {
    throw new Error(`${column} is an integer whose precision is already lost: ${value}`);
  }
  throw new Error(`${column} is not a whole number: ${JSON.stringify(value)}`);
}

/**
 * A set of measure totals as a plain record, which is what a generic accumulator has to be written
 * against. TypeScript will not write through `TMeasures[keyof TMeasures]`, because a caller may
 * narrow a measure's type below `number`, and the cast is where that narrowing would have to be
 * checked. A measure is declared as `(row) => number` and cannot narrow, so nothing is lost here.
 */
type MeasureTotals<TMeasures> = Record<keyof TMeasures, number>;

function zeros<TMeasures extends Record<string, number>>(names: readonly (keyof TMeasures)[]): MeasureTotals<TMeasures> {
  const values = {} as MeasureTotals<TMeasures>;
  for (const name of names) values[name] = 0;
  return values;
}

/**
 * A measure that answered something which cannot be added up.
 *
 * `NaN` in a measure does not show as `NaN` on a chart. It shows as an axis with one bar shorter
 * than the number it was given, which is a figure nobody can audit.
 */
function measured(name: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`the measure "${name}" answered ${JSON.stringify(value)}, which is not a finite number`);
  }
  return value;
}

/**
 * One addition, refused when the running total stops being a whole number a number can hold.
 *
 * This is the same failure `adminWholeNumber` refuses one level down, and it is separate for the
 * same reason: a thousand rows of `4_000_000_000_000` are each perfectly exact and add up to a
 * number no double holds. `adminWholeNumber` cannot see it, because every value it is given is fine.
 *
 * Checked on every addition rather than on the finished sum, and a signed measure is why. A bucket
 * that goes to `2 ** 53` and back down again finishes under the limit having already rounded the
 * largest value away, so a check on the answer alone returns a total that is wrong by an amount
 * nothing downstream can see. `where` names the bucket or the total, because the figure a host needs
 * in order to act is which of their measures and which of their periods crossed.
 *
 * A sum of non-integers is not this guard's business. `0.1 + 0.2` is not `0.3` for reasons that have
 * nothing to do with a boundary, and a host measuring a rate has chosen float arithmetic knowingly.
 */
function added(name: string, total: number, value: number, where: string): number {
  const sum = total + value;
  if (Number.isInteger(sum) && !Number.isSafeInteger(sum)) {
    throw new Error(
      `the measure "${name}" summed to ${sum} over ${where}, past the largest whole number a number ` +
        `holds (${Number.MAX_SAFE_INTEGER}). The figure would be wrong by an amount nothing downstream ` +
        "can detect. Narrow the range, or measure in a unit a number can sum.",
    );
  }
  return sum;
}

/** A key that is a period, or nothing at all, with the surrounding space a hand-written key may carry. */
function periodOf(value: string | null | undefined): string | null {
  const period = typeof value === "string" ? value.trim() : "";
  return period === "" ? null : period;
}

/** A range listing one period twice is a host's slip, and it gets one bucket rather than two identical ones. */
function distinct(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}

export function adminAggregate<TRow, TMeasures extends Record<string, number>>(
  options: AdminAggregateOptions<TRow, TMeasures>,
): AdminAggregateResult<TMeasures> {
  const { rows, key, measures, label } = options;
  const names = Object.keys(measures) as Array<keyof TMeasures>;
  const range = options.range === undefined ? undefined : distinct(options.range);

  const order: string[] = range === undefined ? [] : [...range];
  const known = new Set(order);
  const sums = new Map<string, MeasureTotals<TMeasures>>();
  const counts = new Map<string, number>();
  const firstRow = new Map<string, TRow>();

  let unkeyed = 0;
  let outOfRange = 0;

  for (const row of rows) {
    const period = periodOf(key(row));
    if (period === null) {
      unkeyed += 1;
      continue;
    }
    // A row dated past the last day of the range, or before its first, would be in the total the tile
    // reads aloud beside the drawing and on no bar of it. Bounded at both ends for that reason: a
    // total the chart does not show is the disagreement this is here to prevent.
    if (range !== undefined && !known.has(period)) {
      outOfRange += 1;
      continue;
    }

    let values = sums.get(period);
    if (values === undefined) {
      values = zeros(names);
      sums.set(period, values);
      counts.set(period, 0);
      firstRow.set(period, row);
      if (!known.has(period)) {
        known.add(period);
        order.push(period);
      }
    }
    for (const name of names) {
      values[name] = added(String(name), values[name], measured(String(name), measures[name](row)), `"${period}"`);
    }
    counts.set(period, (counts.get(period) ?? 0) + 1);
  }

  // Summed off the buckets rather than accumulated beside them, so the total and the points it was
  // read from are the same additions and a range total cannot drift from the sum of its own series.
  const totals = zeros(names);
  let totalRecords = 0;
  const buckets: Array<AdminAggregateBucket<TMeasures>> = order.map((period) => {
    const values = sums.get(period) ?? zeros(names);
    const records = counts.get(period) ?? 0;
    // The buckets are individually guarded above, so this is the second crossing and a different one:
    // five safe buckets can add to an unsafe total, and the total is the figure read aloud.
    for (const name of names) totals[name] = added(String(name), totals[name], values[name], "the whole range");
    totalRecords += records;
    return { key: period, label: label?.(period, firstRow.get(period)) ?? period, values: values as TMeasures, records };
  });

  return { buckets, totals: totals as TMeasures, totalRecords, unkeyed, outOfRange };
}

export type AdminAggregateTotalsOptions<TRow, TMeasures extends Record<string, number>> = {
  rows: readonly TRow[];
  measures: AdminAggregateMeasures<TRow, TMeasures>;
};

/**
 * The same measures over the same rows, with nothing bucketed.
 *
 * For the figures a dashboard reads beside its charts rather than on them: an order count, a stock
 * total, a catalog's value. Those are `adminAggregate` with the grouping left off, and they go
 * through the same guard, so a tile cannot total one way while its neighbour totals another.
 */
export function adminAggregateTotals<TRow, TMeasures extends Record<string, number>>(
  options: AdminAggregateTotalsOptions<TRow, TMeasures>,
): TMeasures {
  const { rows, measures } = options;
  const names = Object.keys(measures) as Array<keyof TMeasures>;
  const totals = zeros(names);
  for (const row of rows) {
    for (const name of names) {
      const measure = String(name);
      totals[name] = added(measure, totals[name], measured(measure, measures[name](row)), "every row");
    }
  }
  return totals as TMeasures;
}
