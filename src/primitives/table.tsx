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

export function AdminTable<T>({
  columns,
  rows,
  getKey,
  caption,
  empty,
  rowClassName,
  className,
}: {
  columns: AdminTableColumn<T>[];
  rows: T[];
  getKey: (row: T) => string | number;
  caption?: string;
  empty?: ReactNode;
  rowClassName?: (row: T) => string;
  className?: string;
}) {
  const i18n = useAdminMessages();
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-zinc-200 bg-admin-surface", className)}>
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50">
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
              <td colSpan={columns.length} className="px-5 py-10 text-center text-sm text-zinc-500">
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
