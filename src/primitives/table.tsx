// SPDX-License-Identifier: MIT
"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";
import { AdminCheckbox } from "./form-controls.js";

export type AdminTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  width?: string;
  className?: string;
  headerClassName?: string;
  /** The header cell itself, for a caller that measures it. */
  headerRef?: (element: HTMLTableCellElement | null) => void;
  /** What the cells of this column carry, such as the offset of a pinned column. */
  style?: CSSProperties;
};

export type AdminTableSelection = {
  selectedKeys: Set<string | number>;
  onSelectionChange: (selectedKeys: Set<string | number>) => void;
  label: string;
  selectAllLabel: string;
};

export function AdminTable<T>({
  columns,
  rows,
  getKey,
  caption,
  empty,
  rowClassName,
  className,
  selection,
}: {
  columns: AdminTableColumn<T>[];
  rows: T[];
  getKey: (row: T) => string | number;
  caption?: string;
  empty?: ReactNode;
  rowClassName?: (row: T) => string;
  className?: string;
  selection?: AdminTableSelection;
}) {
  const i18n = useAdminMessages();
  const allSelected = rows.length > 0 && rows.every((row) => selection?.selectedKeys.has(getKey(row)));
  const someSelected = rows.some((row) => selection?.selectedKeys.has(getKey(row)));
  return (
    <div className={cn("overflow-x-auto rounded-admin-card border border-zinc-200 bg-admin-surface", className)}>
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50">
            {selection ? (
              <th scope="col" className="w-12 px-3 py-3 text-left">
                <AdminCheckbox
                  aria-label={selection.selectAllLabel}
                  checked={allSelected}
                  disabled={rows.length === 0}
                  indeterminate={someSelected && !allSelected}
                  onChange={(event) => {
                    const next = new Set(selection.selectedKeys);
                    rows.forEach((row) => event.target.checked ? next.add(getKey(row)) : next.delete(getKey(row)));
                    selection.onSelectionChange(next);
                  }}
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                ref={column.headerRef}
                style={{ width: column.width, ...column.style }}
                className={cn(
                  "px-5 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500",
                  column.align === "right" ? "text-right" : "text-left",
                  column.headerClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selection ? 1 : 0)} className="px-5 py-10 text-center text-sm text-zinc-500">
                {empty ?? i18n.common.tableEmpty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getKey(row)}
                className={cn(
                  "border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50",
                  rowClassName?.(row),
                )}
              >
                {selection ? (
                  <td className="w-12 px-3 py-4 align-middle">
                    <AdminCheckbox
                      aria-label={`${selection.label} ${String(getKey(row))}`}
                      checked={selection.selectedKeys.has(getKey(row))}
                      onChange={(event) => {
                        const next = new Set(selection.selectedKeys);
                        if (event.target.checked) next.add(getKey(row));
                        else next.delete(getKey(row));
                        selection.onSelectionChange(next);
                      }}
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-5 py-4 align-middle",
                      column.align === "right" && "text-right",
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
