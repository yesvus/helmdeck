// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, Search, Settings2 } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";
import { AdminCheckbox } from "./form-controls.js";
import { AdminPagination } from "./pagination.js";
import { AdminPopover, AdminPopoverContent, AdminPopoverTrigger } from "./overlays.js";
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

/** What the table knows about one column: whether it is shown, where it is pinned and how wide it is. */
export type AdminDataTableColumnState = {
  visible: boolean;
  pinned?: "left" | "right";
  /** The width the reader dragged the column to, in pixels. */
  size?: number;
  /** Where the column sits among the others. */
  order: number;
};

export type AdminDataTableState = {
  sort: AdminDataTableSort | null;
  filters: AdminDataTableFilter[];
  search: string;
  page: number;
  columns: Record<string, AdminDataTableColumnState>;
  /** The column the rows are grouped by, and the rows that are expanded. */
  groupBy: string | null;
  expandedKeys: Array<string | number>;
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
  /** The columns in the order they are drawn in, with the ones that are hidden left out. */
  visibleColumns: AdminDataTableColumn<T>[];
  toggleColumn: (key: string) => void;
  pinColumn: (key: string, pinned: "left" | "right" | undefined) => void;
  resizeColumn: (key: string, size: number) => void;
  moveColumn: (from: string, to: string) => void;
  /** The column the rows are grouped by. */
  groupBy: string | null;
  setGroupBy: (key: string | null) => void;
  /** The groups the rows fall into, and the rows of each one. */
  groups: Map<AdminDataTableValue, T[]> | null;
  /** Whether a row is expanded. */
  isExpanded: (key: string | number) => boolean;
  toggleExpanded: (key: string | number) => void;
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

function defaultColumnState(columns: Array<{ key: string }>): Record<string, AdminDataTableColumnState> {
  return Object.fromEntries(columns.map((column, index) => [column.key, { visible: true, order: index }]));
}

/**
 * The behaviour layer of the data table: the sorting, the filters, the search, the paging and the
 * columns, over a column definition list.
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
  initialColumns,
  initialGroupBy = null,
  pageSize = 10,
  state: controlledState,
  onStateChange,
}: {
  rows: T[];
  columns: AdminDataTableColumn<T>[];
  initialSort?: AdminDataTableSort | null;
  initialFilters?: AdminDataTableFilter[];
  initialSearch?: string;
  initialColumns?: Record<string, AdminDataTableColumnState>;
  initialGroupBy?: string | null;
  pageSize?: number;
  state?: AdminDataTableState;
  onStateChange?: (state: AdminDataTableState) => void;
}): AdminDataTableControls<T> {
  const [internalState, setInternalState] = useState<AdminDataTableState>(() => ({
    sort: initialSort,
    filters: initialFilters,
    search: initialSearch,
    page: 1,
    columns: initialColumns ?? defaultColumnState(columns),
    groupBy: initialGroupBy ?? null,
    expandedKeys: [],
  }));
  const state = controlledState ?? internalState;

  const setState = useCallback((next: AdminDataTableState) => {
    if (controlledState === undefined) setInternalState(next);
    onStateChange?.(next);
  }, [controlledState, onStateChange]);

  const columnByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );

  const columnState = useMemo(() => state.columns ?? {}, [state.columns]);
  const groupBy = state.groupBy ?? null;

  const visibleColumns = useMemo(() => {
    const ordered = [...columns].sort((left, right) => {
      const leftOrder = columnState[left.key]?.order ?? columns.indexOf(left);
      const rightOrder = columnState[right.key]?.order ?? columns.indexOf(right);
      return leftOrder - rightOrder;
    });
    const shown = ordered.filter((column) => (columnState[column.key]?.visible ?? true));
    // A pinned column is drawn at the edge it is pinned to, whatever the order says.
    return [
      ...shown.filter((column) => columnState[column.key]?.pinned === "left"),
      ...shown.filter((column) => columnState[column.key]?.pinned === undefined),
      ...shown.filter((column) => columnState[column.key]?.pinned === "right"),
    ];
  }, [columns, columnState]);

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

  // The size is bounded once, so the page count and the slice agree: a page size of zero would
  // otherwise count a page and hold no rows.
  // The rows are grouped before the page takes its share, so a group that spans two pages is
  // headed and totalled over the rows it really holds and not over the part of it on this page.
  // The grouping reads the column's value whatever the column's own visibility is, so hiding the
  // column a table is grouped by does not quietly stop the grouping.
  const groups = useMemo(() => {
    if (!groupBy) return null;
    const column = columnByKey.get(groupBy);
    if (!column?.value) return null;
    const collected = new Map<AdminDataTableValue, T[]>();
    for (const row of sortedRows) {
      const value = column.value(row);
      const list = collected.get(value);
      if (list) list.push(row);
      else collected.set(value, [row]);
    }
    // The rows of a group are drawn together: a value that appears twice with another value in
    // between would otherwise have its heading at the first row and its subtotal at the last,
    // with the other value between them.
    const ordered: T[] = [];
    for (const rows of collected.values()) ordered.push(...rows);
    return { collected, ordered };
  }, [sortedRows, groupBy, columnByKey]);

  const groupedRows = groups?.ordered ?? sortedRows;
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const pageCount = Math.max(1, Math.ceil(groupedRows.length / size));
  const page = Math.min(Math.max(1, state.page), pageCount);
  const pageRows = useMemo(
    () => groupedRows.slice((page - 1) * size, page * size),
    [groupedRows, page, size],
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

  const writeColumn = useCallback((key: string, change: Partial<AdminDataTableColumnState>) => {
    const current = columnState[key] ?? { visible: true, order: Object.keys(columnState).length };
    setState({ ...state, columns: { ...columnState, [key]: { ...current, ...change } } });
  }, [columnState, setState, state]);

  const toggleColumn = (key: string) => {
    const current = columnState[key];
    writeColumn(key, { visible: !(current?.visible ?? true) });
  };

  const pinColumn = (key: string, pinned: "left" | "right" | undefined) => {
    writeColumn(key, { pinned });
  };

  const resizeColumn = (key: string, size: number) => {
    writeColumn(key, { size: Math.max(48, Math.round(size)) });
  };

  const moveColumn = (from: string, to: string) => {
    const ordered = [...columns].sort((left, right) =>
      (columnState[left.key]?.order ?? columns.indexOf(left)) - (columnState[right.key]?.order ?? columns.indexOf(right)));
    const fromIndex = ordered.findIndex((column) => column.key === from);
    const toIndex = ordered.findIndex((column) => column.key === to);
    if (fromIndex < 0 || toIndex < 0) return;
    const moved = arrayMove(ordered, fromIndex, toIndex);
    const columns2 = Object.fromEntries(moved.map((column, index) => [
      column.key,
      { ...(columnState[column.key] ?? { visible: true }), order: index },
    ]));
    setState({ ...state, columns: { ...columnState, ...columns2 } });
  };

  const setGroupBy = (key: string | null) => setState({ ...state, groupBy: key });

  const isExpanded = (key: string | number) => state.expandedKeys.includes(key);

  const toggleExpanded = (key: string | number) => {
    const expanded = isExpanded(key)
      ? state.expandedKeys.filter((candidate) => candidate !== key)
      : [...state.expandedKeys, key];
    setState({ ...state, expandedKeys: expanded });
  };

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
    visibleColumns,
    toggleColumn,
    pinColumn,
    resizeColumn,
    moveColumn,
    groupBy,
    setGroupBy,
    groups: groups?.collected ?? null,
    isExpanded,
    toggleExpanded,
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
  initialColumns?: Record<string, AdminDataTableColumnState>;
  state?: AdminDataTableState;
  onStateChange?: (state: AdminDataTableState) => void;
  /** What the toolbar carries beside the search field and the filters. */
  toolbar?: ReactNode;
  /** The panel that holds the column settings. It is off unless the host asks for it. */
  columnSettings?: boolean;
  columnSettingsLabel?: string;
  /** The detail a row shows when it is expanded. */
  expandable?: (row: T) => ReactNode;
  /** The column the rows are grouped by. */
  groupBy?: string | null;
  /** The heading of a group of rows. */
  groupHeader?: (value: AdminDataTableValue, rows: T[]) => ReactNode;
  /** The subtotal of a group of rows. */
  subtotal?: (rows: T[]) => ReactNode;
  expandLabel?: string;
  collapseLabel?: string;
  /**
   * Draws only the rows that are on screen. The row height is fixed, because a row whose height
   * depends on its content would move the window as it is measured.
   */
  virtualize?: {
    /** The height of one row, in pixels. */
    rowHeight: number;
    /** The height of the scroll area, in pixels. */
    height: number;
    /** How many rows are drawn above and below the window, so a scroll does not show a gap. */
    overscan?: number;
  };
};

