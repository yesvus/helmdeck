// SPDX-License-Identifier: MIT
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminInterfaceLocale } from "../i18n.js";
import {
  addAdminMonths,
  adminDayFromIndex,
  adminDayIndex,
  adminDayOfWeek,
  adminFirstDayOfWeek,
  daysInAdminMonth,
  formatAdminDay,
  parseAdminDay,
  parseAdminMonth,
} from "./dates.js";
import type { AdminCalendarDay } from "./dates.js";

export type AdminCalendarRange = {
  from?: string;
  to?: string;
};

export type AdminCalendarProps = {
  /** The selected day, as `YYYY-MM-DD`. */
  selected?: string;
  range?: AdminCalendarRange;
  onSelect?: (day: string) => void;
  onRangeChange?: (range: AdminCalendarRange) => void;
  /** The month on screen, as `YYYY-MM`. */
  month?: string;
  defaultMonth?: string;
  onMonthChange?: (month: string) => void;
  min?: string;
  max?: string;
  locale?: string;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
  className?: string;
};

const dayCellClassName =
  "flex h-9 w-9 items-center justify-center rounded-full text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * A month of days, on the ARIA grid pattern. The reader moves through the days with the arrow
 * keys, through the weeks with the home and end keys, and through the months with the page keys.
 */
