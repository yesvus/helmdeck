// SPDX-License-Identifier: MIT
"use client";

import Link from "next/link.js";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminNavGroup } from "../adapters/index.js";
import { useAdminShell } from "./context.js";
import type { AdminShellLabels } from "./labels.js";
import { mergeAdminLabels } from "./labels.js";
import { useAdminMessages } from "../i18n.js";

export type AdminSearchEntry = {
  href: string;
  label: string;
  group?: string;
  terms?: string;
};

function normalize(value: string, locale: string) {
  return value.toLocaleLowerCase(locale).normalize("NFKD");
}

export function AdminSearch({
  groups,
  collapsed = false,
  onExpand,
  entries,
  labels,
  normalize: normalizeProp,
}: {
  groups?: AdminNavGroup[];
  collapsed?: boolean;
  onExpand?: () => void;
  entries?: AdminSearchEntry[];
  labels?: Partial<AdminShellLabels>;
  normalize?: (value: string) => string;
}) {
  const shell = useAdminShell();
  const i18n = useAdminMessages();
  const mergedLabels = mergeAdminLabels({ ...i18n.shell, ...shell?.labels, ...labels });
  const normalizeText = useMemo(
    () =>
      normalizeProp ??
      shell?.searchNormalize ??
      ((value: string) => normalize(value, i18n.searchLocale)),
    [i18n.searchLocale, normalizeProp, shell?.searchNormalize],
  );
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = normalizeText(query.trim());
  const tokens = normalized.split(/\s+/).filter(Boolean);

  const results = useMemo(() => {
    if (!tokens.length) {
      return [];
    }
    const nav = groups ?? shell?.nav ?? [];
    const navigationEntries: AdminSearchEntry[] = nav.flatMap((group) =>
      group.items.map((item) => ({
        href: item.href,
        label: item.label,
        group: group.label,
        terms: [item.shortLabel ?? "", ...(item.keywords ?? [])].join(" "),
      })),
    );
    const allEntries = [...(entries ?? shell?.searchEntries ?? []), ...navigationEntries];
    return allEntries
      .filter((entry) => {
        const haystack = normalizeText(`${entry.label} ${entry.group ?? ""} ${entry.terms ?? ""}`);
        return tokens.every((token) => haystack.includes(token));
      })
      .filter(
        (entry, index, list) =>
          list.findIndex(
            (candidate) => candidate.href === entry.href && candidate.label === entry.label,
          ) === index,
      )
      .slice(0, 12);
  }, [entries, groups, normalizeText, shell, tokens]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        onExpand?.();
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (event.key === "Escape") {
        setQuery("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExpand]);

  if (collapsed) {
    return (
      <div className="border-b border-zinc-100 p-3">
        <button
          type="button"
          onClick={() => {
            onExpand?.();
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-brand-500 hover:bg-admin-surface hover:text-admin-brand-text"
          aria-label={mergedLabels.searchLabel}
          title={mergedLabels.searchHint}
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative border-b border-zinc-100 p-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={mergedLabels.searchPlaceholder}
          aria-label={mergedLabels.searchLabel}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:bg-admin-surface"
        />
      </label>
      {normalized ? (
        <div className="absolute left-3 right-3 top-[3.35rem] z-50 overflow-hidden rounded-lg border border-zinc-200 bg-admin-surface shadow-xl">
          {results.length ? (
            results.map((entry) => (
              <Link
                key={`${entry.href}:${entry.label}`}
                href={entry.href}
                onClick={() => setQuery("")}
                className="block border-b border-zinc-100 px-3 py-2.5 last:border-0 hover:bg-admin-surface-muted"
              >
                <span className="block text-sm font-semibold text-zinc-900">{entry.label}</span>
                {entry.group ? (
                  <span className="text-xs text-zinc-400">{entry.group}</span>
                ) : null}
              </Link>
            ))
          ) : (
            <p className="px-3 py-4 text-sm text-zinc-500">{mergedLabels.searchNoResults}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