/**
 * A table with the behaviour layer on top: a search field, the filters, sortable headers, a pager
 * and, when the host asks for it, the column settings. The cell rendering belongs to the caller's
 * column definitions.
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
  initialColumns,
  state,
  onStateChange,
  toolbar,
  columnSettings = false,
  columnSettingsLabel,
  expandable,
  groupBy = null,
  groupHeader,
  subtotal,
  expandLabel,
  collapseLabel,
  virtualize,
}: AdminDataTableProps<T>) {
  const i18n = useAdminMessages();
  const controls = useAdminDataTable<T>({
    rows,
    columns,
    initialSort,
    initialColumns,
    initialGroupBy: groupBy,
    pageSize,
    state,
    onStateChange,
  });

  // A pinned column sits at the edge, and the pinned column before it sits at the edge plus the
  // width of that one, or the two would lie on top of each other. The width is the one the table
  // knows: the width the reader dragged the column to, or the pixel width the host gave it.
  const pinnedOffsets = useMemo(() => {
    const offsets: Record<string, { left?: string; right?: string }> = {};
    const widthOf = (column: AdminDataTableColumn<T>) => {
      const size = controls.state.columns?.[column.key]?.size;
      if (size) return size;
      const width = column.width;
      if (!width) return 0;
      const pixels = /^(\d+(?:\.\d+)?)px$/.exec(width);
      return pixels ? Number(pixels[1]) : 0;
    };
    let left = 0;
    let right = 0;
    for (const column of controls.visibleColumns) {
      const pinned = controls.state.columns?.[column.key]?.pinned;
      if (pinned === "left") {
        offsets[column.key] = { left: `${left}px` };
        left += widthOf(column);
      } else if (pinned === "right") {
        offsets[column.key] = { right: `${right}px` };
        right += widthOf(column);
      }
    }
    return offsets;
  }, [controls.visibleColumns, controls.state.columns]);

  const spanCount = controls.visibleColumns.length + (expandable ? 1 : 0);

  // The group a row belongs to, so that the group heading and the subtotal know which row is the
  // first of the group and which is the last.
  const groupOf = useCallback((row: T) => {
    if (!controls.groups) return null;
    for (const [value, rows] of controls.groups) {
      if (rows.includes(row)) return { value, rows };
    }
    return null;
  }, [controls.groups]);

  // The height a row takes, in the units the window counts.
  const unitsOfRow = useCallback((row: T) => {
    let units = 1;
    const group = groupOf(row);
    if (group) {
      if (group.rows[0] === row) units += 1;
      if (group.rows[group.rows.length - 1] === row) units += 1;
    }
    if (expandable && controls.isExpanded(getKey(row))) units += 1;
    return units;
  }, [groupOf, expandable, controls, getKey]);

  // The rows that are drawn: the ones inside the window, and the space left above and below them
  // so that the scrollbar keeps the length of the whole set.
  const [scrollTop, setScrollTop] = useState(0);
  // The height of a row is never zero, because the window divides by it, and the height of the
  // scroll area is never zero, because the window would be empty.
  const rowHeight = Math.max(1, virtualize?.rowHeight ?? 0);
  const viewportHeight = Math.max(1, virtualize?.height ?? 0);
  const overscan = virtualize?.overscan ?? 2;
  const total = controls.rows.length;
  const windowSize = virtualize ? Math.ceil(viewportHeight / rowHeight) + overscan * 2 : total;

  // A row takes more than one unit of height when the caller draws a group heading, a subtotal or
  // an expanded detail beside it, and the window counts those units, so the scroll follows the
  // content and not only the record rows.
  const unitsBefore = useMemo(() => {
    const units: number[] = [];
    let total = 0;
    for (const row of controls.rows) {
      units.push(total);
      total += unitsOfRow(row);
    }
    units.push(total);
    return units;
  }, [controls.rows, unitsOfRow]);

  const firstRow = virtualize && total > 0
    ? Math.max(0, Math.min(Math.floor(scrollTop / rowHeight) - overscan, total - 1))
    : 0;
  const drawnRows = virtualize
    ? controls.rows.slice(firstRow, Math.min(total, firstRow + windowSize))
    : controls.rows;
  const spaceAbove = virtualize ? (unitsBefore[firstRow] ?? 0) * rowHeight : 0;
  const spaceBelow = virtualize
    ? Math.max(0, ((unitsBefore[total] ?? 0) - (unitsBefore[firstRow + drawnRows.length] ?? 0)) * rowHeight)
    : 0;

  const tableColumns: AdminTableColumn<T>[] = controls.visibleColumns.map((column) => {
    const columnState = controls.state.columns?.[column.key];
    const pinned = columnState?.pinned;
    return {
      key: column.key,
      align: column.align,
      width: columnState?.size ? `${columnState.size}px` : column.width,
      style: pinnedOffsets[column.key],
      // The sticky position is on the body cells as well as on the header, so a pinned column
      // stays put for the whole height of the table and not only for its heading.
      className: cn(
        column.className,
        pinned === "left" && "sticky left-0 z-10 bg-admin-surface",
        pinned === "right" && "sticky right-0 z-10 bg-admin-surface",
      ),
      headerClassName: cn(
        column.headerClassName,
        pinned === "left" && "sticky left-0 z-20 bg-zinc-50",
        pinned === "right" && "sticky right-0 z-20 bg-zinc-50",
      ),
      header: (
        <span className="flex items-center gap-1">
          {column.sortable && column.value ? (
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
          )}
          {columnSettings ? (
            <AdminColumnResizeHandle
              label={`${i18n.common.resize} ${typeof column.header === "string" ? column.header : column.key}`}
              onResize={(size) => controls.resizeColumn(column.key, size)}
            />
          ) : null}
        </span>
      ),
      cell: column.cell,
    };
  });

  const withExpansion = expandable
    ? [
        {
          key: "__expansion",
          header: "",
          className: "w-12",
          cell: (row: T) => {
            const key = getKey(row);
            const expanded = controls.isExpanded(key);
            return (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={expanded ? collapseLabel : expandLabel}
                onClick={() => controls.toggleExpanded(key)}
                className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <ChevronRight aria-hidden="true" className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
              </button>
            );
          },
        } satisfies AdminTableColumn<T>,
        ...tableColumns,
      ]
    : tableColumns;

  return (
    <div className={cn("grid gap-3", className)}>
      {search || filters.length > 0 || toolbar || columnSettings ? (
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
          {columnSettings ? (
            <AdminColumnSettings
              columns={columns}
              controls={controls}
              label={columnSettingsLabel ?? i18n.common.columns}
            />
          ) : null}
        </div>
      ) : null}
      <AdminTable
        columns={withExpansion}
        rows={drawnRows}
        getKey={getKey}
        caption={caption}
        empty={empty}
        rowClassName={rowClassName}
        maxHeight={virtualize?.height}
        onScroll={virtualize ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
        renderBeforeRows={virtualize && spaceAbove > 0 ? (
          <tr aria-hidden="true" style={{ height: spaceAbove }} className="border-0 p-0" />
        ) : undefined}
        renderExtraRows={(row) => {
          const extra: ReactNode[] = [];
          const group = groupOf(row);
          if (group) {
            const isFirst = group.rows[0] === row;
            const isLast = group.rows[group.rows.length - 1] === row;
            if (isFirst && groupHeader) {
              extra.push(
                <tr
                  key="group"
                  className="border-b border-zinc-200 bg-zinc-50"
                  style={virtualize ? { height: rowHeight } : undefined}
                >
                  <td colSpan={spanCount} className="px-5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
                    <span className="flex h-full items-center">{groupHeader(group.value, group.rows)}</span>
                  </td>
                </tr>,
              );
            }
            if (isLast && subtotal) {
              extra.push(
                <tr
                  key="subtotal"
                  className="border-b border-zinc-100 bg-admin-surface-subtle"
                  style={virtualize ? { height: rowHeight } : undefined}
                >
                  <td colSpan={spanCount} className="px-5 text-sm font-semibold text-zinc-900">
                    <span className="flex h-full items-center">{subtotal(group.rows)}</span>
                  </td>
                </tr>,
              );
            }
          }
          const key = getKey(row);
          if (expandable && controls.isExpanded(key)) {
            extra.push(
              <tr
                key="expanded"
                className="border-b border-zinc-100 bg-admin-surface-subtle"
                style={virtualize ? { height: rowHeight } : undefined}
              >
                <td colSpan={spanCount} className="px-5 text-sm text-zinc-700">
                  <span className="flex h-full items-center">{expandable(row)}</span>
                </td>
              </tr>,
            );
          }
          // The space below the last drawn row keeps the scrollbar the length of the whole set.
          if (virtualize && spaceBelow > 0 && row === drawnRows[drawnRows.length - 1]) {
            extra.push(
              <tr key="space-below" aria-hidden="true" style={{ height: spaceBelow }} className="border-0 p-0" />,
            );
          }
          return extra.length ? <>{extra}</> : null;
        }}
      />
      <AdminPagination page={controls.page} pageCount={controls.pageCount} onPageChange={controls.setPage} />
    </div>
  );
}

/** The handle the reader drags to make a column wider or narrower. */
function AdminColumnResizeHandle({ label, onResize }: { label: string; onResize: (size: number) => void }) {
  // The width the column had when the drag started, and where the pointer was then. The width
  // is computed from those two, so a drag of ten pixels then twenty is thirty and not fifty.
  const start = useRef<{ x: number; widthAtStart: number } | null>(null);
  const cell = useRef<HTMLTableCellElement | null>(null);

  return (
    <span
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={(event) => {
        const element = event.currentTarget.closest("th");
        if (!element) return;
        start.current = { x: event.clientX, widthAtStart: element.getBoundingClientRect().width };
        cell.current = element;
        // The capture is on the handle, because a captured move is delivered to the element that
        // captured it and does not travel down to the element that listens for it.
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        onResize(start.current.widthAtStart + (event.clientX - start.current.x));
      }}
      onPointerUp={() => { start.current = null; }}
      onKeyDown={(event) => {
        const element = event.currentTarget.closest("th");
        if (!element) return;
        const width = element.getBoundingClientRect().width;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onResize(width - 16);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onResize(width + 16);
        }
      }}
      className="ml-1 inline-block h-4 w-1 cursor-col-resize rounded bg-zinc-300 hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    />
  );
}

