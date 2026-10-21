// SPDX-License-Identifier: MIT
"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";
import { AdminPagination } from "./pagination.js";
import { AdminTable } from "./table.js";
import type { AdminTableColumn } from "./table.js";

export type AdminDataTableValue = string | number | boolean | null | undefined;

export type AdminDataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /**
   * How the column's value is read. A column without one cannot be sorted, filtered or searched,
   * because the table reads values and not the nodes a cell renders.
   */
  value?: (row: T) => AdminDataTableValue;
  sortable?: boolean;
  align?: "left" | "right";
  width?: string;
  className?: string;
  headerClassName?: string;
};

export type AdminDataTableSort = {
  key: string;
  direction: "asc" | "desc";
};

export type AdminDataTableFilter = {
  key: string;
  value: string;
  /** How a row's value is compared with the filter's value. */
  match?: (rowValue: AdminDataTableValue, filterValue: string) => boolean;
};

export type AdminDataTableState = {
  sort: AdminDataTableSort | null;
  filters: AdminDataTableFilter[];
  search: string;
  page: number;
};

export type AdminDataTableControls<T> = {
  /** The rows on the current page. */
  rows: T[];
  /** The rows that passed the filters and the search, before the page took its share. */
  matchedRows: T[];
  total: number;
  page: number;
  pageCount: number;
  state: AdminDataTableState;
  setState: (state: AdminDataTableState) => void;
  toggleSort: (key: string) => void;
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  setSearch: (term: string) => void;
  setPage: (page: number) => void;
};

function defaultMatch(rowValue: AdminDataTableValue, filterValue: string) {
  if (rowValue === null || rowValue === undefined) return false;
  if (typeof rowValue === "number" || typeof rowValue === "boolean") {
    return String(rowValue).toLocaleLowerCase() === filterValue.trim().toLocaleLowerCase();
  }
  return String(rowValue).toLocaleLowerCase().includes(filterValue.trim().toLocaleLowerCase());
}

function compareValues(left: AdminDataTableValue, right: AdminDataTableValue) {
  if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

/**
 * The behaviour layer of the data table: the sorting, the filters, the search and the paging, over
 * a column definition list.
 *
 * The sorting cycles ascending, descending and back to the rows' own order, one column at a time,
 * the same way the resource list's own control does it.
 */
export function useAdminDataTable<T>({
  rows,
  columns,
  initialSort = null,
  initialFilters = [],
  initialSearch = "",
  pageSize = 10,
  state: controlledState,
  onStateChange,
}: {
  rows: T[];
  columns: AdminDataTableColumn<T>[];
  initialSort?: AdminDataTableSort | null;
  initialFilters?: AdminDataTableFilter[];
  initialSearch?: string;
  pageSize?: number;
  state?: AdminDataTableState;
  onStateChange?: (state: AdminDataTableState) => void;
}): AdminDataTableControls<T> {
  const [internalState, setInternalState] = useState<AdminDataTableState>({
    sort: initialSort,
    filters: initialFilters,
    search: initialSearch,
    page: 1,
  });
  const state = controlledState ?? internalState;

  const setState = (next: AdminDataTableState) => {
    if (controlledState === undefined) setInternalState(next);
    onStateChange?.(next);
  };

  const columnByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );

  const matchedRows = useMemo(() => {
    const term = state.search.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      for (const filter of state.filters) {
        if (!filter.value.trim()) continue;
        const column = columnByKey.get(filter.key);
        if (!column?.value) continue;
        const match = filter.match ?? defaultMatch;
        if (!match(column.value(row), filter.value)) return false;
      }
      if (!term) return true;
      return columns.some((column) => {
        if (!column.value) return false;
        const value = column.value(row);
        if (value === null || value === undefined) return false;
        return String(value).toLocaleLowerCase().includes(term);
      });
    });
  }, [rows, columns, columnByKey, state.filters, state.search]);

  const sortedRows = useMemo(() => {
    const sort = state.sort;
    if (!sort) return matchedRows;
    const column = columnByKey.get(sort.key);
    if (!column?.value) return matchedRows;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...matchedRows].sort((left, right) => compareValues(column.value!(left), column.value!(right)) * direction);
  }, [matchedRows, columnByKey, state.sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / Math.max(1, pageSize)));
  const page = Math.min(Math.max(1, state.page), pageCount);
  const pageRows = useMemo(
    () => sortedRows.slice((page - 1) * pageSize, page * pageSize),
    [sortedRows, page, pageSize],
  );

  const toggleSort = (key: string) => {
    const current = state.sort;
    const next = current?.key !== key
      ? { key, direction: "asc" as const }
      : current.direction === "asc"
        ? { key, direction: "desc" as const }
        : null;
    setState({ ...state, sort: next, page: 1 });
  };

  const setFilter = (key: string, value: string) => {
    const filters = state.filters.filter((filter) => filter.key !== key);
    if (value.trim()) filters.push({ key, value });
    setState({ ...state, filters, page: 1 });
  };

  const clearFilters = () => setState({ ...state, filters: [], page: 1 });

  const setSearch = (term: string) => setState({ ...state, search: term, page: 1 });

  const setPage = (next: number) => setState({ ...state, page: next });

  return {
    rows: pageRows,
    matchedRows: sortedRows,
    total: sortedRows.length,
    page,
    pageCount,
    state,
    setState,
    toggleSort,
    setFilter,
    clearFilters,
    setSearch,
    setPage,
  };
}

