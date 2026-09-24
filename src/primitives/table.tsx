// SPDX-License-Identifier: MIT
"use client";

import type { ReactNode } from "react";
import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";

export type AdminTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  width?: string;
  className?: string;
  headerClassName?: string;
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
    <div className={cn("overflow-x-auto rounded-xl border border-zinc-200 bg-admin-surface", className)}>
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50">
            {selection ? (
              <th scope="col" className="w-12 px-3 py-3 text-left">
                <input
                  type="checkbox"
                  aria-label={selection.selectAllLabel}
                  checked={allSelected}
                  ref={(element) => { if (element) element.indeterminate = someSelected && !allSelected; }}
                  onChange={(event) => {
                    const next = new Set(selection.selectedKeys);
                    rows.forEach((row) => event.target.checked ? next.add(getKey(row)) : next.delete(getKey(row)));
                    selection.onSelectionChange(next);
                  }}
                  className="h-4 w-4 rounded border-zinc-300 accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{ width: column.width }}
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
                    <input
                      type="checkbox"
                      aria-label={`${selection.label} ${String(getKey(row))}`}
                      checked={selection.selectedKeys.has(getKey(row))}
                      onChange={(event) => {
                        const next = new Set(selection.selectedKeys);
                        if (event.target.checked) next.add(getKey(row));
                        else next.delete(getKey(row));
                        selection.onSelectionChange(next);
                      }}
                      className="h-4 w-4 rounded border-zinc-300 accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