function SortableColumnRow({
  id,
  label,
  visible,
  pinned,
  pinLabels,
  onToggle,
  onPin,
}: {
  id: string;
  label: ReactNode;
  visible: boolean;
  pinned?: "left" | "right";
  pinLabels: { left: string; right: string; none: string };
  onToggle: () => void;
  onPin: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 rounded-md px-1 py-1", isDragging && "bg-zinc-100")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Move ${typeof label === "string" ? label : id}`}
        className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <GripVertical aria-hidden="true" className="h-4 w-4" />
      </button>
      <AdminCheckbox checked={visible} onChange={onToggle} aria-label={`Show ${typeof label === "string" ? label : id}`} />
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">{label}</span>
      <button
        type="button"
        onClick={onPin}
        aria-label={`${pinLabels.none} ${typeof label === "string" ? label : id}`}
        aria-pressed={pinned !== undefined}
        className={cn(
          "rounded-md border px-2 py-0.5 text-xs font-semibold",
          pinned === "left" && "border-brand-500 bg-brand-50 text-admin-brand-text",
          pinned === "right" && "border-brand-500 bg-brand-50 text-admin-brand-text",
          !pinned && "border-zinc-300 text-zinc-500 hover:bg-zinc-50",
        )}
      >
        {pinned === "left" ? pinLabels.left : pinned === "right" ? pinLabels.right : pinLabels.none}
      </button>
    </li>
  );
}

