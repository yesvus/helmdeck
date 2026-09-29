// SPDX-License-Identifier: MIT

/**
 * A ranked horizontal bar chart: one row per thing, its bar scaled against a labelled axis.
 *
 * Built from elements rather than from an SVG, and the reason is the labels. A category here is a
 * product name or a path, so it is text of unknown length that has to truncate rather than overlap,
 * and it sits on a baseline with room to breathe. A fixed viewBox cannot do either without measuring
 * the text first, so this one gives up the SVG and keeps the axis.
 *
 * The bar is still a bar: its length is a fraction of a value the axis names, so a reader can
 * compare two rows and check the comparison against the numbers printed beside them.
 */

import { cn } from "../cn.js";
import { adminChartAxis } from "./scale.js";
import type { AdminChartFormatters } from "./table.js";

export type AdminRankItem = { key: string; label: string; value: number };

export function AdminRankChart({
  items,
  formatters,
  ariaLabel,
  integerTicks = true,
  barClassName = "bg-brand-500",
  trackClassName = "bg-zinc-100",
  valueLabel,
  className,
}: {
  items: ReadonlyArray<AdminRankItem>;
  formatters: AdminChartFormatters;
  ariaLabel: string;
  integerTicks?: boolean;
  barClassName?: string;
  trackClassName?: string;
  /** The unit printed after each value, so a bare number is never left to be interpreted. */
  valueLabel?: string;
  className?: string;
}) {
  const peak = items.reduce((highest, item) => Math.max(highest, item.value), 0);
  const axis = adminChartAxis(peak, { ticks: 4, integer: integerTicks });

  return (
    <figure className={cn("w-full", className)}>
      <div className={cn("ml-[9.5rem] grid grid-cols-5 text-[11px] text-zinc-500", "sm:ml-[11.5rem]")}>
        {axis.ticks.map((tick) => (
          <span
            key={tick}
            className={cn(
              "text-center first:text-left last:text-right",
              tick === 0 && "translate-x-0",
            )}
          >
            {formatters.tick(tick)}
          </span>
        ))}
      </div>

      <ul className="mt-3 space-y-2.5" role="img" aria-label={ariaLabel}>
        {items.map((item) => {
          const width = axis.top === 0 ? 0 : Math.min(100, (Math.max(0, item.value) / axis.top) * 100);
          return (
            <li
              key={item.key}
              className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_1fr_auto]"
            >
              <span className="truncate text-sm text-zinc-700" title={item.label}>
                {item.label}
              </span>
              <span className={cn("h-2.5 rounded-full", trackClassName)}>
                <span className={cn("block h-2.5 rounded-full", barClassName)} style={{ width: `${width}%` }} />
              </span>
              <span className="min-w-[5.5rem] text-right text-xs font-semibold text-zinc-900">
                {formatters.value(item.value)}
                {valueLabel ? <span className="ml-1 font-normal text-zinc-500">{valueLabel}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key}>
                <th scope="row">{item.label}</th>
                <td>{formatters.value(item.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
