"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "./button";

export type AdminPaginationLabels = {
  nav: string;
  previous: string;
  next: string;
  page: (page: number) => string;
  more: string;
};

export const defaultPaginationLabels: AdminPaginationLabels = {
  nav: "Pagination",
  previous: "Previous",
  next: "Next",
  page: (page) => `Page ${page}`,
  more: "More pages",
};

function pageWindow(page: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const output: Array<number | "ellipsis"> = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) {
      output.push("ellipsis");
    }
    output.push(value);
    previous = value;
  }
  return output;
}

export function AdminPagination({
  page,
  pageCount,
  onPageChange,
  labels,
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  labels?: Partial<AdminPaginationLabels>;
  className?: string;
}) {
  const merged = { ...defaultPaginationLabels, ...labels };

  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav aria-label={merged.nav} className={className}>
      <ul className="flex flex-row flex-wrap items-center justify-center gap-1">
        <li>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={merged.previous}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{merged.previous}</span>
          </Button>
        </li>
        {pageWindow(page, pageCount).map((entry, index) =>
          entry === "ellipsis" ? (
            <li key={`ellipsis-${index}`} aria-hidden className="flex h-8 w-9 items-center justify-center text-zinc-400">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">{merged.more}</span>
            </li>
          ) : (
            <li key={entry}>
              <Button
                variant={entry === page ? "secondary" : "ghost"}
                size="sm"
                className="w-9 px-0"
                aria-label={merged.page(entry)}
                aria-current={entry === page ? "page" : undefined}
                onClick={() => onPageChange(entry)}
              >
                {entry}
              </Button>
            </li>
          ),
        )}
        <li>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label={merged.next}
          >
            <span className="hidden sm:inline">{merged.next}</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </li>
      </ul>
    </nav>
  );
}