/** The panel that holds the column settings: which columns are shown, where they are pinned and in what order. */
function AdminColumnSettings<T>({
  columns,
  controls,
  label,
}: {
  columns: AdminDataTableColumn<T>[];
  controls: AdminDataTableControls<T>;
  label: string;
}) {
  const i18n = useAdminMessages();
  const [open, setOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ordered = [...columns].sort((left, right) =>
    (controls.state.columns?.[left.key]?.order ?? columns.indexOf(left))
    - (controls.state.columns?.[right.key]?.order ?? columns.indexOf(right)));

  return (
    <AdminPopover open={open} onOpenChange={setOpen}>
      <AdminPopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-300 bg-admin-surface px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Settings2 aria-hidden="true" className="h-4 w-4" />
          {label}
        </button>
      </AdminPopoverTrigger>
      <AdminPopoverContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event: DragEndEvent) => {
            if (!event.over || event.active.id === event.over.id) return;
            controls.moveColumn(String(event.active.id), String(event.over.id));
          }}
        >
          <SortableContext items={ordered.map((column) => column.key)} strategy={verticalListSortingStrategy}>
            <ul className="grid gap-1">
              {ordered.map((column) => {
                const state = controls.state.columns?.[column.key];
                return (
                  <SortableColumnRow
                    key={column.key}
                    id={column.key}
                    label={column.header}
                    visible={state?.visible ?? true}
                    pinned={state?.pinned}
                    pinLabels={{
                      left: i18n.common.pinLeft,
                      right: i18n.common.pinRight,
                      none: i18n.common.pin,
                    }}
                    onToggle={() => controls.toggleColumn(column.key)}
                    onPin={() => {
                      const current = state?.pinned;
                      controls.pinColumn(column.key, current === "left" ? "right" : current === "right" ? undefined : "left");
                    }}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </AdminPopoverContent>
    </AdminPopover>
  );
}