export function AdminCalendar({
  selected,
  range,
  onSelect,
  onRangeChange,
  month,
  defaultMonth,
  onMonthChange,
  min,
  max,
  locale,
  label = "Calendar",
  previousLabel = "Previous month",
  nextLabel = "Next month",
  className,
}: AdminCalendarProps) {
  const { interfaceLocale } = useAdminInterfaceLocale();
  const resolvedLocale = locale ?? interfaceLocale;
  const todayIndex = adminDayIndex(todayAdminDay());
  const selectedIndex = selected ? (parseAdminDay(selected) ? adminDayIndex(parseAdminDay(selected)!) : undefined) : undefined;
  const fromIndex = range?.from && parseAdminDay(range.from) ? adminDayIndex(parseAdminDay(range.from)!) : undefined;
  const toIndex = range?.to && parseAdminDay(range.to) ? adminDayIndex(parseAdminDay(range.to)!) : undefined;
  const minIndex = min && parseAdminDay(min) ? adminDayIndex(parseAdminDay(min)!) : undefined;
  const maxIndex = max && parseAdminDay(max) ? adminDayIndex(parseAdminDay(max)!) : undefined;

  const [internalMonth, setInternalMonth] = useState(() => {
    const explicit = defaultMonth ?? month;
    const parsed = explicit ? parseAdminMonth(explicit) : null;
    if (parsed) return parsed;
    const anchor = selected ? parseAdminDay(selected) : null;
    return { year: anchor?.year ?? todayIndexYear(todayIndex), month: anchor?.month ?? todayIndexMonth(todayIndex) };
  });
  const current = month ? (parseAdminMonth(month) ?? internalMonth) : internalMonth;

  const setMonth = (next: { year: number; month: number }) => {
    if (month === undefined) setInternalMonth(next);
    onMonthChange?.(`${String(next.year).padStart(4, "0")}-${String(next.month).padStart(2, "0")}`);
  };

  // The focused day has to be a day the calendar draws. A calendar that opens on another month
  // and keeps the focus on today's day, which it does not draw, leaves the reader with no day to
  // land on, so the focus starts on the first day of the month on screen.
  const [focusedIndex, setFocusedIndex] = useState<number>(() => {
    const anchor = selectedIndex ?? todayIndex;
    const day = adminDayFromIndex(anchor);
    if (day.year === current.year && day.month === current.month) return anchor;
    return adminDayIndex({ year: current.year, month: current.month, day: 1 });
  });
  const dayRefs = useRef(new Map<number, HTMLButtonElement>());

  const firstDay = adminFirstDayOfWeek(resolvedLocale);
  // The locale counts the week from Monday, the calendar counts it from Sunday.
  const firstWeekday = firstDay % 7;
  const firstOfMonth = adminDayIndex({ year: current.year, month: current.month, day: 1 });
  const offset = (adminDayOfWeek(firstOfMonth) - firstWeekday + 7) % 7;
  const gridStart = firstOfMonth - offset;
  const days = useMemo(() => {
    const weeks: number[][] = [];
    const count = Math.ceil((offset + daysInAdminMonth(current.year, current.month)) / 7);
    for (let week = 0; week < count; week += 1) {
      const row: number[] = [];
      for (let day = 0; day < 7; day += 1) row.push(gridStart + week * 7 + day);
      weeks.push(row);
    }
    return weeks;
  }, [current.year, current.month, gridStart, offset]);

  const weekdayNames = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(resolvedLocale, { weekday: "short" });
    // The fourth of January 1970 is a Sunday, so it is the day the week names are counted from.
    const sundayIndex = 3;
    return Array.from({ length: 7 }, (_, index) => formatter.format(
      new Date((sundayIndex + ((firstWeekday + index) % 7)) * 86_400_000),
    ));
  }, [resolvedLocale, firstWeekday]);

  const monthName = useMemo(
    () => new Intl.DateTimeFormat(resolvedLocale, { month: "long", year: "numeric" })
      .format(new Date(Date.UTC(current.year, current.month - 1, 1))),
    [resolvedLocale, current.year, current.month],
  );

  const fullDate = (index: number) => {
    const day = adminDayFromIndex(index);
    return new Intl.DateTimeFormat(resolvedLocale, { dateStyle: "full" })
      .format(new Date(Date.UTC(day.year, day.month - 1, day.day, 12)));
  };

  const move = (from: number, key: string) => {
    const weekStart = from - ((adminDayOfWeek(from) - firstWeekday + 7) % 7);
    let next: number | undefined;
    if (key === "ArrowLeft") next = from - 1;
    else if (key === "ArrowRight") next = from + 1;
    else if (key === "ArrowUp") next = from - 7;
    else if (key === "ArrowDown") next = from + 7;
    else if (key === "Home") next = weekStart;
    else if (key === "End") next = weekStart + 6;
    else if (key === "PageUp" || key === "PageDown") {
      const day = adminDayFromIndex(from);
      const month = addAdminMonths({ year: day.year, month: day.month }, key === "PageUp" ? -1 : 1);
      const daysInTarget = daysInAdminMonth(month.year, month.month);
      next = adminDayIndex({ year: month.year, month: month.month, day: Math.min(day.day, daysInTarget) });
    }
    if (next === undefined) return;
    const target = adminDayFromIndex(next);
    setFocusedIndex(next);
    if (target.month !== current.month || target.year !== current.year) {
      setMonth({ year: target.year, month: target.month });
    }
  };

  useEffect(() => {
    dayRefs.current.get(focusedIndex)?.focus();
  }, [focusedIndex, current.year, current.month]);

  const isSelected = (index: number) => index === selectedIndex;
  const isInRange = (index: number) => fromIndex !== undefined && toIndex !== undefined && index > fromIndex && index < toIndex;
  const isRangeEdge = (index: number) => index === fromIndex || index === toIndex;

  const choose = (index: number) => {
    const value = formatAdminDay(adminDayFromIndex(index));
    if (onRangeChange) {
      // A start that is not a day is not a start, and the range begins again from this one.
      const start = range?.from ? parseAdminDay(range.from) : null;
      if (!start || !range || range.to) {
        onRangeChange({ from: value });
      } else if (index < adminDayIndex(start)) {
        onRangeChange({ from: value, to: range.from });
      } else {
        onRangeChange({ from: range.from, to: value });
      }
      return;
    }
    onSelect?.(value);
    setFocusedIndex(index);
  };

  return (
    <div className={cn("grid gap-2 p-2", className)}>
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          aria-label={previousLabel}
          onClick={() => setMonth(addAdminMonths(current, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </button>
        <span aria-live="polite" className="text-sm font-semibold text-zinc-900">{monthName}</span>
        <button
          type="button"
          aria-label={nextLabel}
          onClick={() => setMonth(addAdminMonths(current, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div role="grid" aria-label={label} className="grid gap-1">
        <div role="rowgroup">
          <div role="row" className="grid grid-cols-7">
            {weekdayNames.map((name, index) => (
              <div key={`${name}-${index}`} role="columnheader" aria-label={name} className="flex h-8 items-center justify-center text-xs font-semibold uppercase text-zinc-400">
                {name}
              </div>
            ))}
          </div>
        </div>
        <div role="rowgroup">
          {days.map((week) => (
            <div role="row" key={week[0]} className="grid grid-cols-7">
              {week.map((index) => {
                const day = adminDayFromIndex(index);
                const outside = day.month !== current.month;
                const disabled = (minIndex !== undefined && index < minIndex) || (maxIndex !== undefined && index > maxIndex);
                const selectedDay = isSelected(index);
                return (
                  <div
                    key={index}
                    role="gridcell"
                    aria-selected={selectedDay || isRangeEdge(index)}
                    className="flex items-center justify-center"
                  >
                    <button
                      type="button"
                      ref={(element) => {
                        if (element) dayRefs.current.set(index, element);
                        else dayRefs.current.delete(index);
                      }}
                      tabIndex={index === focusedIndex ? 0 : -1}
                      disabled={disabled}
                      aria-label={fullDate(index)}
                      aria-current={index === todayIndex ? "date" : undefined}
                      onClick={() => choose(index)}
                      onKeyDown={(event) => {
                        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return;
                        event.preventDefault();
                        move(index, event.key);
                      }}
                      className={cn(
                        dayCellClassName,
                        outside && "text-zinc-300",
                        isInRange(index) && "rounded-none bg-zinc-100",
                        isRangeEdge(index) && "bg-brand-500 text-admin-on-brand",
                        selectedDay && "bg-brand-600 text-admin-on-brand",
                        index === todayIndex && !selectedDay && "font-semibold text-admin-brand-text",
                      )}
                    >
                      {day.day}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function todayAdminDay(): AdminCalendarDay {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function todayIndexYear(index: number): number {
  return adminDayFromIndex(index).year;
}

function todayIndexMonth(index: number): number {
  return adminDayFromIndex(index).month;
}

export type AdminDatePickerProps = {
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  locale?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
};

function formatAdminDate(value: string, locale: string): string {
  const day = parseAdminDay(value);
  if (!day) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" })
    .format(new Date(Date.UTC(day.year, day.month - 1, day.day, 12)));
}

/**
 * A field that picks a day. The field is a button that opens a calendar, so the reader gets the
 * calendar's own keyboard and the day's own name rather than a browser widget the theme cannot
 * reach.
 */
export function AdminDatePicker({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  locale,
  id,
  className,
  disabled = false,
}: AdminDatePickerProps) {
  const { interfaceLocale } = useAdminInterfaceLocale();
  const resolvedLocale = locale ?? interfaceLocale;
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-admin-surface px-3 text-sm text-zinc-900",
          "outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          "disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400",
        )}
      >
        <span className={cn(!value && "text-zinc-400")}>
          {value ? formatAdminDate(value, resolvedLocale) : (placeholder ?? label)}
        </span>
        <CalendarIcon aria-hidden="true" className="h-4 w-4 text-zinc-400" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 rounded-admin-card border border-zinc-200 bg-admin-surface p-1 shadow-xl">
          <AdminCalendar
            label={label}
            locale={resolvedLocale}
            selected={value}
            min={min}
            max={max}
            onSelect={(day) => {
              onChange?.(day);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export type AdminDateRangePickerProps = {
  label: string;
  from?: string;
  to?: string;
  onChange?: (range: AdminCalendarRange) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  locale?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * A field that picks a range of days: the first day opens the calendar, the second day closes the
 * range.
 */
export function AdminDateRangePicker({
  label,
  from,
  to,
  onChange,
  placeholder,
  min,
  max,
  locale,
  id,
  className,
  disabled = false,
}: AdminDateRangePickerProps) {
  const { interfaceLocale } = useAdminInterfaceLocale();
  const resolvedLocale = locale ?? interfaceLocale;
  const [open, setOpen] = useState(false);

  const summary = from && to
    ? `${formatAdminDate(from, resolvedLocale)} – ${formatAdminDate(to, resolvedLocale)}`
    : from
      ? `${formatAdminDate(from, resolvedLocale)} – …`
      : "";

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-admin-surface px-3 text-sm text-zinc-900",
          "outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          "disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400",
        )}
      >
        <span className={cn(!summary && "text-zinc-400")}>{summary || (placeholder ?? label)}</span>
        <CalendarIcon aria-hidden="true" className="h-4 w-4 text-zinc-400" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 rounded-admin-card border border-zinc-200 bg-admin-surface p-1 shadow-xl">
          <AdminCalendar
            label={label}
            locale={resolvedLocale}
            range={{ from, to }}
            min={min}
            max={max}
            onRangeChange={(range) => {
              onChange?.(range);
              if (range.from && range.to) setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function CalendarIcon({ className, ...props }: { className?: string } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
    </svg>
  );
}