export type AdminDataTableProps<T> = {
  columns: AdminDataTableColumn<T>[];
  rows: T[];
  getKey: (row: T) => string | number;
  caption?: string;
  empty?: ReactNode;
  rowClassName?: (row: T) => string;
  className?: string;
  /** The filters the toolbar carries. Each one is a column key and the value it filters by. */
  filters?: Array<{ key: string; label: string; placeholder?: string }>;
  search?: boolean;
  searchLabel?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  initialSort?: AdminDataTableSort | null;
  state?: AdminDataTableState;
  onStateChange?: (state: AdminDataTableState) => void;
  /** What the toolbar carries beside the search field and the filters. */
  toolbar?: ReactNode;
};

/**
 * A table with the behaviour layer on top: a search field, the filters, sortable headers and a
 * pager. The cell rendering belongs to the caller's column definitions.
 */
export function AdminDataTable<T>({
  columns,
  rows,
  getKey,
  caption,
  empty,
  rowClassName,
  className,
  filters = [],
  search = true,
  searchLabel,
  searchPlaceholder,
  pageSize = 10,
  initialSort = null,
  state,
  onStateChange,
  toolbar,
}: AdminDataTableProps<T>) {
  const i18n = useAdminMessages();
  const controls = useAdminDataTable<T>({ rows, columns, initialSort, pageSize, state, onStateChange });

  const tableColumns: AdminTableColumn<T>[] = columns.map((column) => ({
    key: column.key,
    align: column.align,
    width: column.width,
    className: column.className,
    headerClassName: column.headerClassName,
    header: column.sortable && column.value ? (
      <button
        type="button"
        onClick={() => controls.toggleSort(column.key)}
        aria-pressed={controls.state.sort?.key === column.key}
        className="inline-flex items-center gap-1 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {column.header}
        {controls.state.sort?.key === column.key ? (
          <>
            {controls.state.sort.direction === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="sr-only">
              {controls.state.sort.direction === "asc" ? i18n.common.ascending : i18n.common.descending}
            </span>
          </>
        ) : null}
      </button>
    ) : (
      column.header
    ),
    cell: column.cell,
  }));

  return (
    <div className={cn("grid gap-3", className)}>
      {search || filters.length > 0 || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {search ? (
            <label className="relative flex min-w-48 flex-1 items-center">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-zinc-400" />
              <span className="sr-only">{searchLabel ?? i18n.common.search}</span>
              <input
                type="search"
                value={controls.state.search}
                onChange={(event) => controls.setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-lg border border-zinc-300 bg-admin-surface pl-9 pr-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
          ) : null}
          {filters.map((filter) => (
            <input
              key={filter.key}
              type="search"
              aria-label={filter.label}
              value={controls.state.filters.find((entry) => entry.key === filter.key)?.value ?? ""}
              onChange={(event) => controls.setFilter(filter.key, event.target.value)}
              placeholder={filter.placeholder}
              className="h-9 rounded-lg border border-zinc-300 bg-admin-surface px-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          ))}
          {toolbar}
        </div>
      ) : null}
      <AdminTable
        columns={tableColumns}
        rows={controls.rows}
        getKey={getKey}
        caption={caption}
        empty={empty}
        rowClassName={rowClassName}
      />
      <AdminPagination page={controls.page} pageCount={controls.pageCount} onPageChange={controls.setPage} />
    </div>
  );
}
